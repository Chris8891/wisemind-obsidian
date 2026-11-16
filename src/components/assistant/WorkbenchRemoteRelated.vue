<script setup lang="ts">
  import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {ArrowTopRightOnSquareIcon, CloudIcon} from '@heroicons/vue/24/outline';
  import {Notice, type TFile} from 'obsidian';

  import {usePlugin} from '../../composables/usePlugin';
  import {FEATURES} from '../../features';
  import {hasFeature} from '../../services/capabilities';
  import {panelState} from '../../services/panelStore';
  import {normalizeWiseMindSearch, readSearchMode, type WiseMindSearchHit} from '../../services/searchResults';

  const SEARCH_DELAY_MS = 600;
  const CACHE_LIMIT = 30;
  const RESULT_LIMIT = 4;
  const QUERY_CHAR_LIMIT = 200;

  const props = defineProps<{
    file: TFile | null;
    visible: boolean;
  }>();

  type Entry = {hits: WiseMindSearchHit[]; degraded: boolean};

  const {t} = useI18n();
  const plugin = usePlugin();
  const hits = shallowRef<WiseMindSearchHit[]>([]);
  const degraded = ref(false);
  const loading = ref(false);
  const cache = new Map<string, Entry>();
  let timer = 0;
  let requestId = 0;

  const enabled = computed(() => panelState.connected && hasFeature(FEATURES.semanticSearch));

  /** Title plus headings describe the note well enough without sending its full text. */
  const buildQuery = (file: TFile) => {
    const headings = plugin.app.metadataCache.getFileCache(file)?.headings?.slice(0, 5).map(item => item.heading) || [];
    return [file.basename, ...headings].join(' ').slice(0, QUERY_CHAR_LIMIT);
  };

  const load = async (file: TFile) => {
    const id = ++requestId;
    const cached = cache.get(file.path);
    if (cached) {
      hits.value = cached.hits;
      degraded.value = cached.degraded;
      return;
    }
    if (plugin.isFileExcluded(file)) {
      hits.value = [];
      return;
    }
    loading.value = true;
    try {
      const response = await plugin.api.search(buildQuery(file), ['files', 'knowledge-documents'], {
        mode: 'semantic',
        limit: RESULT_LIMIT,
      });
      if (id !== requestId) return;
      const entry = {hits: normalizeWiseMindSearch(response, RESULT_LIMIT).slice(0, RESULT_LIMIT), degraded: readSearchMode(response).degraded};
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
      cache.set(file.path, entry);
      hits.value = entry.hits;
      degraded.value = entry.degraded;
    } catch {
      if (id === requestId) hits.value = [];
    } finally {
      if (id === requestId) loading.value = false;
    }
  };

  const schedule = () => {
    window.clearTimeout(timer);
    const file = props.file;
    if (!file || !enabled.value || !props.visible) {
      if (!file) hits.value = [];
      return;
    }
    timer = window.setTimeout(() => void load(file), SEARCH_DELAY_MS);
  };

  watch(() => [props.file?.path, props.visible, enabled.value], schedule, {immediate: true});
  onBeforeUnmount(() => window.clearTimeout(timer));

  const open = async (hit: WiseMindSearchHit) => {
    try {
      await plugin.api.openSource({type: hit.type, id: hit.id, title: hit.title, knowledgeBaseId: hit.knowledgeBaseId});
    } catch (error) {
      new Notice((error as Error)?.message || t('searchPage.openWiseMindFailed'));
    }
  };
</script>

<template>
  <section v-if="enabled" class="wm2-section">
    <h4 class="wm2-section-title">
      <span>{{ t('workbench.remoteRelated') }}</span>
      <small>{{ t(degraded ? 'workbench.remoteRelatedKeyword' : 'workbench.remoteRelatedHint') }}</small>
    </h4>
    <ul v-if="loading && !hits.length" class="wm2-list" aria-busy="true">
      <li v-for="index in 2" :key="index" class="wm2-list-row wm2-skeleton-row">
        <span class="wm2-skeleton is-icon"></span>
        <span class="wm2-skeleton"></span>
      </li>
    </ul>
    <ul v-else-if="hits.length" class="wm2-list">
      <li v-for="hit in hits" :key="hit.key" class="wm2-list-row is-clickable" @click.self="open(hit)">
        <CloudIcon class="wm-icon" @click="open(hit)" />
        <button class="wm2-list-main wm2-plain-button" type="button" :title="hit.title" @click="open(hit)">
          <span class="wm2-truncate">{{ hit.title }}</span>
          <small v-if="hit.snippet" class="wm2-muted wm2-truncate">{{ hit.snippet }}</small>
        </button>
        <ArrowTopRightOnSquareIcon class="wm-icon" />
      </li>
    </ul>
    <p v-else class="wm2-muted">{{ t('workbench.remoteRelatedEmpty') }}</p>
  </section>
</template>
