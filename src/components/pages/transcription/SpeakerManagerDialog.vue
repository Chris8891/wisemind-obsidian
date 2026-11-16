<script setup lang="ts">
  import {ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {ArrowPathIcon, CheckIcon, UserGroupIcon, XMarkIcon} from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';

  import {usePlugin} from '../../../composables/usePlugin';
  import WmDialog from '../../WmDialog.vue';

  import {formatDuration} from './format';
  import {type CompletedSpeaker, useSpeakerLabels} from './useSpeakers';

  const props = defineProps<{speakers: CompletedSpeaker[]}>();
  const open = defineModel<boolean>('open', {required: true});
  const controller = usePlugin().transcription;
  const state = controller.state;
  const {t} = useI18n();
  const {segmentSpeakerLabel} = useSpeakerLabels();

  const speakerSaving = ref(false);
  const speakerNames = ref<Record<string, string>>({});
  const speakerMergeTargets = ref<Record<string, string>>({});

  watch(open, isOpen => {
    if (!isOpen) return;
    speakerNames.value = Object.fromEntries(props.speakers.map(speaker => [speaker.id, speaker.name]));
    speakerMergeTargets.value = Object.fromEntries(props.speakers.map(speaker => [speaker.id, '']));
  });

  const resolveSpeakerMergeTarget = (speakerId: string) => {
    const visited = new Set([speakerId]);
    let targetId = String(speakerMergeTargets.value[speakerId] || '').trim();
    while (targetId) {
      if (visited.has(targetId)) return '';
      visited.add(targetId);
      const next = String(speakerMergeTargets.value[targetId] || '').trim();
      if (!next) return targetId;
      targetId = next;
    }
    return speakerId;
  };

  const saveSpeakerChanges = async () => {
    const detail = state.completedDetail;
    if (!detail || speakerSaving.value) return;
    const speakerById = new Map(props.speakers.map(speaker => [speaker.id, speaker]));
    for (const speaker of props.speakers) {
      if (!resolveSpeakerMergeTarget(speaker.id)) {
        new Notice(t('transcription.speakerMergeCycle'));
        return;
      }
    }
    const updates = detail.segments.flatMap(segment => {
      const sourceId = String(segment.speakerId || '').trim();
      if (!sourceId) return [];
      const targetId = resolveSpeakerMergeTarget(sourceId);
      const target = speakerById.get(targetId);
      const label = String(speakerNames.value[targetId] || target?.name || '').trim();
      if (!label) return [];
      if (
        targetId === sourceId &&
        label === String(segment.speakerLabel || segmentSpeakerLabel(segment)).trim()
      ) {
        return [];
      }
      return [
        {
          id: segment.id,
          speakerId: targetId,
          speakerLabel: label,
          speakerSource: 'user' as const,
        },
      ];
    });
    if (!updates.length) {
      open.value = false;
      return;
    }
    speakerSaving.value = true;
    try {
      await controller.updateCompletedSpeakers(updates);
      open.value = false;
      new Notice(t('transcription.speakerSaved'));
    } catch (error: any) {
      new Notice(error?.message || t('transcription.speakerSaveFailed'));
    } finally {
      speakerSaving.value = false;
    }
  };
</script>

<template>
  <WmDialog
    v-model:open="open"
    :title="t('transcription.manageSpeakers')"
    :description="t('transcription.manageSpeakersDesc')"
    content-class="wm2-rec-dialog"
  >
    <ul class="wm2-card wm2-list-card wm2-rec-dialog-list">
      <li v-for="speaker in speakers" :key="speaker.id" class="wm2-rec-speaker-row">
        <span class="wm2-tile is-info" aria-hidden="true">
          <UserGroupIcon class="wm-icon" />
        </span>
        <label class="wm2-rec-field">
          <span>{{ t('transcription.speakerDisplayName') }}</span>
          <input
            v-model.trim="speakerNames[speaker.id]"
            class="wm2-rec-input"
            type="text"
            maxlength="40"
            :placeholder="speaker.name"
            :disabled="Boolean(speakerMergeTargets[speaker.id]) || speakerSaving"
          />
          <small>
            {{
              t('transcription.speakerSegmentStats', {
                count: speaker.segmentCount,
                duration: formatDuration(speaker.durationMs),
              })
            }}
          </small>
        </label>
        <label class="wm2-rec-field">
          <span>{{ t('transcription.mergeSpeakerInto') }}</span>
          <select v-model="speakerMergeTargets[speaker.id]" class="wm2-rec-input" :disabled="speakerSaving">
            <option value="">{{ t('transcription.keepSpeakerSeparate') }}</option>
            <option
              v-for="target in speakers.filter(item => item.id !== speaker.id)"
              :key="target.id"
              :value="target.id"
            >
              {{ speakerNames[target.id] || target.name }}
            </option>
          </select>
        </label>
      </li>
    </ul>
    <footer class="wm2-dialog-actions">
      <button
        class="wm2-btn is-sm"
        type="button"
        :disabled="speakerSaving"
        @click="open = false"
      >
        <XMarkIcon class="wm-icon" />
        {{ t('common.cancel') }}
      </button>
      <button
        class="wm2-btn is-primary is-sm"
        type="button"
        :disabled="speakerSaving"
        @click="saveSpeakerChanges"
      >
        <ArrowPathIcon v-if="speakerSaving" class="wm-icon wm2-spin" />
        <CheckIcon v-else class="wm-icon" />
        {{ t('transcription.saveSpeakers') }}
      </button>
    </footer>
  </WmDialog>
</template>
