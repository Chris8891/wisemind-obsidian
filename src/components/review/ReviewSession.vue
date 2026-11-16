<script setup lang="ts">
  import {computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    ArrowTopRightOnSquareIcon,
    ArrowUturnLeftIcon,
    CheckCircleIcon,
    CheckIcon,
    ExclamationTriangleIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';

  import {usePlugin} from '../../composables/usePlugin';
  import {
    formatReviewDuration,
    GRADE_FORGOT,
    GRADE_REMEMBER,
    GRADE_VAGUE,
    gradeFromKey,
    nextRememberDays,
    type ReviewResult,
    splitCardContent,
    summarizeReviewResults,
  } from '../../services/cardReview';
  import type {CardReviewGrade, ReviewCard} from '../../types';
  import MarkdownView from '../MarkdownView.vue';

  /** How long the chosen grade stays highlighted before the next card slides in. */
  const GRADE_FEEDBACK_MS = 180;
  const FLASH_MS = 2400;

  const props = defineProps<{
    cards: ReviewCard[];
  }>();

  const emit = defineEmits<{
    exit: [saved: boolean];
    again: [cards: ReviewCard[]];
  }>();

  const plugin = usePlugin();
  const {t} = useI18n();
  const root = ref<HTMLElement | null>(null);
  const cardBody = ref<HTMLElement | null>(null);
  const answerEl = ref<HTMLElement | null>(null);
  const index = ref(0);
  const revealed = ref(false);
  const results = shallowRef<ReviewResult[]>([]);
  const saveState = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const chosenGrade = ref<CardReviewGrade | null>(null);
  const direction = ref<'forward' | 'back'>('forward');
  const flash = ref<'' | 'undone' | 'confirmExit'>('');
  const sessionStartedAt = Date.now();
  let cardStartedAt = Date.now();
  let gradeTimer = 0;
  let flashTimer = 0;
  let pendingResult: ReviewResult | null = null;

  const finished = computed(() => index.value >= props.cards.length);
  const current = computed(() => props.cards[index.value] || null);
  const face = computed(() => splitCardContent(current.value?.content));
  const progress = computed(() => (props.cards.length ? (index.value / props.cards.length) * 100 : 0));
  const summary = computed(() => summarizeReviewResults(results.value));
  const forgottenCards = computed(() => {
    const ids = new Set(results.value.filter(item => item.grade === GRADE_FORGOT).map(item => item.cardId));
    return props.cards.filter(card => ids.has(card.id));
  });
  const sourceName = computed(() => {
    const path = current.value?.sourcePath || '';
    return path.split('/').pop()?.replace(/\.md$/i, '') || path;
  });
  const stats = computed(() => [
    {key: 'remember', cls: 'is-remember', count: summary.value.remember, label: t('review.gradeRemember')},
    {key: 'vague', cls: 'is-vague', count: summary.value.vague, label: t('review.gradeVague')},
    {key: 'forgot', cls: 'is-forgot', count: summary.value.forgot, label: t('review.gradeForgot')},
  ]);

  const grades = computed(() => [
    {grade: GRADE_FORGOT, key: '1', label: t('review.gradeForgot'), hint: t('review.intervalForgot'), cls: 'is-forgot'},
    {grade: GRADE_VAGUE, key: '2', label: t('review.gradeVague'), hint: t('review.intervalVague'), cls: 'is-vague'},
    {
      grade: GRADE_REMEMBER,
      key: '3',
      label: t('review.gradeRemember'),
      hint: t('review.intervalRemember', {days: nextRememberDays(current.value?.review)}),
      cls: 'is-remember',
    },
  ]);

  const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const showFlash = (kind: 'undone' | 'confirmExit') => {
    flash.value = kind;
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => (flash.value = ''), FLASH_MS);
  };

  // Callers share the in-flight request, so exiting while the final save runs never double submits.
  let saving: Promise<void> | null = null;
  const save = () => {
    if (!results.value.length || saveState.value === 'saved') return Promise.resolve();
    if (saving) return saving;
    saveState.value = 'saving';
    saving = plugin.api
      .submitCardReview({
        duration: Math.round((Date.now() - sessionStartedAt) / 1000),
        items: results.value.map(item => ({cardId: item.cardId, grade: item.grade, duration: item.duration})),
      })
      .then(() => {
        saveState.value = 'saved';
        void plugin.refreshDueCount();
      })
      .catch(() => {
        saveState.value = 'failed';
        new Notice(t('review.saveFailed'));
      })
      .finally(() => {
        saving = null;
      });
    return saving;
  };

  // Clicked buttons unmount after reveal/grade, which would drop focus to the body and disable the shortcuts.
  const keepFocus = () => root.value?.focus({preventScroll: true});

  /** Brings the start of the answer into view when a long question pushed it below the fold. */
  const scrollToAnswer = async () => {
    await nextTick();
    const body = cardBody.value;
    const answer = answerEl.value;
    if (!body || !answer || body.scrollHeight <= body.clientHeight) return;
    if (answer.offsetTop < body.scrollTop + body.clientHeight - 48) return;
    body.scrollTo({top: Math.max(0, answer.offsetTop - 12), behavior: prefersReducedMotion() ? 'auto' : 'smooth'});
  };

  const reveal = () => {
    if (revealed.value) return;
    revealed.value = true;
    keepFocus();
    void scrollToAnswer();
  };

  const commitGrade = () => {
    const result = pendingResult;
    pendingResult = null;
    window.clearTimeout(gradeTimer);
    chosenGrade.value = null;
    if (!result) return;
    results.value = [...results.value, result];
    direction.value = 'forward';
    index.value += 1;
    revealed.value = false;
    cardStartedAt = Date.now();
    keepFocus();
    if (finished.value) void save();
  };

  // The chosen button stays highlighted briefly so the grade registers visually before the card changes.
  const grade = (value: CardReviewGrade) => {
    const card = current.value;
    if (!card || !revealed.value || chosenGrade.value !== null) return;
    const duration = Math.max(1, Math.round((Date.now() - cardStartedAt) / 1000));
    pendingResult = {cardId: card.id, grade: value, duration};
    chosenGrade.value = value;
    gradeTimer = window.setTimeout(commitGrade, GRADE_FEEDBACK_MS);
  };

  /** Steps back one card and drops its grade; only possible before the results are saved. */
  const canUndo = computed(() => results.value.length > 0 && saveState.value === 'idle' && chosenGrade.value === null);
  const undo = () => {
    if (!canUndo.value) return;
    results.value = results.value.slice(0, -1);
    direction.value = 'back';
    index.value = Math.max(0, index.value - 1);
    revealed.value = true;
    cardStartedAt = Date.now();
    showFlash('undone');
    keepFocus();
  };

  // A failed save was already reported, so leaving does not retry it; an in-flight save is awaited
  // so the overview reloads with the new due counts.
  const exit = async () => {
    commitGrade();
    if (results.value.length && saveState.value !== 'saved' && saveState.value !== 'failed') await save();
    emit('exit', saveState.value === 'saved');
  };

  // Graded cards are saved on exit either way; the second Esc only guards against ending a session by accident.
  const requestExit = () => {
    if (finished.value || !results.value.length || flash.value === 'confirmExit') {
      void exit();
      return;
    }
    showFlash('confirmExit');
  };

  const openSource = async () => {
    const card = current.value;
    if (!card?.sourcePath) return;
    if (!plugin.app.vault.getAbstractFileByPath(card.sourcePath)) {
      new Notice(t('review.sourceMissing'));
      return;
    }
    const anchor = card.sourceAnchor ? `#${card.sourceAnchor}` : '';
    await plugin.app.workspace.openLinkText(`${card.sourcePath}${anchor}`, '', false);
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'Escape') {
      if (event.repeat || saveState.value === 'saving') return;
      event.preventDefault();
      event.stopPropagation();
      requestExit();
      return;
    }
    if (event.key === 'Backspace' || event.key.toLowerCase() === 'z') {
      if (!canUndo.value || event.repeat) return;
      event.preventDefault();
      undo();
      return;
    }
    if (finished.value) {
      if (event.key === 'Enter' && target === root.value && saveState.value !== 'saving') {
        event.preventDefault();
        void exit();
      }
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      // Let focused buttons and links (exit, open source) keep their native activation.
      if (target !== root.value && target?.closest('button, a')) return;
      event.preventDefault();
      reveal();
      return;
    }
    const value = gradeFromKey(event.key);
    if (value === null || !revealed.value || event.repeat) return;
    event.preventDefault();
    grade(value);
  };

  onMounted(() => {
    root.value?.focus();
  });

  onBeforeUnmount(() => {
    window.clearTimeout(flashTimer);
    commitGrade();
    if (results.value.length && saveState.value !== 'saved') void save();
  });
</script>

<template>
  <section ref="root" class="wm2-review-session" tabindex="0" @keydown="onKeydown">
    <header class="wm2-review-session-header">
      <div
        class="wm2-progress"
        role="progressbar"
        :aria-label="t('review.title')"
        aria-valuemin="0"
        :aria-valuenow="index"
        :aria-valuemax="cards.length"
      >
        <span :style="{width: `${progress}%`}"></span>
      </div>
      <span class="wm2-muted wm2-tabular">{{ t('review.progress', {current: Math.min(index + 1, cards.length), total: cards.length}) }}</span>
      <button class="wm2-icon-btn is-sm" type="button" :aria-label="t('review.exit')" :title="t('review.exit')" @click="exit">
        <XMarkIcon class="wm-icon" />
      </button>
    </header>

    <template v-if="!finished && current">
      <article
        :key="index"
        class="wm2-card wm2-flashcard"
        :class="[{'is-revealed': revealed}, direction === 'back' ? 'is-back' : 'is-forward']"
      >
        <div class="wm2-flashcard-meta">
          <span class="wm2-chip" :title="current.deckTitle">{{ current.deckTitle }}</span>
          <button
            v-if="current.sourcePath"
            class="wm2-link-button"
            type="button"
            :aria-label="`${t('review.openSource')}: ${current.sourcePath}`"
            :title="`${t('review.openSource')}\n${current.sourcePath}`"
            @click="openSource"
          >
            <ArrowTopRightOnSquareIcon class="wm-icon" />
            <span class="wm2-truncate">{{ sourceName }}</span>
          </button>
        </div>
        <div ref="cardBody" class="wm2-flashcard-body">
          <MarkdownView :key="`q-${current.id}`" class="wm2-flashcard-question" :markdown="face.question" :source-path="current.sourcePath || ''" />
          <div v-if="revealed" ref="answerEl" class="wm2-flashcard-answer">
            <hr />
            <MarkdownView v-if="face.answer" :key="`a-${current.id}`" :markdown="face.answer" :source-path="current.sourcePath || ''" />
            <p v-else class="wm2-muted">{{ t('review.noAnswer') }}</p>
          </div>
        </div>
      </article>

      <footer class="wm2-review-actions">
        <button v-if="!revealed" class="wm2-btn is-primary is-block wm2-review-reveal" type="button" @click="reveal">
          {{ t('review.showAnswer') }}
          <kbd>Space</kbd>
        </button>
        <div v-else class="wm2-grade-row" :class="{'is-choosing': chosenGrade !== null}">
          <button
            v-for="item in grades"
            :key="item.grade"
            class="wm2-grade"
            :class="[item.cls, {'is-chosen': chosenGrade === item.grade}]"
            type="button"
            :aria-keyshortcuts="item.key"
            @click="grade(item.grade)"
          >
            <strong>{{ item.label }}</strong>
            <small>{{ item.hint }}</small>
            <kbd>{{ item.key }}</kbd>
          </button>
        </div>
        <div class="wm2-review-hint" :class="{'is-flash': flash}" aria-live="polite">
          <span v-if="flash === 'undone'" class="wm2-review-flash">
            <ArrowUturnLeftIcon class="wm-icon" />
            {{ t('review.undone') }}
          </span>
          <span v-else-if="flash === 'confirmExit'" class="wm2-review-flash is-warning">{{ t('review.exitConfirm') }}</span>
          <span v-else>{{ t('review.keyboardHint') }}</span>
          <button v-if="canUndo" class="wm2-btn is-ghost is-xs" type="button" aria-keyshortcuts="z" @click="undo">
            <ArrowUturnLeftIcon class="wm-icon" />
            {{ t('review.undo') }}
          </button>
        </div>
      </footer>
    </template>

    <div v-else class="wm2-review-finish">
      <CheckCircleIcon class="wm2-finish-icon" />
      <h3>{{ t('review.finishTitle') }}</h3>
      <ul class="wm2-review-stats" :aria-label="t('review.finishSummary', summary)">
        <li v-for="item in stats" :key="item.key" :class="item.cls">
          <strong class="wm2-tabular">{{ item.count }}</strong>
          <span>{{ item.label }}</span>
        </li>
      </ul>
      <p class="wm2-muted wm2-tabular">{{ t('review.finishTime', {time: formatReviewDuration(summary.duration)}) }}</p>
      <p v-if="saveState !== 'idle'" class="wm2-review-save" :class="`is-${saveState}`" role="status">
        <span v-if="saveState === 'saving'" class="wm2-spinner"></span>
        <CheckIcon v-else-if="saveState === 'saved'" class="wm-icon" />
        <ExclamationTriangleIcon v-else class="wm-icon" />
        <template v-if="saveState === 'saving'">{{ t('review.saving') }}</template>
        <template v-else-if="saveState === 'saved'">{{ t('review.saved') }}</template>
        <template v-else>{{ t('review.saveFailed') }}</template>
      </p>
      <div class="wm2-row wm2-center">
        <button v-if="saveState === 'failed'" class="wm2-btn is-primary is-sm" type="button" @click="save">
          <ArrowPathIcon class="wm-icon" />
          {{ t('review.retrySave') }}
        </button>
        <button v-if="forgottenCards.length" class="wm2-btn is-sm" type="button" :disabled="saveState === 'saving'" @click="emit('again', forgottenCards)">
          {{ t('review.reviewAgain') }}
        </button>
        <button
          class="wm2-btn is-sm"
          :class="{'is-primary': saveState !== 'failed'}"
          type="button"
          :disabled="saveState === 'saving'"
          @click="exit"
        >
          {{ t('review.backToOverview') }}
        </button>
      </div>
    </div>
  </section>
</template>
