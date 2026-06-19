import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { baseCompile } from '@intlify/message-compiler';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir,readFile } from 'node:fs/promises';
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
    'src/quickActions.ts',
    'src/services/domRef.ts',
    'src/i18n/zh_CN.ts',
    'src/i18n/en_US.ts',
  ],
  outdir: helperOutdir,
  entryNames: '[name]',
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
const quickActionHelpers = await import(pathToFileURL(join(helperOutdir, 'quickActions.js')));
const domRefHelpers = await import(pathToFileURL(join(helperOutdir, 'domRef.js')));
const zhCNMessages = (await import(pathToFileURL(join(helperOutdir, 'zh_CN.js')))).default;
const enUSMessages = (await import(pathToFileURL(join(helperOutdir, 'en_US.js')))).default;

const collectI18nMessages = (messages, prefix = '') => {
  const items = [];
  for (const [key, value] of Object.entries(messages)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      items.push([nextPrefix, value]);
    } else if (value && typeof value === 'object') {
      items.push(...collectI18nMessages(value, nextPrefix));
    }
  }
  return items;
};

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

test('context menu defaults hidden and only registers actions when enabled', async () => {
  const settingsSource = await readFile('src/settings.ts', 'utf8');
  const mainSource = await readFile('src/main.ts', 'utf8');

  assert.match(settingsSource, /showContextMenu: false/);
  assert.match(settingsSource, /raw\?\.showContextMenu === true/);
  assert.match(mainSource, /if \(!this\.settings\.showContextMenu\) return;/);
  assert.match(mainSource, /on\('files-menu'/);
});

test('file explorer context menu resolves Markdown files from files, folders, and root', () => {
  const markdownFiles = [
    {path: 'Inbox.md', extension: 'md'},
    {path: 'Projects/Plan.md', extension: 'md'},
    {path: 'Projects/Nested/Note.md', extension: 'md'},
  ];
  const app = {
    vault: {
      getMarkdownFiles: () => markdownFiles,
      getAbstractFileByPath: path => markdownFiles.find(file => file.path === path) || null,
    },
  };

  assert.deepEqual(
    quickActionHelpers.collectMarkdownFiles(app, {path: 'Inbox.md', name: 'Inbox.md'}).map(file => file.path),
    ['Inbox.md'],
  );
  assert.deepEqual(
    quickActionHelpers.collectMarkdownFiles(app, {path: 'Projects', name: 'Projects'}).map(file => file.path),
    ['Projects/Plan.md', 'Projects/Nested/Note.md'],
  );
  assert.deepEqual(
    quickActionHelpers.collectMarkdownFiles(app, {path: '/', name: '/'}).map(file => file.path),
    ['Inbox.md', 'Projects/Plan.md', 'Projects/Nested/Note.md'],
  );
  assert.deepEqual(
    quickActionHelpers.collectMarkdownFilesFromTargets(app, [
      {path: 'Projects', name: 'Projects'},
      {path: 'Projects/Plan.md', extension: 'md'},
    ]).map(file => file.path),
    ['Projects/Plan.md', 'Projects/Nested/Note.md'],
  );
});

const sourceFiles = async (dir) => {
  const entries = await readdir(dir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(path));
      continue;
    }
    if (/\.(ts|vue)$/.test(entry.name)) files.push(path);
  }
  return files;
};

test('Obsidian plugin UI and message source uses i18n for Chinese text', async () => {
  const files = (await sourceFiles('src')).filter(file => file !== 'src/i18n/zh_CN.ts');

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

test('i18n messages compile without linked format errors', () => {
  for (const [locale, messages] of Object.entries({zh_CN: zhCNMessages, en_US: enUSMessages})) {
    for (const [key, message] of collectI18nMessages(messages)) {
      const errors = [];
      baseCompile(message, {
        onError: error => errors.push(error.message),
      });

      assert.deepEqual(errors, [], `${locale}.${key}: ${message}`);
    }
  }
});

test('build output contains Obsidian plugin files', () => {
  assert.ok(existsSync('dist/main.js'));
  assert.ok(existsSync('dist/styles.css'));
  assert.ok(existsSync('dist/manifest.json'));
});

test('Obsidian plugin entry is self-contained and does not require local build chunks', async () => {
  const main = await readFile('dist/main.js', 'utf8');

  assert.doesNotMatch(main, /require\(["']\.\/[^"']+["']\)/);
});

test('template element resolver ignores component refs without a DOM element', () => {
  assert.equal(domRefHelpers.resolveTemplateElement(null), null);
  assert.equal(domRefHelpers.resolveTemplateElement({}), null);
  assert.deepEqual(domRefHelpers.queryTemplateElements({querySelectorAll: null}, '[data-session-id]'), []);
});

test('Tailwind CSS output keeps prefixed utilities for Obsidian views', async () => {
  const source = await readFile('src/styles.scss', 'utf8');
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
  assert.equal(result[0].matchReason, 'Title match');
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
    targetLabels: ['Knowledge base: Obsidian import', 'Note: Root'],
    overwriteExisting: true,
  });

  assert.equal(preview.title, 'Ready to sync 3 Obsidian notes');
  assert.equal(preview.riskLevel, 'warning');
  assert.equal(preview.rows.length, 2);
  assert.match(preview.warningText, /same source/);
});

test('editor rewrite formatting keeps original text and appends AI result', () => {
  const formatted = editorRewriteHelpers.formatRewriteResult(
    'polish',
    '原始段落',
    '润色后的段落\n第二行',
  );

  assert.match(formatted, /原始段落/);
  assert.match(formatted, /WiseMindAI Polish/);
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
    /## WiseMindAI chat\n\n回答/,
  );
  assert.match(
    chatInsertHelpers.formatChatMessageForInsert('第一行\n第二行', 'quote'),
    /> \[!quote\] WiseMindAI chat\n> 第一行\n> 第二行/,
  );
  assert.match(
    chatInsertHelpers.formatChatMessageForInsert('回答', 'callout'),
    /> \[!note\] WiseMindAI chat\n> 回答/,
  );
});

test('cards markdown formatter creates a review section with normalized tags', () => {
  const markdown = cardsMarkdownHelpers.formatCardsMarkdownBlock([
    {content: '第一张卡片', tags: ['#概念', '复习']},
    {content: '第二张卡片', tags: []},
  ]);

  assert.match(markdown, /## WiseMindAI review cards/);
  assert.match(markdown, /### Card 1\n\n第一张卡片/);
  assert.match(markdown, /Tags: #概念 #复习/);
  assert.match(markdown, /### Card 2\n\n第二张卡片/);
});
