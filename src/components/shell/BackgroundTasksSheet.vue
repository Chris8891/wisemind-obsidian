<script setup lang="ts">
  import {computed} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    MicrophoneIcon,
    SparklesIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';
  import {DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle} from 'reka-ui';

  import {usePlugin} from '../../composables/usePlugin';
  import {
    closeBackgroundTasks,
    openAskTab,
    openNoteView,
    openPanelTab,
    openTranscriptionOverlay,
    panelState,
  } from '../../services/panelStore';
  import {type PluginTaskProgress,pluginTaskProgress} from '../../services/pluginTaskProgress';

  const {t} = useI18n();
  const plugin = usePlugin();

  const open = computed({
    get: () => panelState.backgroundTasksOpen,
    set: value => {
      if (!value) closeBackgroundTasks();
    },
  });

  const tasks = computed(() => pluginTaskProgress.tasks);
  const runningCount = computed(() => tasks.value.filter(task => task.status === 'running').length);

  const kindOf = (task: PluginTaskProgress) => {
    if (task.id.startsWith('sync-')) return 'sync' as const;
    if (task.id.startsWith('summary-')) return 'summary' as const;
    if (task.id.startsWith('cards-')) return 'cards' as const;
    if (task.id.startsWith('transcription') || task.id.startsWith('rec-')) return 'transcription' as const;
    if (task.id.startsWith('chat-') || task.id.startsWith('ai-task')) return 'ask' as const;
    return 'other' as const;
  };

  const iconOf = (task: PluginTaskProgress) => {
    const kind = kindOf(task);
    if (kind === 'sync') return ArrowPathIcon;
    if (kind === 'transcription') return MicrophoneIcon;
    if (kind === 'summary' || kind === 'cards' || kind === 'ask') return SparklesIcon;
    return SparklesIcon;
  };

  const routeLabel = (task: PluginTaskProgress) => {
    const kind = kindOf(task);
    if (kind === 'sync') return t('backgroundTasks.routeSync');
    if (kind === 'transcription') return t('backgroundTasks.routeTranscription');
    if (kind === 'ask') return t('backgroundTasks.routeAsk');
    if (kind === 'summary' || kind === 'cards') return t('backgroundTasks.routeNote');
    return t('backgroundTasks.routeOther');
  };

  const openTask = async (task: PluginTaskProgress) => {
    closeBackgroundTasks();
    const kind = kindOf(task);
    if (kind === 'sync') openPanelTab('sync');
    else if (kind === 'transcription') openTranscriptionOverlay();
    else if (kind === 'ask') openAskTab();
    else if (kind === 'summary') openNoteView('summary');
    else if (kind === 'cards') openNoteView('cards');
    else openPanelTab('note');
    await plugin.activateView();
  };
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal to="#wisemindai-obsidian-root">
      <DialogOverlay class="wm-modal-overlay" />
      <DialogContent class="wm-modal-box wm2-bg-tasks">
        <DialogTitle class="wm2-bg-tasks-title">
          <span>{{ t('backgroundTasks.title') }}</span>
          <span v-if="runningCount" class="wm2-badge">{{ runningCount }}</span>
        </DialogTitle>
        <DialogDescription class="wm-visually-hidden">{{ t('backgroundTasks.desc') }}</DialogDescription>
        <DialogClose as-child>
          <button class="wm2-icon-btn wm2-bg-tasks-close" type="button" :aria-label="t('shell.closeOverlay')">
            <XMarkIcon class="wm-icon" />
          </button>
        </DialogClose>

        <div v-if="tasks.length" class="wm2-bg-tasks-list">
          <button
            v-for="task in tasks"
            :key="task.id"
            class="wm2-bg-task"
            type="button"
            @click="openTask(task)"
          >
            <span v-if="task.status === 'running'" class="wm2-spinner"></span>
            <ExclamationCircleIcon v-else-if="task.status === 'failed'" class="wm-icon is-error" />
            <CheckCircleIcon v-else-if="task.status === 'completed'" class="wm-icon is-success" />
            <component :is="iconOf(task)" v-else class="wm-icon" />
            <div class="wm2-bg-task-body">
              <strong class="wm2-truncate">{{ task.title }}</strong>
              <span class="wm2-muted wm2-truncate">
                {{ task.message || routeLabel(task) }}
                <template v-if="task.total"> · {{ task.completed || 0 }}/{{ task.total }}</template>
              </span>
              <progress
                v-if="task.status === 'running' && task.total"
                class="wm2-bg-task-progress"
                :value="task.completed || 0"
                :max="task.total"
              ></progress>
            </div>
          </button>
        </div>
        <div v-else class="wm2-bg-tasks-empty wm2-muted">{{ t('backgroundTasks.empty') }}</div>
        <p class="wm2-muted wm2-bg-tasks-hint">{{ t('backgroundTasks.hint') }}</p>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
