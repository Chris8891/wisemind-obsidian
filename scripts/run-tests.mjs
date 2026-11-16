import { baseCompile } from '@intlify/message-compiler';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
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
    'src/services/audioCapture.ts',
    'src/services/transcriptionAvailability.ts',
    'src/services/transcriptionLiveNoteContent.ts',
    'src/services/transcriptionOrganization.ts',
    'src/services/transcriptionHistory.ts',
    'src/quickActions.ts',
    'src/services/domRef.ts',
    'src/services/cardReview.ts',
    'src/services/relatedNotes.ts',
    'src/services/searchResults.ts',
    'src/services/textDiff.ts',
    'src/sync/syncRules.ts',
    'src/apiErrors.ts',
    'src/features.ts',
    'src/loopback.ts',
    'src/text.ts',
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
const audioCaptureHelpers = await import(pathToFileURL(join(helperOutdir, 'audioCapture.js')));
const transcriptionAvailabilityHelpers = await import(
  pathToFileURL(join(helperOutdir, 'transcriptionAvailability.js'))
);
const transcriptionLiveNoteContentHelpers = await import(
  pathToFileURL(join(helperOutdir, 'transcriptionLiveNoteContent.js'))
);
const transcriptionOrganizationHelpers = await import(
  pathToFileURL(join(helperOutdir, 'transcriptionOrganization.js'))
);
const transcriptionHistoryHelpers = await import(
  pathToFileURL(join(helperOutdir, 'transcriptionHistory.js'))
);
const quickActionHelpers = await import(pathToFileURL(join(helperOutdir, 'quickActions.js')));
const domRefHelpers = await import(pathToFileURL(join(helperOutdir, 'domRef.js')));
const cardReviewHelpers = await import(pathToFileURL(join(helperOutdir, 'cardReview.js')));
const relatedNotesHelpers = await import(pathToFileURL(join(helperOutdir, 'relatedNotes.js')));
const searchResultsHelpers = await import(pathToFileURL(join(helperOutdir, 'searchResults.js')));
const textDiffHelpers = await import(pathToFileURL(join(helperOutdir, 'textDiff.js')));
const syncRulesHelpers = await import(pathToFileURL(join(helperOutdir, 'syncRules.js')));
const apiErrorHelpers = await import(pathToFileURL(join(helperOutdir, 'apiErrors.js')));
const featureHelpers = await import(pathToFileURL(join(helperOutdir, 'features.js')));
const loopbackHelpers = await import(pathToFileURL(join(helperOutdir, 'loopback.js')));
const textHelpers = await import(pathToFileURL(join(helperOutdir, 'text.js')));
const zhCNMessages = (await import(pathToFileURL(join(helperOutdir, 'zh_CN.js')))).default;
const enUSMessages = (await import(pathToFileURL(join(helperOutdir, 'en_US.js')))).default;

// The transcription page is split into src/components/pages/transcription/*, so check them together.
const readTranscriptionPageSource = async () => {
  const dir = 'src/components/pages/transcription';
  const names = (await readdir(dir)).filter(name => /\.(ts|vue)$/.test(name)).sort();
  const sources = await Promise.all([
    readFile('src/components/pages/TranscriptionPage.vue', 'utf8'),
    ...names.map(name => readFile(`${dir}/${name}`, 'utf8')),
  ]);
  return sources.join('\n');
};

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

test('apiBaseUrl accepts only loopback hosts', () => {
  assert.equal(loopbackHelpers.checkApiBaseUrl('http://127.0.0.1:38221'), 'ok');
  assert.equal(loopbackHelpers.checkApiBaseUrl('http://localhost:38221'), 'ok');
  assert.equal(loopbackHelpers.checkApiBaseUrl('http://evil.example:38221'), 'not-loopback');
  assert.equal(loopbackHelpers.sanitizeApiBaseUrl('http://evil.example:38221'), 'http://127.0.0.1:38221');
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

test('context menu shows one WiseMindAI entry by default and can be turned off', async () => {
  const settingsSource = await readFile('src/settings.ts', 'utf8');
  const menusSource = await readFile('src/plugin/menus.ts', 'utf8');

  assert.match(settingsSource, /showContextMenu: true/);
  assert.match(settingsSource, /raw\?\.showContextMenu !== false/);
  assert.match(menusSource, /if \(!plugin\.settings\.showContextMenu\) return;/);
  assert.match(menusSource, /on\('files-menu'/);
  assert.match(menusSource, /setSubmenu/);
});

test('2.0.0 release metadata is consistent and follows Obsidian manifest rules', async () => {
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const versions = JSON.parse(await readFile('versions.json', 'utf8'));

  assert.equal(manifest.version, '2.0.0');
  assert.equal(pkg.version, manifest.version);
  assert.equal(versions[manifest.version], manifest.minAppVersion);
  assert.match(manifest.description, /^[A-Z][^\u4e00-\u9fff]*\.$/);
  assert.doesNotMatch(manifest.description, /obsidian/i);
});

test('plugin source follows Obsidian review guidelines', async () => {
  const files = await sourceFiles('src');
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\bconsole\.(log|info|debug)\(/, `${file} should not log to the console`);
    assert.doesNotMatch(source, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|v-html=/, `${file} should not inject HTML`);
    assert.doesNotMatch(source, /\bhotkeys\s*:/, `${file} should not assign default hotkeys`);
    assert.doesNotMatch(source, /detachLeavesOfType/, `${file} should not detach leaves on unload`);
  }

  const commandsSource = await readFile('src/plugin/commands.ts', 'utf8');
  const commandIds = [...commandsSource.matchAll(/id: [`'"]([^`'"]+)/g)].map(match => match[1]);
  assert.ok(commandIds.length >= 10);
  commandIds.forEach(id => assert.doesNotMatch(id, /wisemind/i, `command id ${id} should not repeat the plugin id`));
  for (const messages of [zhCNMessages, enUSMessages]) {
    for (const [key, name] of collectI18nMessages({...messages.commands, ...messages.commandsV2})) {
      assert.doesNotMatch(name, /^WiseMindAI/, `command ${key} should not repeat the plugin name`);
    }
  }
});

test('build keeps Vue in production mode and the bundle small', async () => {
  const main = await readFile('dist/main.js', 'utf8');
  const config = await readFile('vite.config.mjs', 'utf8');

  assert.match(config, /'process\.env\.NODE_ENV'/);
  assert.match(config, /__VUE_PROD_DEVTOOLS__: 'false'/);
  assert.doesNotMatch(main, /markstream|mermaid|monaco/i);
  assert.ok(main.length < 900 * 1024, `main.js is ${Math.round(main.length / 1024)} KB`);
});

test('transcription defaults keep official records in WiseMindAI and avoid automatic note writes', async () => {
  const settingsSource = await readFile('src/settings.ts', 'utf8');

  assert.match(settingsSource, /defaultScene: 'meeting'/);
  assert.match(settingsSource, /defaultMicrophoneId: 'default'/);
  assert.match(settingsSource, /saveAudio: false/);
  assert.match(settingsSource, /completionAction: 'ask'/);
});

test('transcription lives in the plugin shell and controller instead of the page lifecycle', async () => {
  const panelSource = await readFile('src/components/PanelApp.vue', 'utf8');
  const pageSource = await readTranscriptionPageSource();
  const mainSource = await readFile('src/main.ts', 'utf8');
  const apiSource = await readFile('src/wisemindApi.ts', 'utf8');
  const localApiCommonSource = await readFile(
    '../main/src/service/localApiServer/handlers/common.ts',
    'utf8',
  );
  const localApiTranscriptionSource = await readFile(
    '../main/src/service/localApiServer/handlers/transcriptions.ts',
    'utf8',
  );
  const controllerSource = await readFile('src/services/transcriptionController.ts', 'utf8');

  assert.match(panelSource, /value="transcription"/);
  assert.match(panelSource, /<TranscriptionPage/);
  assert.match(panelSource, /wm-transcription-tab-content/);
  assert.match(mainSource, /new TranscriptionController/);
  assert.doesNotMatch(pageSource, /controller\.dispose\(\)/);
  assert.match(pageSource, /testRecording/);
  assert.match(pageSource, /viewAllRecords/);
  assert.match(pageSource, /markHighlightSuccess/);
  assert.match(pageSource, /wm-transcription-complete-footer/);
  assert.match(pageSource, /liveWriteToNote/);
  assert.match(pageSource, /<RekaSwitch/);
  assert.match(pageSource, /startOptions && providerOptions\.length === 0/);
  assert.match(pageSource, /transcription\.providerSetupHint/);
  assert.match(pageSource, /createDefaultRecordTitle/);
  assert.match(pageSource, /transcription\.defaultRecordTitle/);
  assert.match(pageSource, /completionView === 'summary'/);
  assert.match(pageSource, /organizeCompletedRecord/);
  assert.match(pageSource, /copyCompletedTranscript/);
  assert.match(pageSource, /recordsOpened/);
  assert.match(pageSource, /wm-transcription-start-button/);
  assert.match(pageSource, /const health = await plugin\.api\.health\(\)/);
  assert.match(pageSource, /isTranscriptionVersionSupported\(health\.appVersion\)/);
  assert.match(apiSource, /getTranscriptionStartOptions[\s\S]+showConnectionDialog: false/);
  assert.match(apiSource, /organizeTranscription[\s\S]+\/organize/);
  assert.match(apiSource, /updateTranscriptionOrganization[\s\S]+\/organization/);
  assert.match(controllerSource, /getTranscriptionMembership\(detail\.record\.id\)/);
  assert.match(controllerSource, /quota\.canGenerateSummary/);
  assert.match(controllerSource, /summarizeContent/);
  assert.match(controllerSource, /style: 'structured'/);
  assert.match(controllerSource, /catch \{[\s\S]+organizeTranscription/);
  assert.match(localApiCommonSource, /appVersion: app\.getVersion\(\)/);
  assert.match(localApiTranscriptionSource, /assertOrganizationAllowed\(params\.id\)/);
  assert.match(localApiTranscriptionSource, /updateOrganization\(params\.id/);
  assert.equal(
    zhCNMessages.transcription.defaultRecordTitle,
    '来自 Obsidian {date}',
  );
  assert.equal(
    enUSMessages.transcription.defaultRecordTitle,
    'From Obsidian {date}',
  );
});

test('live transcription note content appends finalized segments once and replaces its own block', () => {
  const recordId = 'tr-live-test';
  const block = transcriptionLiveNoteContentHelpers.createLiveTranscriptionBlock(recordId, '逐字稿');
  const initial = `# 会议笔记\n\n${block}\n`;
  const segment = {
    id: 'segment-1',
    recordId,
    text: '这是已经确认的转录内容。',
    isFinal: true,
    beginTimeMs: 3_000,
    sortOrder: 1,
    created_at: 1,
    updated_at: 1,
  };
  const appended = transcriptionLiveNoteContentHelpers.appendLiveTranscriptionSegments(
    initial,
    recordId,
    [segment],
  );
  const appendedAgain = transcriptionLiveNoteContentHelpers.appendLiveTranscriptionSegments(
    appended,
    recordId,
    [segment],
  );

  assert.equal(appendedAgain, appended);
  assert.match(appended, /\*\*00:03\*\*/);
  assert.equal((appended.match(/segment-1/g) || []).length, 1);

  const finalized = transcriptionLiveNoteContentHelpers.replaceLiveTranscriptionBlock(
    appended,
    recordId,
    `# 会议转录\n\n<!-- wisemind:transcription id="${recordId}" -->\n\n完成`,
  );
  assert.match(finalized, /wisemind:transcription id="tr-live-test"/);
  assert.doesNotMatch(finalized, /transcription-live/);
  assert.match(finalized, /^# 会议笔记/);
});

test('live transcription note content ignores partial text and restores confirmed segment order', () => {
  const recordId = 'tr-live-order-test';
  const initial = createLiveNoteFixture(recordId);
  const segment = (id, text, sortOrder, isFinal = true) => ({
    id,
    recordId,
    text,
    isFinal,
    beginTimeMs: sortOrder * 1_000,
    sortOrder,
    created_at: 1,
    updated_at: 1,
  });
  const appended = transcriptionLiveNoteContentHelpers.appendLiveTranscriptionSegments(
    initial,
    recordId,
    [
      segment('segment-2', '第二段', 2),
      segment('segment-partial', '尚未确认', 0, false),
      segment('segment-1', '第一段', 1),
    ],
  );

  assert.ok(appended.indexOf('第一段') < appended.indexOf('第二段'));
  assert.doesNotMatch(appended, /尚未确认/);
});

test('transcription controller avoids duplicate segments and duplicate note completion writes', async () => {
  const controllerSource = await readFile('src/services/transcriptionController.ts', 'utf8');
  const pageSource = await readTranscriptionPageSource();
  const writerSource = await readFile('src/services/transcriptionLiveNoteWriter.ts', 'utf8');

  assert.match(controllerSource, /segmentIds\.has\(event\.segment\.id\)/);
  assert.match(controllerSource, /if \(!event\.segment\.isFinal\)/);
  assert.match(controllerSource, /writer\.disable\(error\)/);
  assert.match(controllerSource, /liveNoteWriteStatus !== 'completed'/);
  assert.match(pageSource, /isCurrentNoteAlreadyWritten/);
  assert.match(pageSource, /v-memo=/);
  assert.match(pageSource, /useStickToBottom/);
  assert.match(pageSource, /handleLiveWriteToggle/);
  assert.match(pageSource, /refreshActiveFile/);
  assert.match(pageSource, /vault\.on\?\.\('rename'/);
  assert.match(writerSource, /vault\.on\?\.\('rename'/);
  assert.match(writerSource, /oldPath !== this\.targetPathValue/);
  assert.match(writerSource, /currentFile\.stat\.ctime !== this\.createdAt/);
  assert.doesNotMatch(writerSource, /currentFile !== this\.file/);
});

test('Obsidian transcription history keeps a compact, deduplicated local cache', () => {
  const detail = {
    record: {
      id: 'tr-history-1',
      title: 'History test',
      scenario: 'meeting',
      status: 'pending',
      provider: 'test',
      model: 'test-model',
      durationMs: 12_000,
      wordCount: 4,
      saveAudio: true,
      summary: 'Summary',
      keyPoints: 'Key point',
      todos: '',
      created_at: 100,
      updated_at: 120,
    },
    segments: [
      {
        id: 'segment-history-1',
        recordId: 'tr-history-1',
        text: 'Test text',
        isFinal: true,
        speakerId: 'speaker-2',
        sortOrder: 0,
        created_at: 100,
        updated_at: 100,
      },
    ],
  };
  const first = transcriptionHistoryHelpers.upsertTranscriptionHistory([], detail, 200);
  const second = transcriptionHistoryHelpers.upsertTranscriptionHistory(first, {
    ...detail,
    record: {...detail.record, summary: 'Updated summary'},
  }, 300);

  assert.equal(second.length, 1);
  assert.equal(second[0].summary, 'Updated summary');
  assert.equal(second[0].segments[0].speakerId, 'speaker-2');
  const restored = transcriptionHistoryHelpers.transcriptionHistoryToDetail(second[0]);
  assert.equal(restored.record.id, 'tr-history-1');
  assert.equal(restored.record.saveAudio, false);
  assert.equal(restored.segments[0].text, 'Test text');
});

test('Obsidian transcription starts the recognition connection and provides a protocol fallback', async () => {
  const socketServerSource = await readFile(
    '../main/src/service/localApiServer/transcriptionSocket.ts',
    'utf8',
  );
  const apiSource = await readFile('src/wisemindApi.ts', 'utf8');
  const pageSource = await readTranscriptionPageSource();
  const localApiTranscriptionSource = await readFile(
    '../main/src/service/localApiServer/handlers/transcriptions.ts',
    'utf8',
  );

  assert.match(socketServerSource, /subscribe\(socket, record\.id\);[\s\S]+service\.connect\(record\.id\)/);
  assert.match(apiSource, /openExternal\(buildWiseMindDeepLink\(payload\)\)/);
  assert.match(await readFile('src/apiUtils.ts', 'utf8'), /wisemindai:\/\/open/);
  assert.match(pageSource, /transcription\.history/);
  assert.match(pageSource, /speakerDiarization/);
  assert.match(pageSource, /segment\.speakerLabel/);
  assert.match(pageSource, /manageSpeakers/);
  assert.match(pageSource, /assignCompletedSpeaker/);
  assert.match(apiSource, /updateTranscriptionSegments[\s\S]+\/segments/);
  assert.match(localApiTranscriptionSource, /updateSegments\(params\.id/);
  assert.doesNotMatch(pageSource, /class="wm-transcription-quota"/);
});

test('transcription availability distinguishes old clients from stopped clients', () => {
  assert.equal(transcriptionAvailabilityHelpers.MINIMUM_TRANSCRIPTION_VERSION, '1.3.1');
  assert.equal(transcriptionAvailabilityHelpers.isTranscriptionVersionSupported(undefined), false);
  assert.equal(transcriptionAvailabilityHelpers.isTranscriptionVersionSupported('1.3.0'), false);
  assert.equal(transcriptionAvailabilityHelpers.isTranscriptionVersionSupported('1.3.1-beta.1'), false);
  assert.equal(transcriptionAvailabilityHelpers.isTranscriptionVersionSupported('1.3.1'), true);
  assert.equal(transcriptionAvailabilityHelpers.isTranscriptionVersionSupported('v1.3.2'), true);
  assert.equal(transcriptionAvailabilityHelpers.isTranscriptionVersionSupported('2.0.0-beta.1'), true);
  assert.match(
    zhCNMessages.transcription.compatibility.unsupportedDesc,
    /v\{version\}/,
  );
  assert.match(
    enUSMessages.transcription.compatibility.unsupportedDesc,
    /v\{version\}/,
  );
  assert.equal(
    transcriptionAvailabilityHelpers.classifyTranscriptionAvailabilityError({status: 404}),
    'unsupported',
  );
  assert.equal(
    transcriptionAvailabilityHelpers.classifyTranscriptionAvailabilityError(new Error('offline')),
    'not-running',
  );
  assert.equal(
    transcriptionAvailabilityHelpers.classifyTranscriptionAvailabilityError({status: 500}),
    'error',
  );
});

test('transcription organization separates summary, key points, todos, and ignores tags', () => {
  const result = transcriptionOrganizationHelpers.parseTranscriptionOrganizationMarkdown(`
### 摘要
项目将在本周完成上线。
### 关键要点
- 周一完成测试
- 周三发布
### 行动建议
- 确认发布检查清单
### 标签
#项目
  `);

  assert.equal(result.summary, '项目将在本周完成上线。');
  assert.match(result.keyPoints, /周一完成测试/);
  assert.match(result.todos, /确认发布检查清单/);
  assert.doesNotMatch(JSON.stringify(result), /#项目/);

  assert.deepEqual(
    transcriptionOrganizationHelpers.parseTranscriptionOrganizationMarkdown('Plain summary'),
    {summary: 'Plain summary', keyPoints: '', todos: ''},
  );
});

function createLiveNoteFixture(recordId) {
  return `# 会议笔记\n\n${transcriptionLiveNoteContentHelpers.createLiveTranscriptionBlock(recordId, '逐字稿')}\n`;
}

test('microphone test WAV output has a valid PCM header and payload length', async () => {
  const blob = audioCaptureHelpers.pcm16ChunksToWavBlob([
    new Uint8Array([1, 2, 3, 4]),
    new Uint8Array([5, 6]),
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));

  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 4), 'WAVE');
  assert.equal(text(36, 4), 'data');
  assert.equal(new DataView(bytes.buffer).getUint32(40, true), 6);
  assert.equal(bytes.length, 50);
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
  assert.match(builtCss, /\.wm\\:[a-z][\w-]*\{/);
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
    targetLabels: ['Topic: Obsidian import', 'Note: Root'],
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

test('card review helpers split faces and follow the desktop schedule', () => {
  assert.deepEqual(cardReviewHelpers.splitCardContent('Q: What is it?\nA: An answer'), {
    question: 'What is it?',
    answer: 'An answer',
  });
  assert.deepEqual(cardReviewHelpers.splitCardContent('Front\n\n---\n\nBack'), {question: 'Front', answer: 'Back'});
  assert.deepEqual(cardReviewHelpers.splitCardContent('Only one line'), {question: 'Only one line', answer: ''});

  assert.equal(cardReviewHelpers.nextRememberDays(null), 1);
  assert.equal(cardReviewHelpers.nextRememberDays({lastGrade: 2, rememberStreak: 1}), 3);
  assert.equal(cardReviewHelpers.nextRememberDays({lastGrade: 0, rememberStreak: 4}), 1);
  assert.equal(cardReviewHelpers.nextRememberDays({lastGrade: 2, rememberStreak: 99}), 60);

  assert.equal(cardReviewHelpers.gradeFromKey('1'), 0);
  assert.equal(cardReviewHelpers.gradeFromKey('3'), 2);
  assert.equal(cardReviewHelpers.gradeFromKey('4'), null);
  assert.equal(cardReviewHelpers.estimateReviewMinutes(0), 0);
  assert.equal(cardReviewHelpers.estimateReviewMinutes(30), 10);
  assert.deepEqual(
    cardReviewHelpers.summarizeReviewResults([
      {cardId: 1, grade: 2, duration: 5},
      {cardId: 2, grade: 0, duration: 7},
    ]),
    {remember: 1, vague: 0, forgot: 1, duration: 12},
  );
});

test('related notes rank links, shared tags, then folder neighbours', () => {
  const tags = relatedNotesHelpers.collectNoteTags({
    tags: [{tag: '#Project'}],
    frontmatter: {tags: ['review', '#project']},
  });
  assert.deepEqual(tags.sort(), ['project', 'review']);

  const ranked = relatedNotesHelpers.rankRelatedNotes({
    activePath: 'Work/Plan.md',
    activeTags: ['project'],
    linkedPaths: new Set(['Archive/Linked.md']),
    candidates: [
      {path: 'Work/Plan.md', title: 'Plan', folderPath: 'Work', tags: [], modifiedAt: 1},
      {path: 'Work/Sibling.md', title: 'Sibling', folderPath: 'Work', tags: [], modifiedAt: 5},
      {path: 'Archive/Linked.md', title: 'Linked', folderPath: 'Archive', tags: [], modifiedAt: 1},
      {path: 'Other/Tagged.md', title: 'Tagged', folderPath: 'Other', tags: ['Project'], modifiedAt: 1},
      {path: 'Other/None.md', title: 'None', folderPath: 'Other', tags: [], modifiedAt: 9},
    ],
  });
  assert.deepEqual(ranked.map(note => note.title), ['Linked', 'Tagged', 'Sibling']);
  assert.equal(ranked[0].linked, true);
  assert.equal(ranked[1].sharedTag, 'Project');
});

test('unified search matches vault titles and normalizes WiseMindAI groups', () => {
  const hits = searchResultsHelpers.searchVaultItems([
    {path: 'Notes/Alpha plan.md', title: 'Alpha plan', folderPath: 'Notes', modifiedAt: 1},
    {path: 'Alpha/Readme.md', title: 'Readme', folderPath: 'Alpha', modifiedAt: 2},
    {path: 'Notes/Beta.md', title: 'Beta', folderPath: 'Notes', modifiedAt: 3},
  ], 'alpha');
  assert.deepEqual(hits.map(hit => hit.title), ['Alpha plan', 'Readme']);
  assert.equal(hits[0].titleMatch, true);
  assert.deepEqual(searchResultsHelpers.searchVaultItems([], '  '), []);

  const remote = searchResultsHelpers.normalizeWiseMindSearch({
    data: {
      notes: [{id: 3, title: 'Remote note', snippet: 'first   line'}],
      cards: [{id: 9, content: 'card body', deckId: 2}],
      'knowledge-documents': [{id: 1, name: 'Doc', knowledgeBaseId: 7}],
    },
  });
  assert.deepEqual(remote.map(item => [item.type, item.title]), [
    ['note', 'Remote note'],
    ['knowledge-document', 'Doc'],
  ]);
  assert.equal(remote[0].snippet, 'first line');
  assert.equal(remote[1].knowledgeBaseId, '7');
});

test('rewrite diff marks changes and tag helpers merge frontmatter safely', () => {
  const parts = textDiffHelpers.diffText('The quick fox', 'The slow fox');
  assert.deepEqual(parts, [
    {type: 'same', text: 'The '},
    {type: 'removed', text: 'quick'},
    {type: 'added', text: 'slow'},
    {type: 'same', text: ' fox'},
  ]);
  const cjk = textDiffHelpers.diffText('\u5b66\u4e60\u65b9\u6cd5', '\u5b66\u4e60\u6280\u5de7');
  assert.equal(cjk[0].text, '\u5b66\u4e60');
  assert.equal(textDiffHelpers.diffText('a '.repeat(2000), 'b '.repeat(2000)), null);

  assert.deepEqual(textDiffHelpers.parseGeneratedTags('#AI #learning #AI'), ['AI', 'learning']);
  assert.deepEqual(textDiffHelpers.parseGeneratedTags('note taking, review'), ['note-taking', 'review']);
  assert.deepEqual(textDiffHelpers.mergeFrontmatterTags('ai, #notes', ['AI', 'review']), {
    tags: ['ai', 'notes', 'review'],
    addedCount: 1,
  });
});

test('sync rules match folders and nested tags, and skip private or ignored notes', () => {
  const rule = (kind, value, extra = {}) => ({
    id: 'r', kind, value, includeSubfolders: true, trigger: 'auto', knowledgeBaseIds: [], knowledgeBaseNames: [],
    enabled: true, createdAt: 0, ...extra,
  });
  const note = (path, tags = [], frontmatter = null) => ({path, tags, frontmatter});
  assert.equal(syncRulesHelpers.ruleMatches(rule('folder', 'Study/'), note('Study/os/a.md')), true);
  assert.equal(syncRulesHelpers.ruleMatches(rule('folder', 'Study', {includeSubfolders: false}), note('Study/os/a.md')), false);
  assert.equal(syncRulesHelpers.ruleMatches(rule('folder', 'Study'), note('Studying/a.md')), false);
  assert.equal(syncRulesHelpers.ruleMatches(rule('folder', '', {includeSubfolders: false}), note('a.md')), true);
  assert.equal(syncRulesHelpers.ruleMatches(rule('tag', '#study'), note('a.md', ['#Study/os'])), true);
  assert.equal(syncRulesHelpers.ruleMatches(rule('tag', 'study'), note('a.md', ['studying'])), false);
  assert.equal(syncRulesHelpers.ruleMatches(rule('tag', 'study', {enabled: false}), note('a.md', ['study'])), false);
  assert.deepEqual(
    syncRulesHelpers.topicIdsFor([rule('tag', 'a', {knowledgeBaseIds: [3, 1]}), rule('tag', 'b', {knowledgeBaseIds: [1, 0, 5]})]),
    [3, 1, 5],
  );
  const options = {ignorePatterns: ['Private/**', '**/drafts/**'], respectPrivate: true};
  assert.equal(syncRulesHelpers.isNoteExcluded(note('Private/a.md'), options), true);
  assert.equal(syncRulesHelpers.isNoteExcluded(note('x/drafts/a.md'), options), true);
  assert.equal(syncRulesHelpers.isNoteExcluded(note('Private2/a.md'), options), false);
  assert.equal(syncRulesHelpers.isPathIgnored('.trash/a.md', ['**/.trash/**']), true);
  assert.equal(syncRulesHelpers.isPathIgnored('x/.trash/a.md', ['**/.trash/**']), true);
  assert.equal(syncRulesHelpers.isPathIgnored('x/my.trash/a.md', ['**/.trash/**']), false);
  assert.equal(syncRulesHelpers.isPathIgnored('.obsidian/app.json', ['.obsidian/**']), true);
  assert.equal(syncRulesHelpers.isNoteExcluded(note('a.md', [], {private: 'true'}), options), true);
  assert.equal(syncRulesHelpers.isNoteExcluded(note('a.md', [], {private: true}), {...options, respectPrivate: false}), false);
});

test('incremental sync classifies by stat first and by hash only when needed', () => {
  const record = {path: 'a.md', remoteId: '9', contentHash: 'h1', mtime: 10, size: 5, syncedAt: 0};
  assert.equal(syncRulesHelpers.classifyByStat({mtime: 10, size: 5}, null), 'new');
  assert.equal(syncRulesHelpers.classifyByStat({mtime: 10, size: 5}, record), 'unchanged');
  assert.equal(syncRulesHelpers.classifyByStat({mtime: 11, size: 5}, record), null);
  assert.equal(syncRulesHelpers.classifyByStat({mtime: 11, size: 5}, {...record, held: true}), 'held');
  assert.equal(syncRulesHelpers.classifyByHash('h1', record), 'unchanged');
  assert.equal(syncRulesHelpers.classifyByHash('h2', record), 'changed');

  const synced = {...record, remoteContentHash: 'r1'};
  assert.equal(syncRulesHelpers.hasRemoteConflict(synced, {contentHash: 'r1'}, 'h2'), false);
  assert.equal(syncRulesHelpers.hasRemoteConflict(synced, {contentHash: 'r2'}, 'h2'), true);
  assert.equal(syncRulesHelpers.hasRemoteConflict(synced, {contentHash: 'h2'}, 'h2'), false);
  assert.equal(syncRulesHelpers.hasRemoteConflict({...record, remoteId: ''}, {contentHash: 'x'}, 'h2'), false);
});

test('sync quota, batching and the bounded worker pool', async () => {
  const usage = {plan: 'free', items: [{key: 'fileCount', usage: 48, limit: 50}, {key: 'noteCount', usage: 3, limit: null}]};
  assert.equal(syncRulesHelpers.remainingQuota(usage), 2);
  assert.equal(syncRulesHelpers.remainingQuota(usage, 'noteCount'), null);
  assert.equal(syncRulesHelpers.remainingQuota({items: [{key: 'fileCount', usage: 60, limit: 50}]}), 0);
  assert.equal(syncRulesHelpers.remainingQuota(null), null);
  assert.deepEqual(syncRulesHelpers.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);

  let active = 0;
  let peak = 0;
  const seen = [];
  await syncRulesHelpers.runPool([1, 2, 3, 4, 5, 6, 7], 3, async item => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    seen.push(item);
    active -= 1;
  });
  assert.equal(peak, 3);
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5, 6, 7]);

  const controller = new AbortController();
  const done = [];
  await syncRulesHelpers.runPool([1, 2, 3, 4], 1, async item => {
    done.push(item);
    if (item === 2) controller.abort();
  }, controller.signal);
  assert.deepEqual(done, [1, 2]);
});

test('client version gate, reverse sync switch and semantic search mode', () => {
  assert.equal(featureHelpers.ENABLE_REVERSE_SYNC, false);
  assert.ok(featureHelpers.compareVersions('1.9.12', featureHelpers.MIN_CLIENT_VERSION) < 0);
  assert.equal(featureHelpers.compareVersions('2.0.0', '2.0'), 0);
  assert.ok(featureHelpers.compareVersions('2.1.0-beta', '2.0.9') > 0);
  assert.deepEqual(searchResultsHelpers.readSearchMode({mode: 'semantic', degraded: true}), {mode: 'semantic', degraded: true});
  assert.deepEqual(searchResultsHelpers.readSearchMode(null), {mode: 'keyword', degraded: false});
});

test('sync updates add each topic once and keep the remote file across renames', () => {
  assert.deepEqual(syncRulesHelpers.missingTopicIds([1, 2, 3], [2]), [1, 3]);
  assert.deepEqual(syncRulesHelpers.missingTopicIds([1, 2], undefined), [1, 2]);
  assert.deepEqual(syncRulesHelpers.missingTopicIds([1], [1]), []);
  assert.deepEqual(
    syncRulesHelpers.acceptedTopicIds([{knowledgeBaseId: '4', ok: true}, {knowledgeBaseId: 5, ok: false}, {knowledgeBaseId: 6, ok: true}]),
    [4, 6],
  );
  assert.deepEqual(syncRulesHelpers.acceptedTopicIds(null), []);

  const record = {path: 'b.md', remoteId: '9', contentHash: 'h1', mtime: 10, size: 5, syncedAt: 1, topicIds: [3]};
  const moved = syncRulesHelpers.renamedRecord(record);
  assert.equal(moved.remoteId, '9');
  assert.deepEqual(moved.topicIds, [3]);
  assert.equal(syncRulesHelpers.classifyByStat({mtime: 10, size: 5}, moved), null);
  assert.equal(syncRulesHelpers.classifyByHash('h1', moved), 'changed');
});

test('sync index keys keep each learning space apart', () => {
  const key = syncRulesHelpers.scopedKey('ws-1', 'Study/a.md');
  assert.notEqual(key, syncRulesHelpers.scopedKey('ws-2', 'Study/a.md'));
  assert.deepEqual(syncRulesHelpers.splitScopedKey(key), {scope: 'ws-1', path: 'Study/a.md'});
  assert.equal(syncRulesHelpers.scopedKey('', 'a.md'), 'a.md');
  assert.deepEqual(syncRulesHelpers.splitScopedKey('a.md'), {scope: '', path: 'a.md'});
});

test('Obsidian write paths reject traversal and .obsidian', () => {
  assert.equal(textHelpers.assertSafeObsidianRelativePath('Notes/a.md'), 'Notes/a.md');
  assert.equal(textHelpers.sanitizePathSegments('../.obsidian/x'), 'x');
  assert.throws(() => textHelpers.assertSafeObsidianRelativePath('../secret.md'));
  assert.throws(() => textHelpers.assertSafeObsidianRelativePath('.obsidian/app.json'));
  assert.throws(() => textHelpers.assertSafeObsidianRelativePath(''));
});

test('API errors map to codes and readable messages', () => {
  const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
  const debug = extra => ({method: 'GET', url: 'u', path: '/p', timeoutMs: 1, ...extra});
  assert.equal(apiErrorHelpers.inferErrorCode(403, debug({responseBody: {code: 'MEMBERSHIP_LIMIT'}})), 'MEMBERSHIP_LIMIT');
  assert.equal(apiErrorHelpers.inferErrorCode(413, debug()), 'TOO_LARGE');
  assert.equal(apiErrorHelpers.inferErrorCode(404, debug()), 'NOT_FOUND');
  assert.equal(apiErrorHelpers.inferErrorCode(undefined, debug({error: 'timeout'})), 'TIMEOUT');
  assert.equal(apiErrorHelpers.inferErrorCode(undefined, debug()), 'NETWORK');

  const quota = new apiErrorHelpers.WiseMindApiError(
    'full',
    403,
    debug({responseBody: {code: 'MEMBERSHIP_LIMIT', usage: 50, limit: 50}}),
  );
  assert.equal(apiErrorHelpers.isMembershipLimitError(quota), true);
  assert.equal(quota.usage, 50);
  assert.equal(quota.limit, 50);

  assert.equal(apiErrorHelpers.describeApiError({code: 'NETWORK'}, t), 'apiErrors.connectFailed');
  assert.equal(apiErrorHelpers.describeApiError({code: 'AI_NOT_CONFIGURED', status: 409}, t), 'capability.aiNotReadyNotice');
  assert.equal(apiErrorHelpers.describeApiError({code: 'NOT_FOUND', serverMessage: 'Not found'}, t), 'apiErrors.notFound');
  assert.equal(apiErrorHelpers.describeApiError({code: 'NOT_FOUND', serverMessage: 'Note missing'}, t), 'Note missing');
  assert.equal(apiErrorHelpers.describeApiError({code: 'HTTP', status: 500}, t), 'apiErrors.requestFailed:{"status":500}');
  for (const messages of [zhCNMessages, enUSMessages]) {
    for (const key of ['connectFailed', 'tooLarge', 'notFound', 'requestFailed']) assert.ok(messages.apiErrors[key], key);
  }
});
