<script setup lang="ts">
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

const setupChecks = [
  '先打开 WiseMindAI 桌面端',
  '在 WiseMindAI 中开启本地 API 服务',
  '回到 Obsidian 设置页，点击“测试连接”确认可用',
];

const startCards = [
  {
    title: '首次打开',
    desc: '教程只会在第一次自动出现。点击“我知道了”后，以后可以从左侧导航的“教程”再次打开。',
    icon: CheckCircleIcon,
  },
  {
    title: '首页入口',
    desc: '首页提供总结、卡片、对话、知识点提取和同步入口，也会显示连接状态和最近任务。',
    icon: SparklesIcon,
  },
  {
    title: '内容范围',
    desc: '当前主要处理 Markdown 笔记内容。涉及同步时，建议先用少量笔记测试，再扩大范围。',
    icon: DocumentTextIcon,
  },
];

const assistantGuides = [
  {
    title: '总结当前笔记',
    desc: '选择当前笔记、选中文本或多篇笔记后生成总结。结果可以插入当前笔记、保存为新笔记，或保存到 WiseMindAI。',
    icon: DocumentTextIcon,
  },
  {
    title: '生成知识卡片',
    desc: '选择内容来源后设置数量、难度和卡片类型，再选择 WiseMindAI 卡片集与文件夹。生成后可逐张编辑、复制或保存。',
    icon: BookmarkSquareIcon,
  },
  {
    title: 'AI 对话',
    desc: '默认围绕当前笔记提问。输入 @ 可以引用其他笔记；回答可以复制，也可以直接插入当前打开的笔记。',
    icon: ChatBubbleOvalLeftEllipsisIcon,
  },
  {
    title: '提取知识点',
    desc: '在首页点击“提取知识点”会进入总结流程，用来提炼关键词、概念和后续可追问的问题。',
    icon: SparklesIcon,
  },
];

const syncSteps = [
  {
    title: '选方向',
    desc: 'Obsidian -> WiseMindAI 用来导入当前仓库笔记；WiseMindAI -> Obsidian 用来把本地数据写回仓库。',
    icon: ArrowPathIcon,
  },
  {
    title: '选内容和位置',
    desc: '左侧选择来源内容，右侧选择保存目标。文件夹行的复选框可以批量选择，搜索框可以快速定位。',
    icon: DocumentTextIcon,
  },
  {
    title: '执行并复查',
    desc: '确认重复内容处理方式后点击“执行同步”。完成后查看同步明细，确认新建、更新、跳过和失败数量。',
    icon: CheckCircleIcon,
  },
];

const settingsTips = [
  {
    title: '同步方案',
    desc: '常用的同步选择可以保存成方案，下次直接套用，适合固定文件夹或固定知识库的工作流。',
    icon: BookmarkSquareIcon,
  },
  {
    title: '历史记录',
    desc: '首页和各功能页都可以查看最近任务，方便找回之前生成的总结、卡片或同步结果。',
    icon: ClockIcon,
  },
  {
    title: '默认位置',
    desc: '设置页可以调整 WiseMindAI API 地址、写回 Obsidian 的默认文件夹、导入知识库名称和 @ 候选笔记数量。',
    icon: Cog6ToothIcon,
  },
];

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
        <h2>WiseMindAI 使用教程</h2>
      </div>
      <WmTooltip content="关闭教程">
        <button class="btn btn-sm btn-circle btn-ghost" type="button" @click="finish">✕</button>
      </WmTooltip>
    </header>

    <TabsRoot default-value="start" class="wm-tutorial-tabs">
      <TabsList class="wm-tutorial-tab-list" aria-label="WiseMindAI 使用教程">
        <TabsTrigger class="wm-tutorial-tab" value="start">开始前</TabsTrigger>
        <TabsTrigger class="wm-tutorial-tab" value="assistant">AI 助手</TabsTrigger>
        <TabsTrigger class="wm-tutorial-tab" value="sync">数据同步</TabsTrigger>
        <TabsTrigger class="wm-tutorial-tab" value="settings">设置与历史</TabsTrigger>
      </TabsList>

      <TabsContent value="start" class="wm-tutorial-content">
        <div class="wm-panel wm-tutorial-intro">
          <div class="wm-tutorial-heading">
            <CheckCircleIcon class="wm-panel-title-icon" />
            <h3>先确认连接，再开始使用</h3>
          </div>
          <p>Obsidian 插件会通过 WiseMindAI 的本地 API 读取和写入数据。连接正常后，总结、卡片、对话和同步功能都可以直接使用。</p>
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
            <h3>在笔记旁边完成 AI 工作</h3>
          </div>
          <p>常用功能都支持当前笔记；需要处理更多内容时，可以切换到选中文本或多篇笔记。</p>
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
            <h3>双向同步的基本流程</h3>
          </div>
          <p>同步页会分别显示 Obsidian 当前仓库和 WiseMindAI 本地数据。先选方向，再选内容与目标，最后执行。</p>
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
            <h3>把重复操作固定下来</h3>
          </div>
          <p>设置页负责连接和默认行为；历史记录和同步方案负责减少重复选择。</p>
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
        我知道了
      </button>
    </footer>
  </section>
</template>
