export const WAVE_BAR_COUNT = 8;
export const MIC_TEST_BAR_COUNT = 4;
export const MIC_LEVEL_BAR_COUNT = 16;

export const formatRecordDate = (time = Date.now()) => {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

export function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
        remain,
      ).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
}

export const litBarCount = (level: number, total: number) =>
  level > 0 ? Math.min(total, Math.max(1, Math.round(level * total))) : 0;

export const speakerIdTone = (speakerId: string) => {
  const number = Number(String(speakerId || '').match(/(\d+)$/)?.[1] || 1);
  return number % 2 === 0 ? 'is-secondary' : 'is-info';
};
