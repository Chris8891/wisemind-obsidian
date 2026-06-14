import type { App, TFile } from 'obsidian';

import { convertObsidianImagesToWiseMindMarkdown } from './markdownImages';
import { stripSourceMarkers } from './markers';
import { hashText, markdownToPlainText, normalizeTags } from './text';
import type { ObsidianSourceItem } from './types';

export type ScanVaultOptions = {
  folderPrefix?: string;
  maxFileSizeKb: number;
  ignorePatterns: string[];
};

type FrontmatterResult = {
  frontmatter: Record<string, unknown>;
  body: string;
};

export const scanVault = async (app: App, options: ScanVaultOptions): Promise<ObsidianSourceItem[]> => {
  const maxBytes = options.maxFileSizeKb * 1024;
  const files = app.vault
    .getMarkdownFiles()
    .filter(file => shouldIncludeFile(file, maxBytes, options));

  const items = await Promise.all(files.map(file => readObsidianFile(app, file)));
  return items.sort((a, b) => a.path.localeCompare(b.path));
};

export const readObsidianFile = async (app: App, file: TFile): Promise<ObsidianSourceItem> => {
  const raw = await app.vault.cachedRead(file);
  const markdown = convertObsidianImagesToWiseMindMarkdown(app, stripSourceMarkers(raw), file.path);
  const { frontmatter, body } = parseFrontmatter(markdown);
  const tags = Array.from(new Set([...normalizeTags(frontmatter.tags), ...extractInlineTags(body)]));
  const title = titleFromMarkdown(markdown, file.basename);
  const folderPath = file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : '';
  const contentHash = await hashText(markdown);

  return {
    path: file.path,
    absolutePath: resolveAbsolutePath(app, file.path),
    basename: file.basename,
    folderPath,
    title,
    markdown,
    plainText: markdownToPlainText(body),
    tags,
    frontmatter,
    modifiedAt: file.stat.mtime,
    size: file.stat.size,
    contentHash,
  };
};

const resolveAbsolutePath = (app: App, path: string) => {
  const adapter = (app.vault as any).adapter;
  const basePath = typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : '';
  return basePath ? `${String(basePath).replace(/\/+$/, '')}/${path}` : path;
};

export const titleFromMarkdown = (markdown: string, fallback: string) => {
  const { frontmatter, body } = parseFrontmatter(markdown);
  const frontmatterTitle = typeof frontmatter.title === 'string' ? frontmatter.title.trim() : '';
  if (frontmatterTitle) return frontmatterTitle;
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallback || 'Untitled note';
};

export const stripFrontmatter = (markdown: string) => parseFrontmatter(markdown).body;

export const extractInlineTags = (markdown: string) => {
  const tags = new Set<string>();
  const regex = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown))) {
    const tag = match[2]?.replace(/^#/, '').trim();
    if (tag) tags.add(tag);
  }
  return Array.from(tags);
};

export const parseFrontmatter = (markdown: string): FrontmatterResult => {
  if (!markdown.startsWith('---')) {
    return { frontmatter: {}, body: markdown };
  }

  const end = markdown.indexOf('\n---', 3);
  if (end === -1) {
    return { frontmatter: {}, body: markdown };
  }

  const raw = markdown.slice(3, end).trim();
  const body = markdown.slice(end + 4).replace(/^\r?\n/, '');
  const frontmatter: Record<string, unknown> = {};

  raw.split(/\r?\n/).forEach(line => {
    const index = line.indexOf(':');
    if (index === -1) return;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!key) return;
    if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      frontmatter[key] = value.replace(/^['"]|['"]$/g, '');
    }
  });

  return { frontmatter, body };
};

const shouldIncludeFile = (file: TFile, maxBytes: number, options: ScanVaultOptions) => {
  if (file.extension !== 'md') return false;
  if (!file.path.toLowerCase().endsWith('.md')) return false;
  if (file.path.toLowerCase().endsWith('.canvas') || file.path.toLowerCase().endsWith('.base')) return false;
  if (file.stat.size > maxBytes) return false;
  if (options.folderPrefix && !file.path.startsWith(options.folderPrefix)) return false;
  if (file.path.split('/').some(part => part.startsWith('.') && part !== '.')) return false;
  return !options.ignorePatterns.some(pattern => matchSimplePattern(file.path, pattern));
};

const matchSimplePattern = (path: string, pattern: string) => {
  if (!pattern) return false;
  if (pattern.endsWith('/**')) return path.startsWith(pattern.slice(0, -3));
  if (pattern.startsWith('**/')) return path.includes(pattern.slice(3).replace('/**', ''));
  return path === pattern || path.startsWith(`${pattern}/`);
};
