import {reactive, readonly} from 'vue';
import {Notice, TFile} from 'obsidian';

import {resolveLanguageSetting, translate} from '../i18n';
import type WiseMindObsidianPlugin from '../main';
import type {
  TranscriptionConnectionStatus,
  TranscriptionDetail,
  TranscriptionMarkKind,
  TranscriptionRecord,
  TranscriptionRuntimeEvent,
  TranscriptionScene,
  TranscriptionSegment,
} from '../types';

import {
  type AudioCaptureController,
  checkAudioCaptureAvailability,
  MicrophoneCaptureError,
  startAudioCapture,
} from './audioCapture';
import {normalizeConfirmedTranscriptionSegments} from './transcriptionLiveNoteContent';
import {TranscriptionLiveNoteWriter} from './transcriptionLiveNoteWriter';
import {parseTranscriptionOrganizationMarkdown} from './transcriptionOrganization';
import {appendTranscriptionToNote, saveTranscriptionAsNewNote} from './transcriptionResult';
import {WiseMindTranscriptionSocket} from './transcriptionSocket';

export type TranscriptionControllerStatus =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'completed'
  | 'error';

type ControllerState = {
  status: TranscriptionControllerStatus;
  connectionStatus: TranscriptionConnectionStatus;
  record: TranscriptionRecord | null;
  segments: TranscriptionSegment[];
  partialText: string;
  audioLevel: number;
  elapsedMs: number;
  lastSavedAt: number;
  error: string;
  membershipLimitReason: 'session' | 'monthly' | '';
  completedDetail: TranscriptionDetail | null;
  liveNoteWriteStatus: 'idle' | 'writing' | 'completed' | 'error';
  liveNoteTargetPath: string;
};

type StartOptions = {
  title?: string;
  scenario: TranscriptionScene;
  providerId?: string;
  deviceId?: string;
  saveAudio: boolean;
  targetPath?: string;
  liveWriteToNote?: boolean;
};

export class TranscriptionController {
  private readonly mutableState = reactive<ControllerState>({
    status: 'idle',
    connectionStatus: 'idle',
    record: null,
    segments: [],
    partialText: '',
    audioLevel: 0,
    elapsedMs: 0,
    lastSavedAt: 0,
    error: '',
    membershipLimitReason: '',
    completedDetail: null,
    liveNoteWriteStatus: 'idle',
    liveNoteTargetPath: '',
  });
  readonly state = readonly(this.mutableState);
  private capture: AudioCaptureController | null = null;
  private socket: WiseMindTranscriptionSocket | null = null;
  private clockTimer = 0;
  private activeStartedAt = 0;
  private baseElapsedMs = 0;
  private targetPath = '';
  private completionHandled = false;
  private liveNoteWriter: TranscriptionLiveNoteWriter | null = null;
  private segmentIds = new Set<string>();
  private completionRefreshPromise: Promise<void> | null = null;

  constructor(
    private readonly plugin: WiseMindObsidianPlugin,
    private readonly onStatusChange?: (state: Readonly<ControllerState>) => void,
  ) {}

  get isActive() {
    return ['starting', 'recording', 'paused', 'stopping'].includes(this.mutableState.status);
  }

  async start(options: StartOptions) {
    if (this.isActive) throw new Error(this.t('transcription.errors.alreadyActive'));
    const liveTargetFile = options.liveWriteToNote
      ? this.resolveMarkdownFile(options.targetPath)
      : null;
    if (options.liveWriteToNote && !liveTargetFile) {
      throw new Error(this.t('transcription.targetMissing'));
    }
    this.resetState('starting');
    this.targetPath = options.targetPath || '';
    try {
      const quota = await this.plugin.api.getTranscriptionMembership();
      if (!quota.canStart) throw new Error(this.t('transcription.quotaUnavailable'));
      await checkAudioCaptureAvailability(options.deviceId);
      this.socket = new WiseMindTranscriptionSocket(this.plugin.settings.apiBaseUrl, {
        onEvent: event => void this.handleRuntimeEvent(event),
        onConnectionChange: status => {
          this.mutableState.connectionStatus = status;
          if (status === 'connected') this.mutableState.error = '';
          this.notifyStatus();
        },
        onError: error => {
          if (this.isActive) this.mutableState.error = error.message;
        },
      });
      const record = await this.socket.start({
        title: options.title,
        scenario: options.scenario,
        providerId: options.providerId,
        saveAudio: options.saveAudio,
      });
      this.mutableState.record = record;
      this.capture = await startAudioCapture({
        deviceId: options.deviceId,
        sampleRate: 16000,
        chunkMs: 100,
        onDeviceEnded: () => void this.handleDeviceEnded(),
        onChunk: (chunk, level) => {
          this.mutableState.audioLevel = level;
          if (this.mutableState.status === 'recording') this.socket?.sendAudio(chunk, level);
        },
      });
      this.mutableState.status = 'recording';
      this.activeStartedAt = Date.now();
      this.startClock();
      this.notifyStatus();
      if (liveTargetFile) {
        const writer = new TranscriptionLiveNoteWriter(
          this.plugin,
          liveTargetFile,
          record,
          {
            targetMissing: this.t('transcription.targetMissing'),
            blockMissing: this.t('transcription.liveWriteBlockMissing'),
          },
          error => this.handleLiveNoteWriteError(error),
          path => this.updateLiveNoteTarget(path),
        );
        this.liveNoteWriter = writer;
        this.targetPath = writer.targetPath;
        this.mutableState.liveNoteTargetPath = writer.targetPath;
        this.mutableState.liveNoteWriteStatus = 'writing';
        try {
          await writer.start(this.t('transcription.noteSections.transcript'));
        } catch (error) {
          if (this.liveNoteWriter === writer) {
            writer.disable(error);
            this.liveNoteWriter = null;
          }
        }
      }
      this.notifyStatus();
      return record;
    } catch (error) {
      this.capture?.stop();
      this.capture = null;
      if (this.mutableState.record?.id) await this.socket?.stop().catch(() => undefined);
      this.socket?.close();
      this.socket = null;
      await this.fail(this.microphoneErrorMessage(error));
      throw error;
    }
  }

  async pause() {
    if (this.mutableState.status !== 'recording') return;
    await this.socket?.pause();
  }

  async resume() {
    if (this.mutableState.status !== 'paused') return;
    await this.socket?.resume();
  }

  async stop() {
    if (!this.isActive || this.mutableState.status === 'stopping') return;
    this.freezeElapsed();
    this.mutableState.status = 'stopping';
    this.capture?.stop();
    this.capture = null;
    this.mutableState.audioLevel = 0;
    this.notifyStatus();
    await this.socket?.stop();
    window.setTimeout(() => void this.refreshCompletedDetail(), 6_000);
  }

  async mark(kind: TranscriptionMarkKind) {
    if (
      !this.mutableState.record ||
      !this.socket ||
      !['recording', 'paused'].includes(this.mutableState.status)
    ) {
      return false;
    }
    const latest = this.mutableState.partialText || this.mutableState.segments.at(-1)?.text || '';
    await this.socket.mark(kind, latest, this.mutableState.elapsedMs);
    return true;
  }

  async insertIntoTargetNote(targetPath = this.targetPath) {
    const detail = this.mutableState.completedDetail;
    if (!detail) throw new Error(this.t('transcription.errors.noResult'));
    if (!targetPath) throw new Error(this.t('transcription.targetMissing'));
    return appendTranscriptionToNote(this.plugin, detail, targetPath);
  }

  async saveAsNewNote() {
    const detail = this.mutableState.completedDetail;
    if (!detail) throw new Error(this.t('transcription.errors.noResult'));
    return saveTranscriptionAsNewNote(this.plugin, detail);
  }

  async organizeCompletedRecord() {
    const detail = this.mutableState.completedDetail;
    if (!detail) throw new Error(this.t('transcription.errors.noResult'));
    if (!detail.segments.some(segment => segment.text.trim())) {
      throw new Error(this.t('transcription.summaryNeedsTranscript'));
    }
    const quota = await this.plugin.api.getTranscriptionMembership(detail.record.id);
    if (!quota.canGenerateSummary) {
      throw new Error(this.t('transcription.summaryQuotaUnavailable'));
    }
    const transcript = detail.segments
      .filter(segment => segment.text.trim())
      .map(segment => segment.text.trim())
      .join('\n');
    let organized;
    try {
      const generated: any = await this.plugin.api.summarizeContent({
        sourceTitle: detail.record.title,
        content: transcript,
        language: resolveLanguageSetting(this.plugin.settings.assistantDefaults.language),
        style: 'structured',
      });
      const summary = String(generated?.markdown || generated?.summary || '').trim();
      if (!summary) throw new Error(this.t('transcription.errors.loadResult'));
      organized = await this.plugin.api.updateTranscriptionOrganization(
        detail.record.id,
        parseTranscriptionOrganizationMarkdown(summary),
      );
    } catch {
      organized = await this.plugin.api.organizeTranscription(detail.record.id);
    }
    this.mutableState.completedDetail = {...detail, record: organized.record};
    this.mutableState.record = organized.record;
    this.notifyStatus();
    return organized;
  }

  async retryCompletion() {
    if (this.mutableState.status !== 'stopping') return;
    this.mutableState.error = '';
    this.notifyStatus();
    await this.refreshCompletedDetail();
  }

  reset() {
    if (this.isActive) return;
    this.socket?.close();
    this.socket = null;
    this.targetPath = '';
    this.resetState('idle');
  }

  async dispose() {
    if (this.isActive) {
      await this.stop().catch(() => undefined);
    }
    this.capture?.stop();
    this.capture = null;
    this.stopClock();
    this.socket?.close();
    this.socket = null;
    await this.releaseLiveNoteWriter();
  }

  private async handleRuntimeEvent(event: TranscriptionRuntimeEvent) {
    if (event.type === 'started') {
      this.mutableState.record = event.record;
      return;
    }
    if (event.type === 'partial') {
      this.mutableState.partialText = event.text;
      return;
    }
    if (event.type === 'segment') {
      this.mutableState.partialText = '';
      if (!event.segment.isFinal) {
        this.mutableState.partialText = event.segment.text;
        return;
      }
      if (this.segmentIds.has(event.segment.id)) return;
      this.segmentIds.add(event.segment.id);
      this.mutableState.segments.push(event.segment);
      if (this.mutableState.record) {
        this.mutableState.record.wordCount += event.segment.text.replace(/\s/g, '').length;
      }
      this.liveNoteWriter?.enqueue(event.segment);
      return;
    }
    if (event.type === 'audioLevel') {
      this.mutableState.audioLevel = event.level;
      return;
    }
    if (event.type === 'connection') {
      this.mutableState.connectionStatus = event.status;
      this.notifyStatus();
      return;
    }
    if (event.type === 'saved') {
      this.mutableState.lastSavedAt = event.savedAt;
      if (event.durationMs !== undefined) {
        this.baseElapsedMs = event.durationMs;
        this.mutableState.elapsedMs = event.durationMs;
        if (this.mutableState.status === 'recording') this.activeStartedAt = Date.now();
      }
      return;
    }
    if (event.type === 'membershipLimit') {
      this.mutableState.membershipLimitReason = event.reason;
      this.capture?.stop();
      this.capture = null;
      this.mutableState.status = 'stopping';
      this.notifyStatus();
      return;
    }
    if (event.type === 'error') {
      await this.fail(event.message || this.t('transcription.errors.unknown'));
      return;
    }
    if (event.type === 'status') {
      if (event.status === 'paused') {
        if (event.durationMs !== undefined) {
          this.baseElapsedMs = event.durationMs;
          this.mutableState.elapsedMs = event.durationMs;
          this.activeStartedAt = 0;
        } else {
          this.freezeElapsed();
        }
        this.mutableState.status = 'paused';
      } else if (event.status === 'recording') {
        if (event.durationMs !== undefined) {
          this.baseElapsedMs = event.durationMs;
          this.mutableState.elapsedMs = event.durationMs;
        }
        this.activeStartedAt = Date.now();
        this.mutableState.status = 'recording';
      } else if (event.status === 'processing') {
        if (event.durationMs !== undefined) {
          this.baseElapsedMs = event.durationMs;
          this.mutableState.elapsedMs = event.durationMs;
        }
        this.mutableState.status = 'stopping';
      } else if (!['recording', 'paused', 'processing'].includes(event.status)) {
        if (event.durationMs !== undefined) {
          this.baseElapsedMs = event.durationMs;
          this.mutableState.elapsedMs = event.durationMs;
        }
        await this.complete();
      }
      this.notifyStatus();
    }
  }

  private async complete() {
    this.capture?.stop();
    this.capture = null;
    this.freezeElapsed();
    this.stopClock();
    await this.refreshCompletedDetail();
    this.socket?.close();
    this.socket = null;
  }

  private refreshCompletedDetail() {
    if (this.mutableState.completedDetail) return Promise.resolve();
    if (this.completionRefreshPromise) return this.completionRefreshPromise;
    const request = this.loadCompletedDetail().finally(() => {
      if (this.completionRefreshPromise === request) this.completionRefreshPromise = null;
    });
    this.completionRefreshPromise = request;
    return request;
  }

  private async loadCompletedDetail() {
    const recordId = this.mutableState.record?.id;
    if (!recordId || this.mutableState.status === 'error') return;
    try {
      const detail = await this.plugin.api.getTranscriptionDetail(recordId);
      if (['recording', 'paused', 'processing'].includes(detail.record.status)) return;
      const completedDetail = {
        ...detail,
        segments: normalizeConfirmedTranscriptionSegments(detail.segments),
      };
      this.mutableState.completedDetail = completedDetail;
      this.mutableState.record = completedDetail.record;
      this.mutableState.segments = completedDetail.segments;
      this.segmentIds = new Set(completedDetail.segments.map(segment => segment.id));
      if (this.liveNoteWriter) {
        this.targetPath = this.liveNoteWriter.targetPath;
        this.mutableState.liveNoteTargetPath = this.liveNoteWriter.targetPath;
        const finalized = await this.liveNoteWriter.finalize(completedDetail);
        if (finalized) this.mutableState.liveNoteWriteStatus = 'completed';
        this.liveNoteWriter = null;
      }
      this.mutableState.status = 'completed';
      this.mutableState.connectionStatus = 'disconnected';
      this.notifyStatus();
      await this.handleCompletionAction();
    } catch (error) {
      this.mutableState.error = error instanceof Error ? error.message : this.t('transcription.errors.loadResult');
      this.notifyStatus();
    }
  }

  private async handleCompletionAction() {
    if (this.completionHandled || !this.mutableState.completedDetail) return;
    this.completionHandled = true;
    try {
      if (
        this.plugin.settings.transcription.completionAction === 'current-note' &&
        this.targetPath &&
        this.mutableState.liveNoteWriteStatus !== 'completed'
      ) {
        await this.insertIntoTargetNote();
      } else if (this.plugin.settings.transcription.completionAction === 'new-note') {
        await this.saveAsNewNote();
      }
    } catch (error) {
      this.mutableState.error = error instanceof Error ? error.message : this.t('transcription.errors.writeNote');
    }
  }

  private async fail(message: string) {
    this.capture?.stop();
    this.capture = null;
    this.freezeElapsed();
    this.stopClock();
    this.socket?.close();
    this.socket = null;
    await this.releaseLiveNoteWriter();
    this.mutableState.audioLevel = 0;
    this.mutableState.status = 'error';
    this.mutableState.error = message;
    this.notifyStatus();
  }

  private async handleDeviceEnded() {
    const socket = this.socket;
    this.capture?.stop();
    this.capture = null;
    if (this.mutableState.record?.id) await socket?.stop().catch(() => undefined);
    await this.fail(this.t('transcription.errors.deviceDisconnected'));
  }

  private resetState(status: TranscriptionControllerStatus) {
    this.stopClock();
    Object.assign(this.mutableState, {
      status,
      connectionStatus: 'idle',
      record: null,
      segments: [],
      partialText: '',
      audioLevel: 0,
      elapsedMs: 0,
      lastSavedAt: 0,
      error: '',
      membershipLimitReason: '',
      completedDetail: null,
      liveNoteWriteStatus: 'idle',
      liveNoteTargetPath: '',
    });
    this.baseElapsedMs = 0;
    this.activeStartedAt = 0;
    this.completionHandled = false;
    this.liveNoteWriter = null;
    this.segmentIds.clear();
    this.completionRefreshPromise = null;
    this.notifyStatus();
  }

  private startClock() {
    this.stopClock();
    this.clockTimer = window.setInterval(() => {
      if (this.liveNoteWriter && this.mutableState.liveNoteTargetPath !== this.liveNoteWriter.targetPath) {
        this.targetPath = this.liveNoteWriter.targetPath;
        this.mutableState.liveNoteTargetPath = this.liveNoteWriter.targetPath;
      }
      if (this.mutableState.status === 'recording') {
        this.mutableState.elapsedMs = this.baseElapsedMs + Date.now() - this.activeStartedAt;
        this.notifyStatus();
      }
    }, 1_000);
  }

  private freezeElapsed() {
    if (this.mutableState.status === 'recording' && this.activeStartedAt) {
      this.baseElapsedMs += Date.now() - this.activeStartedAt;
    }
    this.mutableState.elapsedMs = this.baseElapsedMs;
    this.activeStartedAt = 0;
  }

  private stopClock() {
    window.clearInterval(this.clockTimer);
    this.clockTimer = 0;
  }

  private notifyStatus() {
    this.onStatusChange?.(this.mutableState);
  }

  private microphoneErrorMessage(error: unknown) {
    if (error instanceof MicrophoneCaptureError) {
      return this.t(`transcription.microphoneErrors.${error.code}`);
    }
    return error instanceof Error ? error.message : this.t('transcription.errors.unknown');
  }

  private t(key: string, params?: Record<string, unknown>) {
    return translate(this.plugin.settings.assistantDefaults.language, key, params);
  }

  private resolveMarkdownFile(path?: string) {
    if (!path) return null;
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile && file.extension === 'md' ? file : null;
  }

  private handleLiveNoteWriteError(error: Error) {
    if (this.mutableState.liveNoteWriteStatus === 'error') return;
    this.mutableState.liveNoteWriteStatus = 'error';
    new Notice(this.t('transcription.liveWriteFailed', {message: error.message}));
    this.notifyStatus();
  }

  private updateLiveNoteTarget(path: string) {
    if (!this.liveNoteWriter) return;
    this.targetPath = path;
    this.mutableState.liveNoteTargetPath = path;
    this.notifyStatus();
  }

  private async releaseLiveNoteWriter() {
    const writer = this.liveNoteWriter;
    this.liveNoteWriter = null;
    if (writer) await writer.close();
  }
}
