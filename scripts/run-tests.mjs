import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const helperOutdir = await mkdtemp(join(tmpdir(), 'wisemindai-obsidian-tests-'));

await build({
  entryPoints: [
    'src/services/noteMentionSearch.ts',
    'src/services/syncPreview.ts',
    'src/services/editorRewriteActions.ts',
    'src/services/chatInsertFormat.ts',
    'src/services/cardsMarkdown.ts',
  ],
  outdir: helperOutdir,
  bundle: false,
  format: 'esm',
  platform: 'node',
  sourcemap: false,
  logLevel: 'silent',
});

const mentionHelpers = await import(pathToFileURL(join(helperOutdir, 'noteMentionSearch.js')));
const syncPreviewHelpers = await import(pathToFileURL(join(helperOutdir, 'syncPreview.js')));
const editorRewriteHelpers = await import(pathToFileURL(join(helperOutdir, 'editorRewriteActions.js')));
const chatInsertHelpers = await import(pathToFileURL(join(helperOutdir, 'chatInsertFormat.js')));
const cardsMarkdownHelpers = await import(pathToFileURL(join(helperOutdir, 'cardsMarkdown.js')));

test('manifest uses publishable WiseMindAI plugin identity', async () => {
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  assert.equal(manifest.id, 'wisemindai');
  assert.equal(manifest.name, 'WiseMindAI');
  assert.equal(manifest.isDesktopOnly, true);
});

test('new Vue plugin package keeps UI dependencies local', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.name, 'wisemindai-obsidian');
  assert.ok(pkg.dependencies['reka-ui']);
  assert.ok(pkg.dependencies['@heroicons/vue']);
  assert.ok(pkg.dependencies.vue);
  assert.ok(pkg.dependencies['vue-i18n']);
  assert.ok(existsSync('src/i18n/zh_CN.ts'));
  assert.ok(existsSync('src/i18n/en_US.ts'));
});

test('language setting defaults to Obsidian and only exposes Chinese and English overrides', async () => {
  const settingsSource = await readFile('src/settings.ts', 'utf8');
  const i18nSource = await readFile('src/i18n/index.ts', 'utf8');

  assert.match(settingsSource, /language: 'system'/);
  assert.match(i18nSource, /value: 'system'/);
  assert.match(i18nSource, /value: 'zh_CN'/);
  assert.match(i18nSource, /value: 'en_US'/);
});

test('assistant home, summary, and cards pages do not hard-code Chinese UI text', async () => {
  const files = [
    'src/components/pages/AssistantHome.vue',
    'src/components/pages/SummaryPage.vue',
    'src/components/pages/CardsPage.vue',
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /[\u4e00-\u9fff]/, `${file} should use i18n keys for Chinese UI text`);
  }
});

test('English i18n messages do not use legacy Chinese DOM text keys', async () => {
  const source = await readFile('src/i18n/en_US.ts', 'utf8');

  assert.doesNotMatch(source, /domText/);
  assert.doesNotMatch(source, /'[\u4e00-\u9fff][^']*':/);
});

test('build output contains Obsidian plugin files', () => {
  assert.ok(existsSync('dist/main.js'));
  assert.ok(existsSync('dist/styles.css'));
  assert.ok(existsSync('dist/manifest.json'));
});

test('Tailwind CSS output keeps prefixed utilities for Obsidian views', async () => {
  const source = await readFile('src/styles.css', 'utf8');
  const builtCss = await readFile('dist/styles.css', 'utf8');

  assert.match(source, /@source "\.\/\*\*\/\*\.vue";/);
  assert.match(source, /@source "\.\/\*\*\/\*\.ts";/);
  assert.match(builtCss, /\.wm\\:flex\{/);
  assert.match(builtCss, /\.wm\\:w-full\{/);
  assert.match(builtCss, /\.wm\\:text-xs\{/);
});

test('note mention search returns title and folder matches with title-first display data', () => {
  const notes = [
    {
      title: 'WiseMindAI 核心功能总表',
      path: 'WiseMindAI/产品文档/WiseMindAI_核心功能总表.md',
      folderPath: 'WiseMindAI/产品文档',
      aliases: [],
      tags: ['product'],
      modifiedAt: 100,
    },
    {
      title: '会议纪要',
      path: 'Work/会议纪要.md',
      folderPath: 'Work',
      aliases: ['meeting'],
      tags: [],
      modifiedAt: 200,
    },
  ];

  const result = mentionHelpers.searchNoteMentions(notes, '核心');

  assert.equal(result[0].title, 'WiseMindAI 核心功能总表');
  assert.equal(result[0].folderPath, 'WiseMindAI/产品文档');
  assert.equal(result[0].insertText, '@WiseMindAI/产品文档/WiseMindAI_核心功能总表.md ');
  assert.equal(result[0].matchReason, '标题匹配');
});

test('note mention search can match aliases and tags', () => {
  const notes = [
    {
      title: '项目复盘',
      path: 'Work/项目复盘.md',
      folderPath: 'Work',
      aliases: ['retro'],
      tags: ['review'],
    },
  ];

  assert.equal(mentionHelpers.searchNoteMentions(notes, 'retro')[0].title, '项目复盘');
  assert.equal(mentionHelpers.searchNoteMentions(notes, 'review')[0].title, '项目复盘');
});

test('note mention search shows every note when limit is zero', () => {
  const notes = [
    {
      title: '根目录笔记',
      path: '根目录笔记.md',
      folderPath: '',
      tags: [],
    },
    {
      title: '子文件夹笔记',
      path: 'Projects/子文件夹笔记.md',
      folderPath: 'Projects',
      tags: [],
    },
    {
      title: '更深层笔记',
      path: 'Projects/Archive/更深层笔记.md',
      folderPath: 'Projects/Archive',
      tags: [],
    },
  ];

  const result = mentionHelpers.searchNoteMentions(notes, '', 0);

  assert.deepEqual(
    result.map(item => item.path).sort(),
    notes.map(item => item.path).sort(),
  );
});

test('sync preview summarizes selected sources and targets before execution', () => {
  const preview = syncPreviewHelpers.buildSyncPreview({
    direction: 'to-wisemind',
    sourceCount: 3,
    targetLabels: ['知识库：Obsidian 导入', '笔记：根目录'],
    overwriteExisting: true,
  });

  assert.equal(preview.title, '准备同步 3 篇 Obsidian 笔记');
  assert.equal(preview.riskLevel, 'warning');
  assert.equal(preview.rows.length, 2);
  assert.match(preview.warningText, /更新同来源内容/);
});

test('editor rewrite formatting keeps original text and appends AI result', () => {
  const formatted = editorRewriteHelpers.formatRewriteResult(
    'polish',
    '原始段落',
    '润色后的段落\n第二行',
  );

  assert.match(formatted, /原始段落/);
  assert.match(formatted, /WiseMindAI 润色/);
  assert.match(formatted, /> 润色后的段落\n> 第二行/);
});

test('editor rewrite response extraction supports common response fields', () => {
  assert.equal(editorRewriteHelpers.extractRewriteText({markdown: 'md'}), 'md');
  assert.equal(editorRewriteHelpers.extractRewriteText({data: 'ignored', text: 'txt'}), 'txt');
  assert.equal(editorRewriteHelpers.extractRewriteText({message: 'hello'}), 'hello');
});

test('chat insert formatter supports Markdown, heading, quote, and callout formats', () => {
  assert.equal(chatInsertHelpers.formatChatMessageForInsert('回答', 'markdown'), '\n\n回答\n');
  assert.match(
    chatInsertHelpers.formatChatMessageForInsert('回答', 'heading'),
    /## WiseMindAI 对话\n\n回答/,
  );
  assert.match(
    chatInsertHelpers.formatChatMessageForInsert('第一行\n第二行', 'quote'),
    /> \[!quote\] WiseMindAI 对话\n> 第一行\n> 第二行/,
  );
  assert.match(
    chatInsertHelpers.formatChatMessageForInsert('回答', 'callout'),
    /> \[!note\] WiseMindAI 对话\n> 回答/,
  );
});

test('cards markdown formatter creates a review section with normalized tags', () => {
  const markdown = cardsMarkdownHelpers.formatCardsMarkdownBlock([
    {content: '第一张卡片', tags: ['#概念', '复习']},
    {content: '第二张卡片', tags: []},
  ]);

  assert.match(markdown, /## WiseMindAI 复习卡片/);
  assert.match(markdown, /### 卡片 1\n\n第一张卡片/);
  assert.match(markdown, /标签：#概念 #复习/);
  assert.match(markdown, /### 卡片 2\n\n第二张卡片/);
});
