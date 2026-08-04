import {Notice, TFile} from 'obsidian';

import {translate} from '../i18n';
import type WiseMindObsidianPlugin from '../main';
import {ensureFolder, nextAvailablePath} from '../obsidianWriter';
import {sanitizeFileName} from '../text';
import type {TranscriptionDetail} from '../types';

import {
  formatTranscriptionTime,
  normalizeConfirmedTranscriptionSegments,
} from './transcriptionLiveNoteContent';

export const transcriptionMarkdown = (
  plugin: WiseMindObsidianPlugin,
  detail: TranscriptionDetail,
) => {
  const {record, segments} = detail;
  const language = plugin.settings.assistantDefaults.language;
  const transcript = normalizeConfirmedTranscriptionSegments(segments)
    .map(segment => {
      const speakerNumber = Number(String(segment.speakerId || '').match(/(\d+)$/)?.[1] || 0);
      const speaker =
        segment.speakerLabel?.trim() ||
        (speakerNumber
          ? translate(language, 'transcription.speakerName', {number: speakerNumber})
          : '');
      return [
        `**${formatTranscriptionTime(segment.beginTimeMs)}${speaker ? ` · ${speaker}` : ''}**`,
        '',
        segment.text.trim(),
      ].join('\n');
    })
    .join('\n\n');
  const sections = [
    `# ${record.title}`,
    '',
    `<!-- wisemind:transcription id="${record.id}" -->`,
    '',
  ];
  if (record.summary?.trim()) {
    sections.push(`## ${translate(language, 'transcription.noteSections.summary')}`, '', record.summary.trim(), '');
  }
  if (record.keyPoints?.trim()) {
    sections.push(`## ${translate(language, 'transcription.noteSections.keyPoints')}`, '', record.keyPoints.trim(), '');
  }
  if (record.todos?.trim()) {
    sections.push(`## ${translate(language, 'transcription.noteSections.todos')}`, '', record.todos.trim(), '');
  }
  sections.push(
    `## ${translate(language, 'transcription.noteSections.transcript')}`,
    '',
    transcript || '-',
    '',
  );
  return sections.join('\n').trim();
};

export const appendTranscriptionToNote = async (
  plugin: WiseMindObsidianPlugin,
  detail: TranscriptionDetail,
  targetPath: string,
) => {
  const file = plugin.app.vault.getAbstractFileByPath(targetPath);
  if (!(file instanceof TFile) || file.extension !== 'md') {
    throw new Error(translate(plugin.settings.assistantDefaults.language, 'transcription.targetMissing'));
  }
  const marker = `<!-- wisemind:transcription id="${detail.record.id}" -->`;
  await plugin.app.vault.process(file, content => {
    if (content.includes(marker)) return content;
    return `${content.trimEnd()}\n\n${transcriptionMarkdown(plugin, detail)}\n`;
  });
  new Notice(
    translate(plugin.settings.assistantDefaults.language, 'transcription.insertedCurrent', {
      path: targetPath,
    }),
  );
  return targetPath;
};

export const saveTranscriptionAsNewNote = async (
  plugin: WiseMindObsidianPlugin,
  detail: TranscriptionDetail,
) => {
  const folder = (plugin.settings.defaultObsidianRootFolder || 'WiseMindAI').replace(
    /^\/+|\/+$/g,
    '',
  );
  if (folder) await ensureFolder(plugin.app, folder);
  const fallback = translate(
    plugin.settings.assistantDefaults.language,
    'transcription.defaultNoteTitle',
  );
  const filename = sanitizeFileName(detail.record.title, fallback);
  const targetPath = await nextAvailablePath(
    plugin.app,
    folder ? `${folder}/${filename}.md` : `${filename}.md`,
  );
  await plugin.app.vault.create(targetPath, `${transcriptionMarkdown(plugin, detail)}\n`);
  new Notice(
    translate(plugin.settings.assistantDefaults.language, 'transcription.savedNewNote', {
      path: targetPath,
    }),
  );
  return targetPath;
};
