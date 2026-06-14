<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';

import {usePlugin} from '../composables/usePlugin';
import {
  loadWiseMindDestinationOptions,
  type WiseMindDestinationTarget,
} from '../services/wisemindDestinations';

import RekaSelect from './RekaSelect.vue';

const props = defineProps<{
  modelValue: string;
  target: WiseMindDestinationTarget;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const plugin = usePlugin();
const {t} = useI18n();
const loading = ref(false);
const options = ref<Array<{value: string; label: string; disabled?: boolean}>>([]);
const ROOT_VALUE = '__wisemind_root__';
const EMPTY_VALUE = '__wisemind_empty__';

const selectValue = computed(() => props.modelValue || ROOT_VALUE);

const placeholder = computed(() => {
  if (props.target === 'knowledge') return t('destinationSelect.chooseKnowledge');
  return t('destinationSelect.chooseFolder');
});

const loadOptions = async () => {
  loading.value = true;
  try {
    const items = await loadWiseMindDestinationOptions(plugin.api, props.target, {
      notes: t('destinationOptions.notes'),
      documents: t('destinationOptions.documents'),
      knowledge: t('destinationOptions.knowledge'),
      noKnowledge: t('destinationOptions.noKnowledge'),
      createKnowledgeFirst: t('destinationOptions.createKnowledgeFirst'),
      knowledgeMeta: t('destinationOptions.knowledgeMeta'),
      rootFolder: t('destinationOptions.rootFolder'),
      folder: t('destinationOptions.folder'),
    });
    options.value = items.map(item => ({
      value: item.value || (item.disabled ? EMPTY_VALUE : ROOT_VALUE),
      label: item.label,
      disabled: item.disabled,
    }));
    const enabled = options.value.filter(item => !item.disabled);
    const currentValue = props.modelValue || ROOT_VALUE;
    if (enabled.length && !enabled.some(item => item.value === currentValue)) {
      updateValue(enabled[0].value);
    }
    if (!enabled.length && props.modelValue) {
      emit('update:modelValue', '');
    }
  } finally {
    loading.value = false;
  }
};

const updateValue = (value: string) => {
  emit('update:modelValue', value === ROOT_VALUE || value === EMPTY_VALUE ? '' : value);
};

onMounted(loadOptions);
watch(() => props.target, loadOptions);
</script>

<template>
  <div class="wm-destination-select">
    <RekaSelect
      :model-value="selectValue"
      :options="options"
      :placeholder="loading ? t('destinationSelect.loading') : placeholder"
      @update:model-value="updateValue"
    />
    <small v-if="target === 'knowledge' && options.length && options.every(item => item.disabled)" class="wm-muted">
      {{ t('destinationSelect.noKnowledgeBases') }}
    </small>
  </div>
</template>
