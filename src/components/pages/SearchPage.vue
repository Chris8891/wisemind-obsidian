<script lang="ts">
  import {ref} from 'vue';

  type SearchScope = 'all' | 'obsidian' | 'wisemind';
  type SearchResult = {
    id: string;
    source: 'obsidian' | 'wisemind';
    title: string;
    description: string;
    path?: string;
    content?: string;
    wiseMindType?: 'note' | 'file' | 'knowledge-document' | 'card';
    remoteId?: string;
    deckId?: string;
    folderId?: string;
    knowledgeBaseId?: string;
    relevanceReason?: string;
    relevanceScore?: number;
  };

  type HighlightPart = {
    text: string;
    matched: boolean;
  };

  const sharedSearchPageState = {
    query: ref(''),
    searchedKeyword: ref(''),
    scope: ref<SearchScope>('all'),
    loading: ref(false),
    wiseMindResults: ref<SearchResult[]>([]),
    searched: ref(false),
    searchHistory: ref<string[]>([]),
    historyOpen: ref(false),
    searchRequestId: ref(0),
  };
</script>

<script setup lang="ts">
  import {computed, onMounted, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    ClockIcon,
    DocumentTextIcon,
    MagnifyingGlassIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';

  import {usePlugin} from '../../composables/usePlugin';
  import {useVaultNotes} from '../../composables/useVaultNotes';
  import {openObsidianNote} from '../../services/noteNavigation';
  import WmTooltip from '../WmTooltip.vue';

  const props = defineProps<{
    draftKeyword?: string;
    draftToken?: number;
  }>();
  const emit = defineEmits<{
    openChat: [message: string];
    openSync: [];
  }>();

  const SEARCH_HISTORY_STORAGE_KEY = 'wisemindai-obsidian:search-history';
  const MAX_SEARCH_HISTORY = 20;

  const plugin = usePlugin();
  const {t} = useI18n();
  const {notes, refresh} = useVaultNotes();
  const {
    query,
    searchedKeyword,
    scope,
    loading,
    wiseMindResults,
    searched,
    searchHistory,
    historyOpen,
    searchRequestId,
  } = sharedSearchPageState;

  const obsidianResults = computed<SearchResult[]>(() => {
    const keyword = searchedKeyword.value.trim().toLowerCase();
    if (!keyword || scope.value === 'wisemind') return [];
    return notes.value
      .map(note => {
        const titleMatched = note.title.toLowerCase().includes(keyword);
        const tagMatched = (note.tags || []).some(tag => tag.toLowerCase().includes(keyword));
        const pathMatched = note.path.toLowerCase().includes(keyword);
        const contentMatched = note.plainText.toLowerCase().includes(keyword);
        const folderMatched = note.folderPath.toLowerCase().includes(keyword);
        const score =
          (titleMatched ? 100 : 0) +
          (tagMatched ? 80 : 0) +
          (pathMatched ? 55 : 0) +
          (folderMatched ? 45 : 0) +
          (contentMatched ? 25 : 0);
        const reason = titleMatched
          ? t('searchPage.reasonTitle')
          : tagMatched
            ? t('searchPage.reasonTag')
            : pathMatched
              ? t('searchPage.reasonPath')
              : folderMatched
                ? t('searchPage.reasonFolder')
                : contentMatched
                  ? t('searchPage.reasonContent')
                  : '';
        return {
          id: note.path,
          source: 'obsidian' as const,
          title: note.title,
          description: note.folderPath || t('searchPage.rootFolder'),
          path: note.path,
          content: note.plainText,
          relevanceReason: reason,
          relevanceScore: score,
        };
      })
      .filter(result => Number(result.relevanceScore || 0) > 0)
      .sort((a, b) => Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0))
      .slice(0, 30);
  });

  const visibleWiseMindResults = computed(() =>
    scope.value === 'obsidian' ? [] : wiseMindResults.value,
  );

  const results = computed(() => [...obsidianResults.value, ...visibleWiseMindResults.value]);
  const canClearSearchResults = computed(
    () => searched.value || loading.value || Boolean(searchedKeyword.value),
  );

  const normalizeWiseMindResult = (item: any, index: number): SearchResult => ({
    id: `wisemind:content:${item?.id ?? index}`,
    source: 'wisemind',
    title: String(item?.title || item?.name || item?.label || t('searchPage.wisemindContent')),
    description: String(item?.type || item?.sourceType || item?.folderPath || 'WiseMindAI'),
    content: String(item?.content || item?.text || item?.markdown || item?.summary || ''),
    wiseMindType: item?.wiseMindType,
    remoteId: item?.id === undefined ? '' : String(item.id),
    deckId: item?.deckId === undefined ? undefined : String(item.deckId),
    folderId: item?.folderId === undefined ? undefined : String(item.folderId),
    knowledgeBaseId: item?.knowledgeBaseId === undefined ? undefined : String(item.knowledgeBaseId),
  });

  const normalizeWiseMindResults = (response: any): SearchResult[] => {
    const payload = response?.data ?? response;
    if (Array.isArray(payload)) return payload.slice(0, 30).map(normalizeWiseMindResult);
    if (!payload || typeof payload !== 'object') return [];

    const groups: Array<[string, SearchResult['wiseMindType'], any[]]> = [
      [t('searchPage.notes'), 'note', Array.isArray(payload.notes) ? payload.notes : []],
      [t('searchPage.files'), 'file', Array.isArray(payload.files) ? payload.files : []],
      [
        t('searchPage.knowledgeDocuments'),
        'knowledge-document',
        Array.isArray(payload['knowledge-documents']) ? payload['knowledge-documents'] : [],
      ],
      [t('searchPage.cards'), 'card', Array.isArray(payload.cards) ? payload.cards : []],
    ];

    return groups
      .flatMap(([label, wiseMindType, items]) =>
        items.slice(0, 12).map((item, index) => ({
          id: `wisemind:${label}:${item?.id ?? index}`,
          source: 'wisemind' as const,
          title: String(item?.title || item?.name || item?.snippet || `${label} ${index + 1}`),
          description: label,
          content: String(item?.snippet || item?.content || item?.text || item?.summary || ''),
          wiseMindType,
          remoteId: item?.id === undefined ? '' : String(item.id),
          deckId: item?.deckId === undefined ? undefined : String(item.deckId),
          folderId: item?.folderId === undefined ? undefined : String(item.folderId),
          knowledgeBaseId:
            item?.knowledgeBaseId === undefined ? undefined : String(item.knowledgeBaseId),
        })),
      )
      .slice(0, 30);
  };

  const loadSearchHistory = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY) || '[]');
      searchHistory.value = Array.isArray(parsed)
        ? parsed.filter(item => typeof item === 'string').slice(0, MAX_SEARCH_HISTORY)
        : [];
    } catch {
      searchHistory.value = [];
    }
  };

  const rememberSearchKeyword = (keyword: string) => {
    const normalized = keyword.trim();
    if (!normalized) return;
    const next = [
      normalized,
      ...searchHistory.value.filter(item => item.toLowerCase() !== normalized.toLowerCase()),
    ].slice(0, MAX_SEARCH_HISTORY);
    searchHistory.value = next;
    localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(next));
  };

  const applyHistoryKeyword = (keyword: string) => {
    query.value = keyword;
    historyOpen.value = false;
  };

  const highlightedTitleParts = (title: string): HighlightPart[] => {
    const keyword = searchedKeyword.value.trim();
    if (!keyword) return [{text: title, matched: false}];

    const lowerTitle = title.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    const parts: HighlightPart[] = [];
    let cursor = 0;
    let matchIndex = lowerTitle.indexOf(lowerKeyword, cursor);

    while (matchIndex >= 0) {
      if (matchIndex > cursor) {
        parts.push({text: title.slice(cursor, matchIndex), matched: false});
      }
      parts.push({
        text: title.slice(matchIndex, matchIndex + keyword.length),
        matched: true,
      });
      cursor = matchIndex + keyword.length;
      matchIndex = lowerTitle.indexOf(lowerKeyword, cursor);
    }

    if (cursor < title.length) {
      parts.push({text: title.slice(cursor), matched: false});
    }
    return parts.length ? parts : [{text: title, matched: false}];
  };

  const search = async () => {
    const keyword = query.value.trim();
    if (!keyword) return;
    const requestId = searchRequestId.value + 1;
    searchRequestId.value = requestId;
    searched.value = true;
    searchedKeyword.value = keyword;
    historyOpen.value = false;
    rememberSearchKeyword(keyword);
    wiseMindResults.value = [];
    if (scope.value === 'obsidian') return;
    loading.value = true;
    try {
      const response: any = await plugin.api.search(keyword, [
        'notes',
        'files',
        'knowledge-documents',
        'cards',
      ]);
      if (requestId === searchRequestId.value) {
        wiseMindResults.value = normalizeWiseMindResults(response);
      }
    } catch (error: any) {
      if (requestId === searchRequestId.value && scope.value === 'wisemind') {
        new Notice(error?.message || t('searchPage.searchWiseMindFailed'));
      }
    } finally {
      if (requestId === searchRequestId.value) loading.value = false;
    }
  };

  const applyDraftSearch = (keywordValue?: string) => {
    const keyword = String(keywordValue || '').trim();
    if (!keyword) return;
    query.value = keyword;
    void search();
  };

  const clearSearchResults = () => {
    searchRequestId.value += 1;
    searched.value = false;
    searchedKeyword.value = '';
    wiseMindResults.value = [];
    loading.value = false;
    historyOpen.value = false;
  };

  const openResult = async (result: SearchResult) => {
    if (result.source === 'obsidian' && result.path) {
      await openObsidianNote(plugin.app, result.path, {
        moved: t('obsidianMessages.noteMoved'),
        openFailed: t('obsidianMessages.noteOpenFailed'),
      });
      return;
    }

    if (result.source === 'wisemind') {
      try {
        await plugin.api.openSource({
          type: result.wiseMindType,
          id: result.remoteId,
          title: result.title,
          deckId: result.deckId,
          folderId: result.folderId,
          knowledgeBaseId: result.knowledgeBaseId,
        });
        new Notice(t('searchPage.openedInWiseMind'));
      } catch (error: any) {
        new Notice(error?.message || t('searchPage.openWiseMindFailed'));
      }
    }
  };

  const continueChat = (result: SearchResult) => {
    const source = result.path || result.title;
    emit(
      'openChat',
      t('searchPage.continuePrompt', {
        source,
        keyword: searchedKeyword.value || query.value.trim(),
      }),
    );
  };

  onMounted(() => {
    loadSearchHistory();
    void refresh();
  });

  watch(
    () => props.draftToken,
    () => applyDraftSearch(props.draftKeyword),
    {immediate: true},
  );
</script>

<template>
  <section class="wm-page wm-search-page">
    <header class="wm-page-header">
      <div class="wm-title-line">
        <MagnifyingGlassIcon class="wm-title-icon" />
        <h2>{{ t('searchPage.title') }}</h2>
      </div>
      <WmTooltip :content="t('searchPage.clear')">
        <button
          class="wm-icon-button"
          type="button"
          :disabled="!canClearSearchResults"
          :aria-label="t('searchPage.clear')"
          @click="clearSearchResults"
        >
          <XMarkIcon class="wm-icon" />
        </button>
      </WmTooltip>
    </header>

    <div class="wm-search-layout">
      <div class="wm-search-input-row">
        <MagnifyingGlassIcon class="wm-icon" />
        <input
          v-model="query"
          class="wm-search-input"
          :placeholder="t('searchPage.placeholder')"
          @keydown.enter.prevent="search"
        />
        <button
          class="wm-button is-primary wm-search-submit"
          type="button"
          :disabled="loading"
          @click="search"
        >
          <span v-if="loading" class="wm-loading-spinner"></span>
          <MagnifyingGlassIcon v-else class="wm-icon" />
          {{ t('searchPage.search') }}
        </button>
        <div class="wm-search-history-menu">
          <button
            class="wm-button wm-search-history-trigger"
            type="button"
            @click.stop="historyOpen = !historyOpen"
          >
            <ClockIcon class="wm-icon" />
            {{ t('searchPage.history') }}
          </button>
          <div v-if="historyOpen" class="wm-search-history-popover">
            <button
              v-for="keyword in searchHistory"
              :key="keyword"
              class="wm-search-history-chip"
              type="button"
              @click="applyHistoryKeyword(keyword)"
            >
              {{ keyword }}
            </button>
            <p v-if="!searchHistory.length">{{ t('searchPage.emptyHistory') }}</p>
          </div>
        </div>
      </div>

      <div class="wm-search-tabs" role="tablist" :aria-label="t('searchPage.scope')">
        <button
          class="wm-search-tab"
          :class="{'is-active': scope === 'all'}"
          type="button"
          @click="scope = 'all'"
        >
          {{ t('searchPage.all') }}
        </button>
        <button
          class="wm-search-tab"
          :class="{'is-active': scope === 'obsidian'}"
          type="button"
          @click="scope = 'obsidian'"
        >
          Obsidian
        </button>
        <button
          class="wm-search-tab"
          :class="{'is-active': scope === 'wisemind'}"
          type="button"
          @click="scope = 'wisemind'"
        >
          WiseMindAI
        </button>
      </div>

      <div class="wm-search-results">
        <template v-if="searched">
          <template v-if="results.length">
            <article v-for="result in results" :key="result.id" class="wm-search-result">
              <div class="wm-search-result-main">
                <DocumentTextIcon class="wm-search-result-icon" />
                <div class="wm-search-result-text">
                  <h3>
                    <template
                      v-for="(part, index) in highlightedTitleParts(result.title)"
                      :key="`${result.id}:title:${index}`"
                    >
                      <mark v-if="part.matched" class="wm-search-highlight">{{ part.text }}</mark>
                      <span v-else>{{ part.text }}</span>
                    </template>
                  </h3>
                  <p>
                    {{ result.source === 'obsidian' ? 'Obsidian' : 'WiseMindAI' }} ·
                    {{ result.description }}
                  </p>
                  <div v-if="result.relevanceReason" class="wm-search-reason">
                    {{ result.relevanceReason }}
                  </div>
                </div>
              </div>
              <div class="wm-search-result-actions">
                <button class="wm-button" type="button" @click="openResult(result)">
                  {{ t('searchPage.open') }}
                </button>
                <button
                  v-if="result.source === 'obsidian'"
                  class="wm-button"
                  type="button"
                  @click="continueChat(result)"
                >
                  <ChatBubbleOvalLeftEllipsisIcon class="wm-icon" />
                  {{ t('searchPage.continueChat') }}
                </button>
                <button
                  v-if="result.source === 'obsidian'"
                  class="wm-button"
                  type="button"
                  @click="emit('openSync')"
                >
                  <ArrowPathIcon class="wm-icon" />
                  {{ t('searchPage.sync') }}
                </button>
              </div>
            </article>
          </template>

          <div v-else-if="!loading" class="wm-search-empty">{{ t('searchPage.noResults') }}</div>
        </template>

        <div v-else class="wm-search-empty">{{ t('searchPage.empty') }}</div>
      </div>
    </div>
  </section>
</template>
