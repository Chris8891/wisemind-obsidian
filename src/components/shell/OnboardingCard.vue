<script setup lang="ts">
  import {computed, ref} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {ArrowLeftIcon, ArrowRightIcon, CheckIcon, SparklesIcon} from '@heroicons/vue/24/outline';
  import {CheckCircleIcon} from '@heroicons/vue/24/solid';
  import {openExternal} from 'obsidian';

  import {usePlugin} from '../../composables/usePlugin';
  import {panelState} from '../../services/panelStore';

  import WmLogo from './WmLogo.vue';

  const emit = defineEmits<{
    done: [];
    summarize: [];
  }>();

  const plugin = usePlugin();
  const {t} = useI18n();
  const step = ref(0);
  const checking = ref(false);
  const checkResult = ref<'idle' | 'ok' | 'fail'>(panelState.connected ? 'ok' : 'idle');

  const steps = computed(() => [
    {title: t('onboarding.step1Title'), desc: t('onboarding.step1Desc')},
    {title: t('onboarding.step2Title'), desc: t('onboarding.step2Desc')},
    {title: t('onboarding.step3Title'), desc: t('onboarding.step3Desc')},
  ]);
  const isLastStep = computed(() => step.value === steps.value.length - 1);

  const checkConnection = async () => {
    if (checking.value) return;
    checking.value = true;
    checkResult.value = (await plugin.testConnection()) ? 'ok' : 'fail';
    checking.value = false;
  };

  const goTo = (index: number) => {
    step.value = Math.min(Math.max(index, 0), steps.value.length - 1);
  };

  const next = () => {
    if (!isLastStep.value) {
      goTo(step.value + 1);
      return;
    }
    emit('done');
  };

  const summarize = () => {
    emit('summarize');
    emit('done');
  };

  const download = () => void openExternal('https://wisemindai.app');
</script>

<template>
  <section class="wm2-card wm2-onboarding" role="dialog" :aria-label="t('onboarding.title')">
    <header class="wm2-onboarding-header">
      <WmLogo />
      <strong>{{ t('onboarding.title') }}</strong>
      <button class="wm2-btn is-ghost is-xs" type="button" @click="emit('done')">{{ t('onboarding.skip') }}</button>
    </header>
    <div
      class="wm2-onboarding-progress"
      role="progressbar"
      :aria-valuemin="1"
      :aria-valuemax="steps.length"
      :aria-valuenow="step + 1"
      :aria-label="t('onboarding.progress', {current: step + 1, total: steps.length})"
    >
      <span
        v-for="(item, index) in steps"
        :key="index"
        :class="{'is-active': index === step, 'is-done': index < step}"
      ></span>
    </div>
    <ol class="wm2-onboarding-steps">
      <li
        v-for="(item, index) in steps"
        :key="index"
        :class="{'is-active': index === step, 'is-done': index < step}"
        :aria-current="index === step ? 'step' : undefined"
      >
        <span class="wm2-onboarding-index">
          <CheckCircleIcon v-if="index < step" class="wm-icon" />
          <template v-else>{{ index + 1 }}</template>
        </span>
        <div class="wm2-onboarding-body">
          <button
            class="wm2-plain-button wm2-onboarding-step-title"
            type="button"
            :disabled="index === step"
            @click="goTo(index)"
          >
            {{ item.title }}
          </button>
          <div v-if="index === step" class="wm2-onboarding-detail">
            <p>{{ item.desc }}</p>
            <div v-if="index === 0" class="wm2-row">
              <span v-if="panelState.connected" class="wm2-chip is-success">
                <CheckCircleIcon class="wm-icon" />
                {{ t('onboarding.step1Ok') }}
              </span>
              <button v-else class="wm2-btn is-primary is-sm" type="button" :disabled="checking" @click="checkConnection">
                <span v-if="checking" class="wm2-spinner"></span>
                {{ t('onboarding.step1Check') }}
              </button>
              <button class="wm2-btn is-ghost is-sm is-link" type="button" @click="download">
                {{ t('onboarding.download') }}
              </button>
            </div>
            <p
              v-if="index === 0 && checkResult === 'fail' && !panelState.connected"
              class="wm2-text-warning"
              role="alert"
            >
              {{ t('onboarding.step1Fail') }}
            </p>
            <div v-if="index === 1" class="wm2-row">
              <button class="wm2-btn is-primary is-sm" type="button" @click="summarize">
                <SparklesIcon class="wm-icon" />
                {{ t('onboarding.step2Action') }}
              </button>
            </div>
          </div>
        </div>
      </li>
    </ol>
    <footer class="wm2-onboarding-footer">
      <span class="wm2-muted wm2-tabular wm2-onboarding-progress-text" aria-hidden="true">
        {{ t('onboarding.progress', {current: step + 1, total: steps.length}) }}
      </span>
      <button v-if="step > 0" class="wm2-btn is-ghost is-sm" type="button" @click="goTo(step - 1)">
        <ArrowLeftIcon class="wm-icon" />
        {{ t('shell.back') }}
      </button>
      <button class="wm2-btn is-primary is-sm" type="button" @click="next">
        {{ isLastStep ? t('onboarding.done') : t('onboarding.next') }}
        <ArrowRightIcon v-if="!isLastStep" class="wm-icon" />
        <CheckIcon v-else class="wm-icon" />
      </button>
    </footer>
  </section>
</template>
