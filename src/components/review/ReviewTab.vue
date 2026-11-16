<script setup lang="ts">
  import {computed, nextTick, onMounted, ref, shallowRef, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {AcademicCapIcon, ArrowPathIcon, CheckCircleIcon, PlayIcon} from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';

  import {useActiveNote} from '../../composables/useActiveNote';
  import {usePlugin} from '../../composables/usePlugin';
  import {estimateReviewMinutes, splitCardContent} from '../../services/cardReview';
  import {openAssistantView, panelState, setDueCount} from '../../services/panelStore';
  import type {ReviewCard, ReviewDueResult, WiseMindCardSummary} from '../../types';

  import ReviewSession from './ReviewSession.vue';

  const STALE_AFTER_MS = 60 * 1000;

  const plugin = usePlugin();
  const {t, locale} = useI18n();
  const {activeFile} = useActiveNote();

  const loading = ref(false);
  const failed = ref(false);
  const due = shallowRef<ReviewDueResult | null>(null);
  const noteCards = shallowRef<WiseMindCardSummary[]>([]);
  const sessionCards = shallowRef<ReviewCard[] | null>(null);
  const sessionKey = ref(0);
  const startingDeckId = ref<number | null>(null);
  const startingAll = ref(false);
  const noteCardsLoading = ref(false);
  const startButton = ref<HTMLButtonElement | null>(null);
  let loadedAt = 0;
  let noteCardsStale = false;
  let noteCardsRequest = 0;

  const reviewSettings = computed(() => plugin.settings.review);
  const pendingCount = computed(() => {
    const summary = due.value?.summary;
    if (!summary) return 0;
    return summary.due + (reviewSettings.value.includeNew ? summary.new : 0);
  });
  const deckPending = (deck: {due: number; new: number}) => deck.due + (reviewSettings.value.includeNew ? deck.new : 0);
  const initialLoading = computed(() => loading.value && !due.value);
  const nextDueText = computed(() => {
    const time = due.value?.nextDueAt;
    if (!time) return '';
    return new Date(time).toLocaleString(locale.value === 'en_US' ? 'en-US' : 'zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  });

  const loadNoteCards = async () => {
    noteCardsStale = false;
    const request = ++noteCardsRequest;
    const path = activeFile.value?.path;
    if (!path || !panelState.connected) {
      noteCards.value = [];
      noteCardsLoading.value = false;
      return;
    }
    noteCardsLoading.value = true;
    let cards: WiseMindCardSummary[] = [];
    try {
      cards = (await plugin.api.listCardsBySource(path, 100)) || [];
    } catch {
      cards = [];
    }
    // Switching notes quickly must not let a slower, older response overwrite the current note's cards.
    if (request !== noteCardsRequest) return;
    noteCards.value = cards;
    noteCardsLoading.value = false;
  };

  // Concurrent callers (tab switch, start button, start command) share one request so "start" never
  // runs against a half-loaded queue.
  let loadPromise: Promise<void> | null = null;
  const load = () => (loadPromise ??= runLoad().finally(() => (loadPromise = null)));

  const runLoad = async () => {
    if (!panelState.connected && !(await plugin.testConnection())) {
      due.value = null;
      return;
    }
    loading.value = true;
    failed.value = false;
    try {
      due.value = await plugin.api.getDueCards({
        includeNew: reviewSettings.value.includeNew,
        limit: reviewSettings.value.sessionLimit,
      });
      loadedAt = Date.now();
      setDueCount(pendingCount.value);
      plugin.statusBar?.setDueCount(pendingCount.value);
    } catch {
      failed.value = true;
    } finally {
      loading.value = false;
    }
    void loadNoteCards();
  };

  const startSession = (cards: ReviewCard[]) => {
    if (!cards.length) return;
    sessionCards.value = cards;
    sessionKey.value += 1;
  };

  const startAll = async () => {
    if (startingAll.value) return;
    startingAll.value = true;
    try {
      if (!due.value || Date.now() - loadedAt > STALE_AFTER_MS) await load();
    } finally {
      startingAll.value = false;
    }
    startSession(due.value?.cards || []);
  };

  const startDeck = async (deckId: number) => {
    if (startingDeckId.value !== null) return;
    startingDeckId.value = deckId;
    const result = await plugin.api
      .getDueCards({deckId, includeNew: reviewSettings.value.includeNew, limit: reviewSettings.value.sessionLimit})
      .catch(() => null)
      .finally(() => {
        startingDeckId.value = null;
      });
    if (!result) new Notice(t('review.loadFailed'));
    else if (!result.cards.length) new Notice(t('review.allDone'));
    startSession(result?.cards || []);
  };

  /** Reviews every card of the active note, starting from the clicked one. */
  const startNote = (from = 0) => {
    const cards = [...noteCards.value.slice(from), ...noteCards.value.slice(0, from)];
    startSession(
      cards.map(card => ({
        id: card.id,
        deckId: card.deckId,
        deckTitle: activeFile.value?.basename || '',
        folderId: card.folderId,
        content: card.content,
        tags: [],
        sourcePath: card.sourcePath || activeFile.value?.path || null,
        sourceAnchor: card.sourceAnchor || null,
        review: {status: 'new', dueAt: 0, lastGrade: null, lastReviewedAt: 0, rememberStreak: 0, reviewCount: 0, forgotCount: 0},
      })),
    );
  };

  const exitSession = async (saved: boolean) => {
    sessionCards.value = null;
    if (saved) void load();
    // The session held keyboard focus; hand it back to the overview instead of dropping it on the body.
    await nextTick();
    startButton.value?.focus({preventScroll: true});
  };

  const notePreview = (content: string) => splitCardContent(content).question.replace(/\s+/g, ' ').slice(0, 120);

  // Note cards are only fetched while this tab is visible; switching notes elsewhere just marks them stale.
  watch(
    () => activeFile.value?.path,
    () => {
      if (panelState.tab === 'review') void loadNoteCards();
      else noteCardsStale = true;
    },
  );
  watch(
    () => panelState.tab,
    tab => {
      if (tab !== 'review' || sessionCards.value) return;
      if (Date.now() - loadedAt > STALE_AFTER_MS) void load();
      else if (noteCardsStale) void loadNoteCards();
    },
  );
  watch(
    () => panelState.reviewStartToken,
    async token => {
      if (token) await startAll();
    },
  );
  watch(
    () => panelState.connected,
    connected => {
      if (connected && !due.value) void load();
    },
  );

  onMounted(async () => {
    await load();
    if (panelState.reviewStartToken) startSession(due.value?.cards || []);
  });
</script>

<template>
  <div class="wm2-review">
    <Transition name="wm2-view" mode="out-in">
      <ReviewSession
        v-if="sessionCards"
        :key="`session-${sessionKey}`"
        :cards="sessionCards"
        @exit="exitSession"
        @again="startSession"
      />

      <div v-else key="overview" class="wm2-review-overview">
        <div v-if="!panelState.connected" class="wm2-empty">
          <AcademicCapIcon class="wm2-empty-icon" />
          <p>{{ t('review.disconnected') }}</p>
          <button class="wm2-btn is-primary is-sm" type="button" @click="load">{{ t('review.refresh') }}</button>
        </div>

        <template v-else>
          <section class="wm2-card is-highlight wm2-review-hero" :aria-busy="loading">
            <div class="wm2-review-hero-head">
              <span class="wm2-muted">{{ t('review.title') }}</span>
              <button
                class="wm2-icon-btn is-sm"
                type="button"
                :aria-label="t('review.refresh')"
                :title="t('review.refresh')"
                :disabled="loading"
                @click="load"
              >
                <ArrowPathIcon class="wm-icon" :class="{'wm2-spin': loading}" />
              </button>
            </div>

            <template v-if="initialLoading">
              <span class="wm2-review-skeleton is-count"></span>
              <div class="wm2-row wm2-chips">
                <span v-for="n in 3" :key="n" class="wm2-review-skeleton is-chip"></span>
              </div>
              <span class="wm2-review-skeleton is-button"></span>
            </template>

            <template v-else-if="due">
              <div class="wm2-review-count">
                <strong class="wm2-tabular">{{ pendingCount }}</strong>
                <span>{{ t('review.unit') }}</span>
                <span v-if="pendingCount" class="wm2-muted">· {{ t('review.estimate', {minutes: estimateReviewMinutes(pendingCount)}) }}</span>
              </div>
              <div class="wm2-row wm2-chips">
                <span class="wm2-chip is-due">{{ t('review.dueCount', {count: due.summary.due}) }}</span>
                <span v-if="reviewSettings.includeNew" class="wm2-chip is-new">{{ t('review.newCount', {count: due.summary.new}) }}</span>
                <span class="wm2-chip">{{ t('review.learningCount', {count: due.summary.learning}) }}</span>
              </div>
              <p v-if="failed" class="wm2-text-warning">{{ t('review.loadFailed') }}</p>
              <button
                ref="startButton"
                class="wm2-btn is-primary is-block"
                type="button"
                :disabled="!pendingCount || startingAll"
                :title="pendingCount ? t('review.start') : t('review.allDone')"
                @click="startAll"
              >
                <span v-if="startingAll" class="wm2-spinner"></span>
                <PlayIcon v-else class="wm-icon" />
                {{ t('review.start') }}
              </button>
              <div v-if="!pendingCount" class="wm2-review-done" role="status">
                <CheckCircleIcon class="wm-icon" />
                <div class="wm2-review-done-text">
                  <strong>{{ t('review.allDone') }}</strong>
                  <small v-if="nextDueText" class="wm2-tabular">{{ t('review.nextDue', {time: nextDueText}) }}</small>
                </div>
                <button v-if="noteCards.length" class="wm2-btn is-ghost is-xs is-link" type="button" @click="startNote()">
                  {{ t('review.practiceNote') }}
                </button>
                <button v-else-if="activeFile" class="wm2-btn is-ghost is-xs is-link" type="button" @click="openAssistantView('workbench')">
                  {{ t('review.makeCards') }}
                </button>
              </div>
            </template>

            <div v-else-if="failed" class="wm2-row">
              <p class="wm2-text-warning">{{ t('review.loadFailed') }}</p>
              <button class="wm2-btn is-sm" type="button" @click="load">
                <ArrowPathIcon class="wm-icon" />
                {{ t('review.refresh') }}
              </button>
            </div>
          </section>

          <section v-if="initialLoading" class="wm2-section" aria-hidden="true">
            <span class="wm2-review-skeleton is-title"></span>
            <ul class="wm2-card wm2-list-card wm2-review-list">
              <li v-for="n in 3" :key="n" class="wm2-review-skeleton-row">
                <span class="wm2-review-skeleton is-tile"></span>
                <span class="wm2-review-skeleton is-line"></span>
              </li>
            </ul>
          </section>

          <section v-else-if="due?.decks.length" class="wm2-section">
            <h4 class="wm2-section-title">
              <span>{{ t('review.byDeck') }}</span>
              <small class="wm2-tabular">{{ due.decks.length }}</small>
            </h4>
            <ul class="wm2-card wm2-list-card wm2-review-list">
              <li v-for="deck in due.decks" :key="deck.deckId">
                <button
                  class="wm2-plain-button wm2-review-row"
                  :class="{'is-empty': !deckPending(deck), 'is-starting': startingDeckId === deck.deckId}"
                  type="button"
                  :disabled="startingDeckId !== null || !deckPending(deck)"
                  :aria-busy="startingDeckId === deck.deckId"
                  :aria-label="`${t('review.startDeck')}: ${deck.title}`"
                  :title="deckPending(deck) ? `${t('review.startDeck')}\n${deck.title}` : deck.title"
                  @click="startDeck(deck.deckId)"
                >
                  <span class="wm2-tile is-secondary"><AcademicCapIcon class="wm-icon" /></span>
                  <span class="wm2-list-main">
                    <strong class="wm2-truncate">{{ deck.title }}</strong>
                    <small class="wm2-muted wm2-truncate wm2-tabular">
                      {{ t('review.deckMeta', {total: deck.total}) }} ·
                      {{ t('review.dueCount', {count: deck.due}) }}
                      <template v-if="reviewSettings.includeNew"> · {{ t('review.newCount', {count: deck.new}) }}</template>
                    </small>
                  </span>
                  <span class="wm2-chip wm2-tabular" :class="{'is-due': deckPending(deck)}">{{ deckPending(deck) }}</span>
                  <span v-if="startingDeckId === deck.deckId" class="wm2-spinner"></span>
                  <PlayIcon v-else class="wm-icon wm2-review-row-play" />
                </button>
              </li>
            </ul>
          </section>

          <section v-if="activeFile" class="wm2-section">
            <h4 class="wm2-section-title">
              <span class="wm2-review-section-label">
                {{ t('review.noteCards') }}
                <small v-if="noteCards.length" class="wm2-tabular">{{ noteCards.length }}</small>
              </span>
              <button v-if="noteCards.length" class="wm2-btn is-ghost is-xs is-link" type="button" @click="startNote()">
                {{ t('review.start') }}
              </button>
            </h4>
            <ul v-if="noteCards.length" class="wm2-card wm2-list-card wm2-review-list">
              <li v-for="(card, cardIndex) in noteCards.slice(0, 20)" :key="card.id">
                <button
                  class="wm2-plain-button wm2-review-row is-note"
                  type="button"
                  :title="notePreview(card.content)"
                  @click="startNote(cardIndex)"
                >
                  <span class="wm2-list-main wm2-clamp-2">{{ notePreview(card.content) }}</span>
                  <PlayIcon class="wm-icon wm2-review-row-play" />
                </button>
              </li>
            </ul>
            <ul v-else-if="noteCardsLoading" class="wm2-card wm2-list-card wm2-review-list" aria-hidden="true">
              <li v-for="n in 2" :key="n" class="wm2-review-skeleton-row">
                <span class="wm2-review-skeleton is-line"></span>
              </li>
            </ul>
            <div v-else class="wm2-empty is-compact">
              <p class="wm2-muted">{{ t('review.noteCardsEmpty') }}</p>
              <button class="wm2-btn is-sm" type="button" @click="openAssistantView('workbench')">{{ t('review.makeCards') }}</button>
            </div>
          </section>
        </template>
      </div>
    </Transition>
  </div>
</template>
