import type {TranscriptionSegment} from '../types';

export const formatTranscriptionTime = (milliseconds?: number) => {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const markers = (recordId: string) => ({
  start: `<!-- wisemind:transcription-live id="${recordId}" -->`,
  end: `<!-- /wisemind:transcription-live id="${recordId}" -->`,
  final: `<!-- wisemind:transcription id="${recordId}" -->`,
});

const segmentMarker = (segmentId: string) =>
  `<!-- wisemind:transcription-segment id="${segmentId}" -->`;

export const normalizeConfirmedTranscriptionSegments = (
  segments: TranscriptionSegment[],
) =>
  segments
    .filter(segment => segment.isFinal && segment.text.trim())
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.beginTimeMs || 0) - (b.beginTimeMs || 0));

export const createLiveTranscriptionBlock = (
  recordId: string,
  transcriptHeading: string,
) => {
  const {start, end} = markers(recordId);
  return [start, `## ${transcriptHeading}`, '', end].join('\n');
};

export const appendLiveTranscriptionSegments = (
  content: string,
  recordId: string,
  segments: TranscriptionSegment[],
) => {
  const {start, end} = markers(recordId);
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error('Live transcription block is missing');
  }

  const newSegments = normalizeConfirmedTranscriptionSegments(segments).filter(
    segment => !content.includes(segmentMarker(segment.id)),
  );
  if (!newSegments.length) return content;

  const blocks = newSegments.map(segment =>
    [
      segmentMarker(segment.id),
      `**${formatTranscriptionTime(segment.beginTimeMs)}**`,
      '',
      segment.text.trim(),
    ].join('\n'),
  );
  const before = content.slice(0, endIndex).trimEnd();
  return `${before}\n\n${blocks.join('\n\n')}\n\n${content.slice(endIndex)}`;
};

export const replaceLiveTranscriptionBlock = (
  content: string,
  recordId: string,
  finalMarkdown: string,
) => {
  const {start, end, final} = markers(recordId);
  if (content.includes(final)) return content;
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error('Live transcription block is missing');
  }
  return `${content.slice(0, startIndex)}${finalMarkdown.trim()}${content.slice(endIndex + end.length)}`;
};
