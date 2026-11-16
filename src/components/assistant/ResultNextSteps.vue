<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {
    AcademicCapIcon,
    ArrowTopRightOnSquareIcon,
    BookmarkSquareIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    CheckCircleIcon,
  } from '@heroicons/vue/24/outline';

  import {usePlugin} from '../../composables/usePlugin';
  import {FEATURES} from '../../features';
  import {hasFeature} from '../../services/capabilities';
  import {openChatWithMessage, openNoteView} from '../../services/panelStore';

  const props = defineProps<{
    kind: 'summary' | 'cards';
    title?: string;
    sourcePath?: string;
    markdown?: string;
    successText: string;
    successDesc?: string;
  }>();

  const emit = defineEmits<{
    openCards: [];
  }>();

  const {t} = useI18n();
  const plugin = usePlugin();

  const mention = () => (props.sourcePath ? `@${props.sourcePath} ` : '');

  const askAi = () => {
    const hint =
      props.kind === 'summary'
        ? t('resultNextSteps.askHintSummary')
        : t('resultNextSteps.askHintCards');
    openChatWithMessage(`${mention()}${hint}`, false, false);
  };

  const makeCards = () => {
    if (props.kind === 'cards') {
      openNoteView('cards');
      return;
    }
    emit('openCards');
  };

  const makeQuiz = () => {
    const file = props.sourcePath
      ? (plugin.app.vault.getAbstractFileByPath(props.sourcePath) as import('obsidian').TFile | null)
      : null;
    if (file && hasFeature(FEATURES.quiz)) {
      void plugin.createQuiz(file);
      return;
    }
    openChatWithMessage(`${mention()}${t('workbench.prompts.quiz')}`, true, true);
  };

  const openClient = () => {
    void plugin.api
      .openSource(props.kind === 'cards' ? {type: 'review'} : {type: 'file'})
      .catch(() => undefined);
  };
</script>

<template>
  <Transition name="wm2-view" appear>
    <section class="wm2-next-steps" aria-live="polite">
      <div class="wm2-next-steps-success">
        <CheckCircleIcon class="wm-icon is-success" />
        <div>
          <strong>{{ successText }}</strong>
          <p v-if="successDesc" class="wm2-muted">{{ successDesc }}</p>
        </div>
      </div>
      <div class="wm2-next-steps-label">{{ t('resultNextSteps.title') }}</div>
      <div class="wm2-next-steps-grid">
        <button class="wm2-next-step" type="button" @click="askAi">
          <ChatBubbleOvalLeftEllipsisIcon class="wm-icon is-info" />
          <div>
            <strong>{{ t('resultNextSteps.ask') }}</strong>
            <span class="wm2-muted">{{ t('resultNextSteps.askDesc') }}</span>
          </div>
        </button>
        <button v-if="kind === 'summary'" class="wm2-next-step" type="button" @click="makeCards">
          <BookmarkSquareIcon class="wm-icon is-secondary" />
          <div>
            <strong>{{ t('resultNextSteps.cards') }}</strong>
            <span class="wm2-muted">{{ t('resultNextSteps.cardsDesc') }}</span>
          </div>
        </button>
        <button class="wm2-next-step" type="button" @click="makeQuiz">
          <AcademicCapIcon class="wm-icon is-warning" />
          <div>
            <strong>{{ t('resultNextSteps.quiz') }}</strong>
            <span class="wm2-muted">{{ t('resultNextSteps.quizDesc') }}</span>
          </div>
        </button>
        <button class="wm2-next-step" type="button" @click="openClient">
          <ArrowTopRightOnSquareIcon class="wm-icon is-primary" />
          <div>
            <strong>{{ t('resultNextSteps.openClient') }}</strong>
            <span class="wm2-muted">{{ t('resultNextSteps.openClientDesc') }}</span>
          </div>
        </button>
      </div>
    </section>
  </Transition>
</template>
