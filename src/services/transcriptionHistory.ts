import type {
  TranscriptionDetail,
  TranscriptionHistoryItem,
  TranscriptionRecord,
} from '../types';

export const MAX_TRANSCRIPTION_HISTORY = 30;

export const createTranscriptionHistoryItem = (
  detail: TranscriptionDetail,
  cachedAt = Date.now(),
): TranscriptionHistoryItem => ({
  id: detail.record.id,
  title: detail.record.title,
  scenario: detail.record.scenario,
  provider: detail.record.provider,
  model: detail.record.model,
  workspaceId: detail.record.workspaceId || null,
  durationMs: Number(detail.record.durationMs || 0),
  wordCount: Number(detail.record.wordCount || 0),
  speakerDiarization: Boolean(detail.record.speakerDiarization),
  speakerCount: Number(detail.record.speakerCount || 0),
  summary: String(detail.record.summary || ''),
  keyPoints: String(detail.record.keyPoints || ''),
  todos: String(detail.record.todos || ''),
  segments: detail.segments.map(segment => ({...segment})),
  startedAt: detail.record.startedAt,
  createdAt: Number(detail.record.created_at || detail.record.startedAt || cachedAt),
  cachedAt,
});

export const upsertTranscriptionHistory = (
  history: TranscriptionHistoryItem[],
  detail: TranscriptionDetail,
  cachedAt = Date.now(),
) => [
  createTranscriptionHistoryItem(detail, cachedAt),
  ...history.filter(item => item.id !== detail.record.id),
].slice(0, MAX_TRANSCRIPTION_HISTORY);

export const transcriptionHistoryToDetail = (
  item: TranscriptionHistoryItem,
): TranscriptionDetail => {
  const timestamp = Number(item.createdAt || item.cachedAt || Date.now());
  const record: TranscriptionRecord = {
    id: item.id,
    title: item.title,
    scenario: item.scenario,
    status: item.summary || item.keyPoints || item.todos ? 'organized' : 'pending',
    provider: item.provider,
    model: item.model,
    workspaceId: item.workspaceId || null,
    durationMs: Number(item.durationMs || 0),
    wordCount: Number(item.wordCount || 0),
    saveAudio: false,
    speakerDiarization: Boolean(item.speakerDiarization),
    speakerCount: Number(item.speakerCount || 0),
    summary: item.summary,
    keyPoints: item.keyPoints,
    todos: item.todos,
    startedAt: item.startedAt,
    endedAt: timestamp + Number(item.durationMs || 0),
    created_at: timestamp,
    updated_at: Number(item.cachedAt || timestamp),
  };
  return {record, segments: item.segments.map(segment => ({...segment}))};
};
