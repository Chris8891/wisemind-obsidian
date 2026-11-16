import {reactive, readonly} from 'vue';
import {Notice, TFile} from 'obsidian';

import {resolveLanguageSetting, translate} from '../i18n';
import type WiseMindObsidianPlugin from '../main';
import type {
  TranscriptionConnectionStatus,
  TranscriptionDetail,
  TranscriptionHistoryItem,
  TranscriptionMarkKind,
  TranscriptionRecord,
  TranscriptionRuntimeEvent,
  TranscriptionScene,
  TranscriptionSegment,
  TranscriptionSegmentUpdate,
} from '../types';

import {
  type AudioCaptureController,
  checkAudioCaptureAvailability,
  MicrophoneCaptureError,
  startAudioCapture,
} from './audioCapture';
import {
  transcriptionHistoryToDetail,
  upsertTranscriptionHistory,
} from './transcriptionHistory';
import {normalizeConfirmedTranscriptionSegments} from './transcriptionLiveNoteContent';
import {TranscriptionLiveNoteWriter} from './transcriptionLiveNoteWriter';
import {parseTranscriptionOrganizationMarkdown} from './transcriptionOrganization';
import {appendTranscriptionToNote, saveTranscriptionAsNewNote} from './transcriptionResult';
import {TranscriptionSocketError, WiseMindTranscriptionSocket} from './transcriptionSocket';

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
  speakerDiarization?: boolean;
  speakerCount?: number;
  targetPath?: string;
  liveWriteToNote?: boolean;
};

class TranscriptionStartCancelled extends Error {}

const STOP_RESULT_POLL_MS = 5_000;
const STOP_RESULT_MAX_POLLS = 12;

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
  private startToken = 0;
  private stopFailed = false;
  private resultPollTimer = 0;
  private resultPollCount = 0;

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
    // stop() or dispose() during startup bumps the token; every await below re-checks it so a cancelled
    // start never opens the microphone or flips the state back to recording.
    const token = ++this.startToken;
    const ensureCurrent = () => {
      if (token !== this.startToken) throw new TranscriptionStartCancelled();
    };
    let socket: WiseMindTranscriptionSocket | null = null;
    let capture: AudioCaptureController | null = null;
    let startedRecordId = '';
    try {
      const quota = await this.plugin.api.getTranscriptionMembership();
      ensureCurrent();
      if (!quota.canStart) throw new Error(this.t('transcription.quotaUnavailable'));
      await checkAudioCaptureAvailability(options.deviceId);
      ensureCurrent();
      socket = new WiseMindTranscriptionSocket(this.plugin.settings.apiBaseUrl, {
        onEvent: event => {
          if (this.socket === socket) void this.handleRuntimeEvent(event);
        },
        onConnectionChange: status => {
          if (this.socket !== socket) return;
          this.mutableState.connectionStatus = status;
          if (status === 'connected') this.mutableState.error = '';
          this.notifyStatus();
        },
        onError: error => {
          if (this.socket === socket && this.isActive) this.mutableState.error = this.errorText(error);
        },
      });
      this.socket = socket;
      const workspaceState = await this.plugin.api.getWorkspaceState().catch(() => null);
      ensureCurrent();
      const record = await socket.start({
        title: options.title,
        scenario: options.scenario,
        providerId: options.providerId,
        workspaceId: workspaceState?.activeWorkspaceId || null,
        saveAudio: options.saveAudio,
        speakerDiarization: options.speakerDiarization,
        speakerCount: options.speakerCount,
        // Obsidian 自行采音后经 WS 推流，桌面端不要再开本机麦
        audioCaptureMode: 'client',
      });
      startedRecordId = record.id;
      ensureCurrent();
      this.mutableState.record = record;
      capture = await startAudioCapture({
        deviceId: options.deviceId,
        sampleRate: 16000,
        chunkMs: 100,
        onDeviceEnded: () => {
          if (this.capture === capture) void this.handleDeviceEnded();
        },
        onChunk: (chunk, level) => {
          if (this.capture !== capture) return;
          this.mutableState.audioLevel = level;
          if (this.mutableState.status === 'recording') this.socket?.sendAudio(chunk, level);
        },
      });
      ensureCurrent();
      this.capture = capture;
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
      capture?.stop();
      if (this.capture === capture) this.capture = null;
      if (startedRecordId) await socket?.stop().catch(() => undefined);
      socket?.close();
      if (this.socket === socket) this.socket = null;
      if (error instanceof TranscriptionStartCancelled || token !== this.startToken) return null;
      await this.fail(this.microphoneErrorMessage(error));
      throw error;
    }
  }

  /** Abandons an in-flight start; the pending start() cleans up its own socket and capture. */
  private cancelStart() {
    this.startToken += 1;
    this.socket = null;
    this.capture = null;
    this.resetState('idle');
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
    if (this.mutableState.status === 'starting') {
      this.cancelStart();
      return;
    }
    if (!this.isActive || this.mutableState.status === 'stopping') return;
    this.freezeElapsed();
    this.mutableState.status = 'stopping';
    this.capture?.stop();
    this.capture = null;
    this.mutableState.audioLevel = 0;
    this.notifyStatus();
    // A failed stop command must surface inline with the retry button instead of leaving the page
    // spinning in "saving" forever.
    try {
      await this.socket?.stop();
      this.stopFailed = false;
    } catch {
      this.stopFailed = true;
      this.mutableState.error = this.t('transcription.errors.stopFailed');
      this.notifyStatus();
      return;
    }
    this.scheduleResultPoll();
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
    await this.persistHistory(this.mutableState.completedDetail);
    this.notifyStatus();
    return organized;
  }

  async updateCompletedSpeakers(updates: TranscriptionSegmentUpdate[]) {
    const detail = this.mutableState.completedDetail;
    if (!detail) throw new Error(this.t('transcription.errors.noResult'));
    if (!updates.length) return detail;
    const updated = await this.plugin.api.updateTranscriptionSegments(detail.record.id, updates);
    const completedDetail = {
      ...updated,
      segments: normalizeConfirmedTranscriptionSegments(updated.segments),
    };
    this.mutableState.completedDetail = completedDetail;
    this.mutableState.record = completedDetail.record;
    this.mutableState.segments = completedDetail.segments;
    this.segmentIds = new Set(completedDetail.segments.map(segment => segment.id));
    await this.persistHistory(completedDetail);
    this.notifyStatus();
    return completedDetail;
  }

  showCachedHistory(item: TranscriptionHistoryItem) {
    if (this.isActive) return false;
    const detail = transcriptionHistoryToDetail(item);
    this.resetState('completed');
    this.mutableState.record = detail.record;
    this.mutableState.completedDetail = detail;
    this.mutableState.segments = detail.segments;
    this.mutableState.elapsedMs = detail.record.durationMs;
    this.baseElapsedMs = detail.record.durationMs;
    this.segmentIds = new Set(detail.segments.map(segment => segment.id));
    this.notifyStatus();
    return true;
  }

  async retryCompletion() {
    if (this.mutableState.status !== 'stopping') return;
    this.mutableState.error = '';
    this.notifyStatus();
    if (this.stopFailed) {
      try {
        if (!this.socket) throw new Error(this.t('transcription.errors.stopFailed'));
        await this.socket.stop();
        this.stopFailed = false;
      } catch {
        // Second failure: give up on this session so the user can reset or open the saved record.
        await this.fail(this.t('transcription.errors.stopFailed'));
        return;
      }
      this.scheduleResultPoll();
      return;
    }
    await this.refreshCompletedDetail();
    if (this.mutableState.status === 'stopping' && !this.mutableState.error) this.scheduleResultPoll();
  }

  reset() {
    if (this.isActive) return;
    this.socket?.close();
    this.socket = null;
    this.targetPath = '';
    this.resetState('idle');
  }

  async dispose() {
    if (this.mutableState.status === 'starting') this.cancelStart();
    if (this.isActive) {
      await this.stop().catch(() => undefined);
    }
    this.clearResultPoll();
    this.capture?.stop();
    this.capture = null;
    this.stopClock();
    this.socket?.close();
    this.socket = null;
    await this.releaseLiveNoteWriter();
  }

  /** The completion event can be lost on a dropped socket, so the final result is also polled for a while. */
  private scheduleResultPoll(reset = true) {
    if (reset) this.resultPollCount = 0;
    window.clearTimeout(this.resultPollTimer);
    this.resultPollTimer = window.setTimeout(() => void this.pollCompletedDetail(), STOP_RESULT_POLL_MS);
  }

  private clearResultPoll() {
    window.clearTimeout(this.resultPollTimer);
    this.resultPollTimer = 0;
  }

  private async pollCompletedDetail() {
    this.resultPollTimer = 0;
    if (this.mutableState.status !== 'stopping') return;
    await this.refreshCompletedDetail();
    if (this.mutableState.status !== 'stopping' || this.mutableState.error) return;
    this.resultPollCount += 1;
    if (this.resultPollCount >= STOP_RESULT_MAX_POLLS) {
      this.mutableState.error = this.t('transcription.errors.resultPending');
      this.notifyStatus();
      return;
    }
    this.scheduleResultPoll(false);
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
      this.scheduleResultPoll();
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
      await this.persistHistory(completedDetail);
      await this.handleCompletionAction();
    } catch (error) {
      this.mutableState.error = error instanceof Error ? error.message : this.t('transcription.errors.loadResult');
      this.notifyStatus();
    }
  }

  private async persistHistory(detail: TranscriptionDetail) {
    this.plugin.settings.transcriptionHistory = upsertTranscriptionHistory(
      this.plugin.settings.transcriptionHistory || [],
      detail,
    );
    await this.plugin.saveSettings();
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
    this.clearResultPoll();
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
    this.clearResultPoll();
    this.stopFailed = false;
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
    return this.errorText(error);
  }

  private errorText(error: unknown) {
    if (error instanceof TranscriptionSocketError) {
      return error.serverMessage || this.t(`transcription.socketErrors.${error.code}`);
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
