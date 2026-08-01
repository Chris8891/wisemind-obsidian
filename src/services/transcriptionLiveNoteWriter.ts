import {TFile} from 'obsidian';

import type WiseMindObsidianPlugin from '../main';
import type {TranscriptionDetail, TranscriptionRecord, TranscriptionSegment} from '../types';

import {
  appendLiveTranscriptionSegments,
  createLiveTranscriptionBlock,
  replaceLiveTranscriptionBlock,
} from './transcriptionLiveNoteContent';
import {transcriptionMarkdown} from './transcriptionResult';

type WriterMessages = {
  targetMissing: string;
  blockMissing: string;
};

export class TranscriptionLiveNoteWriter {
  private readonly pendingSegments = new Map<string, TranscriptionSegment>();
  private createdAt: number;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private flushTimer = 0;
  private closed = false;
  private failed = false;
  private targetPathValue: string;
  private renameEventRef: unknown;

  constructor(
    private readonly plugin: WiseMindObsidianPlugin,
    file: TFile,
    private readonly record: TranscriptionRecord,
    private readonly messages: WriterMessages,
    private readonly onError: (error: Error) => void,
    private readonly onTargetChange?: (path: string) => void,
  ) {
    this.targetPathValue = file.path;
    this.createdAt = file.stat.ctime;
    const vault = this.plugin.app.vault as any;
    this.renameEventRef = vault.on?.('rename', (renamedFile: unknown, oldPath: string) => {
      this.handleRename(renamedFile, oldPath);
    });
  }

  get targetPath() {
    return this.targetPathValue;
  }

  async start(transcriptHeading: string) {
    const block = createLiveTranscriptionBlock(this.record.id, transcriptHeading);
    await this.runWrite(async file => {
      await this.plugin.app.vault.process(file, content => {
        if (
          content.includes(`<!-- wisemind:transcription-live id="${this.record.id}" -->`) ||
          content.includes(`<!-- wisemind:transcription id="${this.record.id}" -->`)
        ) {
          return content;
        }
        return content.trim()
          ? `${content.trimEnd()}\n\n${block}\n`
          : `${block}\n`;
      });
    });
  }

  enqueue(segment: TranscriptionSegment) {
    if (this.closed || this.failed || !segment.isFinal || !segment.text.trim()) return;
    this.pendingSegments.set(segment.id, segment);
    if (this.flushTimer) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = 0;
      void this.flush().catch(error => this.handleError(error));
    }, 1_500);
  }

  async flush() {
    window.clearTimeout(this.flushTimer);
    this.flushTimer = 0;
    if (this.failed || !this.pendingSegments.size) return;
    const segments = [...this.pendingSegments.values()];
    this.pendingSegments.clear();
    try {
      await this.runWrite(async file => {
        await this.plugin.app.vault.process(file, content => {
          try {
            return appendLiveTranscriptionSegments(content, this.record.id, segments);
          } catch {
            throw new Error(this.messages.blockMissing);
          }
        });
      });
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async finalize(detail: TranscriptionDetail) {
    if (this.failed) return false;
    this.closed = true;
    try {
      await this.flush();
      await this.runWrite(async file => {
        await this.plugin.app.vault.process(file, content => {
          try {
            return replaceLiveTranscriptionBlock(
              content,
              this.record.id,
              transcriptionMarkdown(this.plugin, detail),
            );
          } catch {
            throw new Error(this.messages.blockMissing);
          }
        });
      });
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    } finally {
      this.releaseEvents();
    }
  }

  async close() {
    window.clearTimeout(this.flushTimer);
    this.flushTimer = 0;
    this.closed = true;
    if (!this.failed) await this.flush().catch(error => this.handleError(error));
    await this.writeQueue;
    this.releaseEvents();
  }

  disable(error: unknown) {
    this.closed = true;
    this.pendingSegments.clear();
    this.releaseEvents();
    this.handleError(error);
  }

  private async runWrite(write: (file: TFile) => Promise<void>) {
    const operation = this.writeQueue.then(async () => {
      const currentFile = this.plugin.app.vault.getAbstractFileByPath(this.targetPathValue);
      if (
        !(currentFile instanceof TFile) ||
        currentFile.extension !== 'md' ||
        currentFile.stat.ctime !== this.createdAt
      ) {
        throw new Error(this.messages.targetMissing);
      }
      await write(currentFile);
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private handleError(error: unknown) {
    if (this.failed) return;
    this.failed = true;
    window.clearTimeout(this.flushTimer);
    this.flushTimer = 0;
    this.releaseEvents();
    this.onError(error instanceof Error ? error : new Error(String(error)));
  }

  private handleRename(renamedFile: unknown, oldPath: string) {
    if (
      oldPath !== this.targetPathValue ||
      !(renamedFile instanceof TFile) ||
      renamedFile.extension !== 'md'
    ) {
      return;
    }
    this.targetPathValue = renamedFile.path;
    this.createdAt = renamedFile.stat.ctime;
    this.onTargetChange?.(renamedFile.path);
  }

  private releaseEvents() {
    if (!this.renameEventRef) return;
    const vault = this.plugin.app.vault as any;
    if (typeof vault.offref === 'function') vault.offref(this.renameEventRef);
    this.renameEventRef = undefined;
  }
}
