<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ArrowPathIcon,
  BookmarkSquareIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  CheckCircleIcon,
  ClockIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  SparklesIcon,
} from '@heroicons/vue/24/outline';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui';

import { usePlugin } from '../../composables/usePlugin';
import WmTooltip from '../WmTooltip.vue';

const emit = defineEmits<{
  done: [];
}>();

const plugin = usePlugin();
const { t } = useI18n();

const setupChecks = computed(() => [
  t('tutorial.checks.openApp'),
  t('tutorial.checks.enableApi'),
  t('tutorial.checks.testConnection'),
]);

const startCards = computed(() => [
  {
    title: t('tutorial.startCards.firstOpenTitle'),
    desc: t('tutorial.startCards.firstOpenDesc'),
    icon: CheckCircleIcon,
  },
  {
    title: t('tutorial.startCards.homeTitle'),
    desc: t('tutorial.startCards.homeDesc'),
    icon: SparklesIcon,
  },
  {
    title: t('tutorial.startCards.scopeTitle'),
    desc: t('tutorial.startCards.scopeDesc'),
    icon: DocumentTextIcon,
  },
]);

const assistantGuides = computed(() => [
  {
    title: t('tutorial.assistantGuides.summaryTitle'),
    desc: t('tutorial.assistantGuides.summaryDesc'),
    icon: DocumentTextIcon,
  },
  {
    title: t('tutorial.assistantGuides.cardsTitle'),
    desc: t('tutorial.assistantGuides.cardsDesc'),
    icon: BookmarkSquareIcon,
  },
  {
    title: t('tutorial.assistantGuides.chatTitle'),
    desc: t('tutorial.assistantGuides.chatDesc'),
    icon: ChatBubbleOvalLeftEllipsisIcon,
  },
  {
    title: t('tutorial.assistantGuides.extractTitle'),
    desc: t('tutorial.assistantGuides.extractDesc'),
    icon: SparklesIcon,
  },
]);

const syncSteps = computed(() => [
  {
    title: t('tutorial.syncSteps.directionTitle'),
    desc: t('tutorial.syncSteps.directionDesc'),
    icon: ArrowPathIcon,
  },
  {
    title: t('tutorial.syncSteps.contentTitle'),
    desc: t('tutorial.syncSteps.contentDesc'),
    icon: DocumentTextIcon,
  },
  {
    title: t('tutorial.syncSteps.reviewTitle'),
    desc: t('tutorial.syncSteps.reviewDesc'),
    icon: CheckCircleIcon,
  },
]);

const settingsTips = computed(() => [
  {
    title: t('tutorial.settingsTips.plansTitle'),
    desc: t('tutorial.settingsTips.plansDesc'),
    icon: BookmarkSquareIcon,
  },
  {
    title: t('tutorial.settingsTips.historyTitle'),
    desc: t('tutorial.settingsTips.historyDesc'),
    icon: ClockIcon,
  },
  {
    title: t('tutorial.settingsTips.defaultsTitle'),
    desc: t('tutorial.settingsTips.defaultsDesc'),
    icon: Cog6ToothIcon,
  },
]);

const finish = async () => {
  plugin.settings.hasSeenTutorial = true;
  await plugin.saveSettings();
  emit('done');
};
</script>

<template>
  <section class="wm-page wm-tutorial-page">
    <header class="wm-page-header">
      <div class="wm-title-line">
        <DocumentTextIcon class="wm-title-icon" />
        <h2>{{ t('tutorial.title') }}</h2>
      </div>
      <WmTooltip :content="t('tutorial.close')">
        <button class="btn btn-sm btn-circle btn-ghost" type="button" @click="finish">✕</button>
      </WmTooltip>
    </header>

    <TabsRoot default-value="start" class="wm-tutorial-tabs">
      <TabsList class="wm-tutorial-tab-list" :aria-label="t('tutorial.tabsLabel')">
        <TabsTrigger class="wm-tutorial-tab" value="start">{{ t('tutorial.tabs.start') }}</TabsTrigger>
        <TabsTrigger class="wm-tutorial-tab" value="assistant">{{ t('tutorial.tabs.assistant') }}</TabsTrigger>
        <TabsTrigger class="wm-tutorial-tab" value="sync">{{ t('tutorial.tabs.sync') }}</TabsTrigger>
        <TabsTrigger class="wm-tutorial-tab" value="settings">{{ t('tutorial.tabs.settings') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="start" class="wm-tutorial-content">
        <div class="wm-panel wm-tutorial-intro">
          <div class="wm-tutorial-heading">
            <CheckCircleIcon class="wm-panel-title-icon" />
            <h3>{{ t('tutorial.intros.startTitle') }}</h3>
          </div>
          <p>{{ t('tutorial.intros.startDesc') }}</p>
          <div class="wm-tutorial-checks">
            <span v-for="check in setupChecks" :key="check">
              <CheckCircleIcon class="wm-icon" />
              {{ check }}
            </span>
          </div>
        </div>
        <div class="wm-tutorial-grid">
          <article v-for="card in startCards" :key="card.title" class="wm-panel">
            <div class="wm-tutorial-heading">
              <component :is="card.icon" class="wm-panel-title-icon" />
              <h3>{{ card.title }}</h3>
            </div>
            <p>{{ card.desc }}</p>
          </article>
        </div>
      </TabsContent>

      <TabsContent value="assistant" class="wm-tutorial-content">
        <div class="wm-panel wm-tutorial-intro">
          <div class="wm-tutorial-heading">
            <SparklesIcon class="wm-panel-title-icon" />
            <h3>{{ t('tutorial.intros.assistantTitle') }}</h3>
          </div>
          <p>{{ t('tutorial.intros.assistantDesc') }}</p>
        </div>
        <div class="wm-tutorial-grid">
          <article v-for="guide in assistantGuides" :key="guide.title" class="wm-panel">
            <div class="wm-tutorial-heading">
              <component :is="guide.icon" class="wm-panel-title-icon" />
              <h3>{{ guide.title }}</h3>
            </div>
            <p>{{ guide.desc }}</p>
          </article>
        </div>
      </TabsContent>

      <TabsContent value="sync" class="wm-tutorial-content">
        <div class="wm-panel wm-tutorial-intro">
          <div class="wm-tutorial-heading">
            <ArrowPathIcon class="wm-panel-title-icon" />
            <h3>{{ t('tutorial.intros.syncTitle') }}</h3>
          </div>
          <p>{{ t('tutorial.intros.syncDesc') }}</p>
        </div>
        <div class="wm-tutorial-grid">
          <article v-for="step in syncSteps" :key="step.title" class="wm-panel">
            <div class="wm-tutorial-heading">
              <component :is="step.icon" class="wm-panel-title-icon" />
              <h3>{{ step.title }}</h3>
            </div>
            <p>{{ step.desc }}</p>
          </article>
        </div>
      </TabsContent>

      <TabsContent value="settings" class="wm-tutorial-content">
        <div class="wm-panel wm-tutorial-intro">
          <div class="wm-tutorial-heading">
            <Cog6ToothIcon class="wm-panel-title-icon" />
            <h3>{{ t('tutorial.intros.settingsTitle') }}</h3>
          </div>
          <p>{{ t('tutorial.intros.settingsDesc') }}</p>
        </div>
        <div class="wm-tutorial-grid">
          <article v-for="tip in settingsTips" :key="tip.title" class="wm-panel">
            <div class="wm-tutorial-heading">
              <component :is="tip.icon" class="wm-panel-title-icon" />
              <h3>{{ tip.title }}</h3>
            </div>
            <p>{{ tip.desc }}</p>
          </article>
        </div>
      </TabsContent>
    </TabsRoot>

    <footer class="wm-actions wm-tutorial-footer">
      <button class="wm-button is-primary" type="button" @click="finish">
        <CheckCircleIcon class="wm-icon" />
        {{ t('tutorial.finish') }}
      </button>
    </footer>
  </section>
</template>
