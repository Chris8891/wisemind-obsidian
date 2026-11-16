import {computed} from 'vue';
import {useI18n} from 'vue-i18n';

import {usePlugin} from '../../../composables/usePlugin';
import type {TranscriptionSegment} from '../../../types';

import {speakerIdTone} from './format';

export type CompletedSpeaker = {id: string; name: string; segmentCount: number; durationMs: number};

/** Display label and color tone for a segment's speaker. */
export function useSpeakerLabels() {
  const {t} = useI18n();

  const segmentSpeakerLabel = (segment: TranscriptionSegment) => {
    if (segment.speakerLabel?.trim()) return segment.speakerLabel.trim();
    const number = Number(String(segment.speakerId || '').match(/(\d+)$/)?.[1] || 0);
    return number ? t('transcription.speakerName', {number}) : '';
  };

  const speakerTone = (segment: TranscriptionSegment) => speakerIdTone(String(segment.speakerId || ''));

  return {segmentSpeakerLabel, speakerTone};
}

/** Speakers found in the completed record, ordered by their trailing speaker number. */
export function useCompletedSpeakers() {
  const state = usePlugin().transcription.state;
  const {segmentSpeakerLabel} = useSpeakerLabels();

  const completedSpeakers = computed(() => {
    const speakers = new Map<string, CompletedSpeaker>();
    for (const segment of state.completedDetail?.segments || []) {
      const id = String(segment.speakerId || '').trim();
      if (!id) continue;
      const name = segmentSpeakerLabel(segment);
      const durationMs = Math.max(
        0,
        Number(segment.endTimeMs || segment.beginTimeMs || 0) -
          Number(segment.beginTimeMs || 0),
      );
      const existing = speakers.get(id);
      if (existing) {
        existing.segmentCount += 1;
        existing.durationMs += durationMs;
        if (segment.speakerLabel?.trim()) existing.name = name;
      } else {
        speakers.set(id, {id, name, segmentCount: 1, durationMs});
      }
    }
    return [...speakers.values()].sort((a, b) => {
      const numberA = Number(a.id.match(/(\d+)$/)?.[1] || Number.MAX_SAFE_INTEGER);
      const numberB = Number(b.id.match(/(\d+)$/)?.[1] || Number.MAX_SAFE_INTEGER);
      return numberA - numberB || a.id.localeCompare(b.id);
    });
  });

  // v-memo dependency so every segment's speaker dropdown refreshes after a rename or merge.
  const completedSpeakerKey = computed(() =>
    completedSpeakers.value.map(speaker => `${speaker.id}:${speaker.name}`).join('|'),
  );

  return {completedSpeakers, completedSpeakerKey};
}
