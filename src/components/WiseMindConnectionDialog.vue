<script setup lang="ts">
import { PencilSquareIcon } from '@heroicons/vue/24/outline';

import { usePlugin } from '../composables/usePlugin';
import { openWiseMindSettingsPage } from '../services/connectionDialog';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const plugin = usePlugin();
const close = () => emit('update:open', false);

const openSettings = () => {
  close();
  openWiseMindSettingsPage();
};
</script>

<template>
  <div v-if="props.open" class="wm-modal-overlay" @click.self="close">
    <section
      class="wm-modal-box wm-history-dialog wm-connection-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wisemind-connection-title"
    >
      <header class="wm-history-dialog-header">
        <h3 id="wisemind-connection-title" class="wm-dialog-title">请先连接 WiseMindAI</h3>
        <button class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4" type="button" @click="close">✕</button>
      </header>
      <p class="wm-muted">
        当前没有连接到 WiseMindAI。请确认 WiseMindAI 桌面端已经启动，并已更新到最新版本；然后在 WiseMindAI 设置中开启本地 API 服务。
      </p>
      <div class="wm-connection-api-row">
        <span>当前本地 API 服务地址：{{ plugin.settings.apiBaseUrl }}</span>
        <button class="wm-icon-button" type="button" @click="openSettings">
          <PencilSquareIcon class="wm-icon" />
        </button>
      </div>
      <ol class="wm-connection-steps">
        <li>
          到官网
          <a href="https://wisemindai.app">https://wisemindai.app</a>
          下载并安装 WiseMindAI。
        </li>
        <li>打开 WiseMindAI，并确认已更新到最新版本。</li>
        <li>进入系统设置，找到本地 API 服务，打开并启用。</li>
        <li>回到 Obsidian，再次点击当前按钮。</li>
        <li>如果你改过端口号，请确认 WiseMindAI 里的端口号和 Obsidian 插件里的端口号一致。</li>
      </ol>
      <footer class="wm-dialog-actions wm-actions">
        <button class="wm-button is-primary" type="button" @click="close">知道了</button>
      </footer>
    </section>
  </div>
</template>
