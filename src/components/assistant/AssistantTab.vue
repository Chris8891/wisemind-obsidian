<script setup lang="ts">
  import {computed, nextTick, reactive, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {ChevronLeftIcon, ClockIcon} from '@heroicons/vue/24/outline';

  import {
    ASSISTANT_ACTION_EVENT,
    type NoteView,
    openChatWithMessage,
    openNoteView,
    openPanelTab,
    panelState,
    queueAssistantAction,
  } from '../../services/panelStore';
  import type {TaskHistoryType} from '../../services/taskHistory';
  import CardsPage from '../pages/CardsPage.vue';
  import SummaryPage from '../pages/SummaryPage.vue';
  import WmTooltip from '../WmTooltip.vue';

  import AssistantWorkbench from './AssistantWorkbench.vue';

  const emit = defineEmits<{
    openHistory: [type: TaskHistoryType];
  }>();

  const {t} = useI18n();

  type SubView = Exclude<NoteView, 'workbench'>;

  // Sub pages mount on first use and stay alive so running generations keep streaming.
  const visited = reactive<Record<SubView, boolean>>({summary: false, cards: false});
  watch(
    () => panelState.noteView,
    view => {
      if (view !== 'workbench') visited[view] = true;
    },
    {immediate: true},
  );

  const subTitle = computed(() => {
    if (panelState.noteView === 'summary') {
      return t(panelState.summaryPreset === 'insights' ? 'workbench.insights' : 'workbench.summary');
    }
    if (panelState.noteView === 'cards') return t('workbench.cards');
    return '';
  });

  const historyFor = (type: SubView) =>
    panelState.history?.type === type ? panelState.history : {id: '', token: 0};

  // All views share the panel's scroll box, so each view remembers its own offset across switches.
  const rootEl = ref<HTMLElement | null>(null);
  const scrollOffsets: Partial<Record<NoteView, number>> = {};
  const scrollBox = () => rootEl.value?.closest<HTMLElement>('.wm2-main') ?? null;
  watch(
    () => panelState.noteView,
    async (view, previous) => {
      const box = scrollBox();
      if (!box || !previous) return;
      scrollOffsets[previous] = box.scrollTop;
      await nextTick();
      box.scrollTop = scrollOffsets[view] ?? 0;
    },
  );

  // Esc inside a sub page goes back, unless the user is typing; popovers and dialogs are portaled so their Esc never reaches here.
  const onRootKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || panelState.noteView === 'workbench') return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    openNoteView('workbench');
  };

  // Pages subscribe to the action event in onMounted, so wait until they exist before dispatching.
  watch(
    () => panelState.pendingAction?.token,
    async () => {
      const pending = panelState.pendingAction;
      if (!pending) return;
      const target: SubView = pending.kind === 'cards' ? 'cards' : 'summary';
      visited[target] = true;
      await nextTick();
      const {token: _token, ...plan} = pending;
      panelState.pendingAction = null;
      window.dispatchEvent(new CustomEvent(ASSISTANT_ACTION_EVENT, {detail: plan}));
    },
    {immediate: true},
  );

  const openCardsWithSummary = (payload: {title: string; sourcePath?: string; markdown: string}) => {
    queueAssistantAction({
      kind: 'cards',
      sourceKind: 'selection',
      sourceTitle: t('assistant.summaryCards', {title: payload.title || t('assistant.summary')}),
      sourcePath: payload.sourcePath || '',
      content: payload.markdown,
    });
  };
</script>

<template>
  <div ref="rootEl" class="wm2-assistant" @keydown="onRootKeydown">
    <!--
      Keep panes mounted (display toggle). Vue Transition does not animate v-show,
      so each active pane uses .wm2-keep-pane.is-active for a soft enter.
    -->
    <div
      class="wm2-keep-pane"
      :class="{'is-active': panelState.noteView === 'workbench'}"
      :aria-hidden="panelState.noteView !== 'workbench'"
    >
      <AssistantWorkbench @open-history="emit('openHistory', $event)" />
    </div>

    <Transition name="wm2-collapse">
      <div v-if="panelState.noteView !== 'workbench'" class="wm2-subbar">
        <WmTooltip :content="t('workbench.backHint')" side="bottom">
          <button class="wm2-btn is-ghost is-xs" type="button" @click="openNoteView('workbench')">
            <ChevronLeftIcon class="wm-icon" />
            {{ t('shell.tabs.note') }}
          </button>
        </WmTooltip>
        <span class="wm2-subbar-sep wm2-muted">/</span>
        <strong class="wm2-truncate" :title="subTitle">{{ subTitle }}</strong>
        <WmTooltip :content="t('shell.history')" side="bottom">
          <button
            class="wm2-icon-btn is-sm"
            type="button"
            @click="emit('openHistory', panelState.noteView as SubView)"
          >
            <span class="wm-visually-hidden">{{ t('shell.history') }}</span>
            <ClockIcon class="wm-icon" />
          </button>
        </WmTooltip>
      </div>
    </Transition>

    <div
      v-if="visited.summary"
      class="wm2-keep-pane wm-tab-content"
      :class="{'is-active': panelState.noteView === 'summary'}"
      :aria-hidden="panelState.noteView !== 'summary'"
    >
      <SummaryPage
        :history-item-id="historyFor('summary').id"
        :history-token="historyFor('summary').token"
        @open-history="emit('openHistory', 'summary')"
        @open-chat="openChatWithMessage"
        @open-cards="openCardsWithSummary"
        @open-sync="openPanelTab('sync')"
      />
    </div>
    <div
      v-if="visited.cards"
      class="wm2-keep-pane wm-tab-content"
      :class="{'is-active': panelState.noteView === 'cards'}"
      :aria-hidden="panelState.noteView !== 'cards'"
    >
      <CardsPage
        :history-item-id="historyFor('cards').id"
        :history-token="historyFor('cards').token"
        @open-history="emit('openHistory', 'cards')"
      />
    </div>
  </div>
</template>
