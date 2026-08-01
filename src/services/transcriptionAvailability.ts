export type TranscriptionAvailabilityStatus = 'not-running' | 'unsupported' | 'error';

export const MINIMUM_TRANSCRIPTION_VERSION = '1.3.1';

const parseVersion = (version: unknown) => {
  if (typeof version !== 'string') return null;
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.+)?$/i);
  if (!match) return null;
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] || '',
  };
};

export const isTranscriptionVersionSupported = (version: unknown) => {
  const current = parseVersion(version);
  const minimum = parseVersion(MINIMUM_TRANSCRIPTION_VERSION);
  if (!current || !minimum) return false;

  for (let index = 0; index < minimum.parts.length; index += 1) {
    if (current.parts[index] > minimum.parts[index]) return true;
    if (current.parts[index] < minimum.parts[index]) return false;
  }
  return current.prerelease === '';
};

export const classifyTranscriptionAvailabilityError = (
  error: unknown,
): TranscriptionAvailabilityStatus => {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as {status?: unknown}).status
      : undefined;

  if (status === 404) return 'unsupported';
  if (status == null) return 'not-running';
  return 'error';
};
