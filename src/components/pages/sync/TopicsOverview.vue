<script setup lang="ts">
  import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowTopRightOnSquareIcon,
    ChevronLeftIcon,
    PlusIcon,
    TrashIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice, type TFile} from 'obsidian';

  import {useActiveNote} from '../../../composables/useActiveNote';
  import {usePlugin} from '../../../composables/usePlugin';
  import {FEATURES} from '../../../features';
  import {hasFeature} from '../../../services/capabilities';
  import {closeTopicsOverview} from '../../../services/panelStore';
  import type {SyncRule} from '../../../types';

  type TopicRow = {
    id: number;
    name: string;
    ruleLabel: string;
    colorClass: string;
  };

  const COLORS = ['is-primary', 'is-info', 'is-secondary', 'is-accent', 'is-success'];

  const {t} = useI18n();
  const plugin = usePlugin();
  const {activeFile} = useActiveNote();

  const loading = ref(false);
  const joining = ref(false);
  const leaving = ref(false);
  const remoteTopics = ref<Array<{id: number; name: string}>>([]);
  const noteTopicIds = ref<number[]>([]);
  const leaveConfirmId = ref<number | null>(null);

  const ruleLabel = (rule: SyncRule) =>
    rule.kind === 'tag' ? `#${rule.value}` : rule.value || t('syncRules.wholeVault');

  const linkedTopics = computed<TopicRow[]>(() => {
    const map = new Map<number, TopicRow>();
    let colorIndex = 0;
    for (const rule of plugin.settings.syncRules) {
      if (!rule.enabled) continue;
      rule.knowledgeBaseIds.forEach((id, index) => {
        if (!Number.isFinite(id) || id <= 0 || map.has(id)) return;
        const name = rule.knowledgeBaseNames[index] || remoteTopics.value.find(topic => topic.id === id)?.name || String(id);
        map.set(id, {
          id,
          name,
          ruleLabel: t('topicsOverview.ruleLabel', {rule: ruleLabel(rule)}),
          colorClass: COLORS[colorIndex++ % COLORS.length],
        });
      });
    }
    return [...map.values()];
  });

  const noteTopics = computed(() =>
    linkedTopics.value.filter(topic => noteTopicIds.value.includes(topic.id)),
  );

  const joinableTopics = computed(() =>
    linkedTopics.value.filter(topic => !noteTopicIds.value.includes(topic.id)),
  );

  const loadRemote = async () => {
    if (!plugin.connected || !hasFeature(FEATURES.topics)) return;
    loading.value = true;
    try {
      const bases = await plugin.api.listKnowledgeBases();
      remoteTopics.value = (Array.isArray(bases) ? bases : [])
        .map((base: {id?: unknown; name?: unknown}) => ({id: Number(base.id), name: String(base.name || '')}))
        .filter(base => base.id > 0 && base.name);
    } catch {
      remoteTopics.value = [];
    } finally {
      loading.value = false;
    }
  };

  const loadNoteTopics = async (file: TFile | null) => {
    noteTopicIds.value = [];
    leaveConfirmId.value = null;
    if (!file || !plugin.connected) return;
    const record = plugin.syncEngine.index.get(file.path);
    if (record?.topicIds?.length) {
      noteTopicIds.value = [...record.topicIds];
      return;
    }
    if (!record?.remoteId || !hasFeature(FEATURES.topics)) return;
    try {
      const remote = await plugin.api.getFile(record.remoteId);
      const bases = Array.isArray(remote?.knowledgeBases) ? (remote?.knowledgeBases as Array<{id?: unknown}>) : [];
      noteTopicIds.value = bases
        .map(base => Number(base.id))
        .filter(id => Number.isFinite(id) && id > 0);
    } catch {
      noteTopicIds.value = [];
    }
  };

  watch(
    () => activeFile.value?.path,
    () => {
      void loadNoteTopics(activeFile.value);
    },
  );

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (leaveConfirmId.value) {
      leaveConfirmId.value = null;
      event.preventDefault();
      return;
    }
    event.preventDefault();
    closeTopicsOverview();
  };

  onMounted(() => {
    void loadRemote();
    void loadNoteTopics(activeFile.value);
    window.addEventListener('keydown', onKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown);
  });

  const openTopic = (topicId: number) => {
    void plugin.api.openSource({type: 'topic', id: topicId}).catch(() => undefined);
  };

  const joinTopic = async (topicId: number) => {
    const file = activeFile.value;
    if (!file || joining.value) return;
    const record = plugin.syncEngine.index.get(file.path);
    if (!record?.remoteId) {
      new Notice(t('topicsOverview.noNote'));
      return;
    }
    joining.value = true;
    try {
      const remote = await plugin.api.getFile(record.remoteId);
      await plugin.api.addFileToTopic({
        knowledgeBaseId: topicId,
        sourceId: record.remoteId,
        title: file.basename,
        fileUrl: String(remote?.filePath || ''),
        size: file.stat.size,
      });
      noteTopicIds.value = [...new Set([...noteTopicIds.value, topicId])];
      plugin.syncEngine.index.set(file.path, {...record, topicIds: [...noteTopicIds.value]});
    } catch (error: any) {
      new Notice(error?.message || t('syncRules.failed'));
    } finally {
      joining.value = false;
    }
  };

  const confirmLeave = (topicId: number) => {
    leaveConfirmId.value = topicId;
  };

  const leaveTopic = async () => {
    const topicId = leaveConfirmId.value;
    const file = activeFile.value;
    if (!topicId || !file || leaving.value) return;
    leaving.value = true;
    try {
      // Leaving is confirmed in the client when the document id is unknown; drop local link and open topic.
      noteTopicIds.value = noteTopicIds.value.filter(id => id !== topicId);
      const record = plugin.syncEngine.index.get(file.path);
      if (record) {
        plugin.syncEngine.index.set(file.path, {...record, topicIds: [...noteTopicIds.value]});
      }
      leaveConfirmId.value = null;
      void plugin.api.openSource({type: 'topic', id: topicId}).catch(() => undefined);
    } finally {
      leaving.value = false;
    }
  };
</script>

<template>
  <section class="wm2-topics-overview" tabindex="-1">
    <div class="wm2-subbar">
      <button class="wm2-btn is-ghost is-xs" type="button" @click="closeTopicsOverview">
        <ChevronLeftIcon class="wm-icon" />
        {{ t('topicsOverview.back') }}
      </button>
      <strong>{{ t('topicsOverview.title') }}</strong>
    </div>

    <div class="wm2-section">
      <h4 class="wm2-section-title">{{ t('topicsOverview.linked') }}</h4>
      <div v-if="linkedTopics.length" class="wm2-card wm2-topics-list">
        <div v-for="topic in linkedTopics" :key="topic.id" class="wm2-topics-row">
          <span class="wm2-topics-dot" :class="topic.colorClass"></span>
          <div class="wm2-topics-meta">
            <strong class="wm2-truncate">{{ topic.name }}</strong>
            <span class="wm2-muted wm2-truncate">{{ topic.ruleLabel }}</span>
          </div>
          <button class="wm2-btn is-ghost is-xs" type="button" @click="openTopic(topic.id)">
            {{ t('topicsOverview.detail') }}
          </button>
        </div>
      </div>
      <p v-else class="wm2-muted">{{ loading ? t('shared.loading') : t('topicsOverview.empty') }}</p>
    </div>

    <div class="wm2-section">
      <h4 class="wm2-section-title">
        {{ t('topicsOverview.currentNote') }}
        <small v-if="activeFile" class="wm2-truncate">{{ activeFile.basename }}</small>
      </h4>
      <div v-if="!activeFile" class="wm2-muted">{{ t('topicsOverview.noNote') }}</div>
      <div v-else class="wm2-card wm2-topics-note">
        <div class="wm2-chips">
          <span v-for="topic in noteTopics" :key="topic.id" class="wm2-chip is-info">{{ topic.name }}</span>
          <span v-if="!noteTopics.length" class="wm2-muted">{{ t('topicsOverview.empty') }}</span>
        </div>
        <div class="wm2-topics-actions">
          <button
            v-for="topic in joinableTopics"
            :key="`join-${topic.id}`"
            class="wm2-btn is-xs"
            type="button"
            :disabled="joining"
            @click="joinTopic(topic.id)"
          >
            <PlusIcon class="wm-icon" />
            {{ t('topicsOverview.join') }} · {{ topic.name }}
          </button>
          <button
            v-for="topic in noteTopics"
            :key="`leave-${topic.id}`"
            class="wm2-btn is-ghost is-xs"
            type="button"
            :disabled="leaving"
            @click="confirmLeave(topic.id)"
          >
            <TrashIcon class="wm-icon" />
            {{ t('topicsOverview.leave') }} · {{ topic.name }}
          </button>
        </div>
        <Transition name="wm2-collapse">
          <div v-if="leaveConfirmId" class="wm2-sync-alert is-warning" role="alert">
            <span>{{ t('topicsOverview.leaveConfirm') }}</span>
            <div class="wm2-topics-actions">
              <button class="wm2-btn is-xs" type="button" @click="leaveConfirmId = null">{{ t('common.cancel') }}</button>
              <button class="wm2-btn is-primary is-xs" type="button" :disabled="leaving" @click="leaveTopic">
                {{ t('topicsOverview.leaveConfirmOk') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <button
      v-if="linkedTopics.length"
      class="wm2-btn is-sm wm2-topics-open-client"
      type="button"
      @click="openTopic(linkedTopics[0].id)"
    >
      <ArrowTopRightOnSquareIcon class="wm-icon" />
      {{ t('topicsOverview.openInClient') }}
    </button>
  </section>
</template>
