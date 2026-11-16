import type {TFile} from 'obsidian';

import {FEATURES} from '../features';
import type WiseMindObsidianPlugin from '../main';
import {hasFeature} from '../services/capabilities';
import type {SyncRecord} from '../types';
import {resolveAbsolutePath} from '../vaultScanner';
import {WiseMindApiError} from '../wisemindApi';

import {sha256Hex} from './hash';
import {acceptedTopicIds, hasRemoteConflict, missingTopicIds} from './syncRules';

export type SyncConflictItem = {
  path: string;
  title: string;
  remoteId: number;
  localContent: string;
  remoteContent: string;
  localHash: string;
  remoteHash: string;
  remoteUpdatedAt: number | string | null;
};

const isNotFound = (error: unknown) => error instanceof WiseMindApiError && error.code === 'NOT_FOUND';

/**
 * Sends one note to WiseMindAI "My files" and returns its new sync record.
 * Known notes are updated by id; only notes WiseMindAI has never seen (or deleted) are upserted,
 * so renames, moves and learning-space copies never turn into duplicates.
 */
export const pushNote = async (
  plugin: WiseMindObsidianPlugin,
  input: {file: TFile; content: string; hash: string; record: SyncRecord | null; topicIds: number[]},
  signal?: AbortSignal,
): Promise<SyncRecord> => {
  const {file, content, hash, record} = input;
  const topicIds = hasFeature(FEATURES.upsertTopics) ? input.topicIds : [];
  const payload = {
    name: file.basename,
    filePath: resolveAbsolutePath(plugin.app, file.path),
    type: 'md' as const,
    fileType: 'md',
    content,
    source: 'obsidian' as const,
  };
  const base = {contentHash: hash, mtime: file.stat.mtime, size: file.stat.size, syncedAt: Date.now()};

  if (record?.remoteId) {
    try {
      await plugin.api.updateSyncedFile(record.remoteId, payload, {signal});
      const added = await addToTopics(plugin, file, record.remoteId, missingTopicIds(topicIds, record.topicIds), signal);
      return {
        ...record,
        ...base,
        held: false,
        remoteContentHash: hash,
        topicIds: [...(record.topicIds || []), ...added],
      };
    } catch (error) {
      if (!isNotFound(error)) throw error;
      // Deleted in WiseMindAI: fall through and create it again.
    }
  }

  const result = await plugin.api.upsertFile({...payload, ...(topicIds.length ? {knowledgeBaseIds: topicIds} : {})}, {signal});
  return {
    ...base,
    remoteId: Number(result?.id) || null,
    remoteUpdatedAt: result?.updatedAt ?? null,
    remoteContentHash: result?.contentHash || hash,
    topicIds: acceptedTopicIds(result?.knowledgeBases),
  };
};

/** Adds an already synced file to new topics; returns the topic ids that now contain it. */
const addToTopics = async (
  plugin: WiseMindObsidianPlugin,
  file: TFile,
  remoteId: number,
  topicIds: number[],
  signal?: AbortSignal,
) => {
  if (!topicIds.length) return [];
  // The desktop keeps its own copy of the note; topics must point at that copy, not the vault file.
  const remote = await plugin.api.getFile(remoteId, {signal});
  const fileUrl = String(remote?.filePath || '');
  const added: number[] = [];
  for (const knowledgeBaseId of topicIds) {
    try {
      await plugin.api.addFileToTopic(
        {knowledgeBaseId, sourceId: remoteId, title: file.basename, fileUrl, size: file.stat.size},
        {signal},
      );
      added.push(knowledgeBaseId);
    } catch (error) {
      // A deleted topic must not block the file update; other errors (quota, offline) surface to the run.
      if (!isNotFound(error)) throw error;
    }
  }
  return added;
};

/** Returns the conflict when WiseMindAI's copy was edited since the last sync, otherwise null. */
export const findConflict = async (
  plugin: WiseMindObsidianPlugin,
  input: {file: TFile; record: SyncRecord; content: string; hash: string},
  signal?: AbortSignal,
): Promise<SyncConflictItem | null> => {
  const {file, record, content, hash} = input;
  if (!record.remoteId || plugin.settings.syncConflictPolicy === 'overwrite') return null;
  let remote: Record<string, any> | null = null;
  try {
    remote = await plugin.api.getFile(record.remoteId, {signal});
  } catch {
    return null;
  }
  if (!remote) return null;
  const remoteContent = String(remote.content ?? '');
  const remoteHash = await sha256Hex(remoteContent);
  const remoteUpdatedAt = remote.lastModified ?? remote.updated_at ?? null;
  if (!hasRemoteConflict(record, {contentHash: remoteHash, updatedAt: remoteUpdatedAt}, hash)) return null;
  return {
    path: file.path,
    title: file.basename,
    remoteId: record.remoteId,
    localContent: content,
    remoteContent,
    localHash: hash,
    remoteHash,
    remoteUpdatedAt,
  };
};
