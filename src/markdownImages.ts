import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { App, TFile } from 'obsidian';

import { hashText, sanitizeFileName } from './text';

const imageExtensionPattern = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;
const externalUrlPattern = /^(?:https?:|data:|app:|obsidian:|wise:)/i;
const wiseMindAssetFolderName = 'WiseMindAI Attachments';
const wiseMindSpaceFlag = '_WISEMINDSPACE_';

export const prepareWiseMindImagesForObsidian = async (
  app: App,
  markdown: string,
  targetMarkdownPath: string,
) => {
  const cache = new Map<string, string>();
  const imagePattern = /!\[([^\]]*)]\(\s*<?(wise:\/\/[^)>]+)>?\s*\)/g;
  const matches = Array.from(markdown.matchAll(imagePattern));
  let converted = markdown;

  for (const match of matches) {
    const [fullMatch, alt = '', wiseUrl = ''] = match;
    const sourcePath = wiseUrlToPath(wiseUrl);
    if (!sourcePath || !imageExtensionPattern.test(sourcePath)) continue;

    const vaultPath = await copyExternalImageToVault(app, sourcePath, targetMarkdownPath, cache);
    const replacement = vaultPath
      ? `![[${vaultPath}${alt ? `|${alt}` : ''}]]`
      : `![${alt}](file://${encodeURI(sourcePath)})`;
    converted = converted.replace(fullMatch, replacement);
  }

  return converted;
};

export const convertObsidianImagesToWiseMindMarkdown = (
  app: App,
  markdown: string,
  sourcePath: string,
) => {
  const withWikiImages = markdown.replace(/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?]]/g, (full, link, alt) => {
    const file = resolveVaultFile(app, String(link).trim(), sourcePath);
    if (!file || !imageExtensionPattern.test(file.path)) return full;
    return `![${alt || file.basename}](${toWiseUrl(resolveAbsolutePath(app, file.path))})`;
  });

  return withWikiImages.replace(/!\[([^\]]*)]\(([^)]+)\)/g, (full, alt, rawDestination) => {
    const destination = cleanMarkdownDestination(String(rawDestination));
    if (!destination || externalUrlPattern.test(destination)) return full;

    const absolutePath = resolveMarkdownImagePath(app, destination, sourcePath);
    if (!absolutePath || !imageExtensionPattern.test(absolutePath)) return full;
    return `![${alt}](${toWiseUrl(absolutePath)})`;
  });
};

export const writeConvertedMarkdownCache = async (
  app: App,
  sourcePath: string,
  title: string,
  markdown: string,
) => {
  const adapter = (app.vault as any).adapter;
  const basePath = typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : '';
  if (!basePath) return '';

  const hash = (await hashText(`${sourcePath}\n${markdown}`)).slice(0, 12);
  const cacheDir = `${String(basePath).replace(/\/+$/, '')}/.wisemindai-sync-cache`;
  const filename = `${sanitizeFileName(title, 'obsidian-import')}-${hash}.md`;
  const cachePath = `${cacheDir}/${filename}`;
  await mkdir(cacheDir, {recursive: true});
  await writeFile(cachePath, markdown, 'utf8');
  return cachePath;
};

const copyExternalImageToVault = async (
  app: App,
  sourcePath: string,
  targetMarkdownPath: string,
  cache: Map<string, string>,
) => {
  if (cache.has(sourcePath)) return cache.get(sourcePath) || '';

  const targetFolder = targetMarkdownPath.includes('/')
    ? targetMarkdownPath.split('/').slice(0, -1).join('/')
    : '';
  const assetFolder = normalizeVaultPath(`${targetFolder}/${wiseMindAssetFolderName}`);
  const fileName = sanitizeFileName(sourcePath.split('/').pop() || 'image.png', 'image.png');
  const targetPath = await nextAvailableVaultPath(app, normalizeVaultPath(`${assetFolder}/${fileName}`));

  try {
    await ensureVaultFolder(app, assetFolder);
    const data = await readFile(sourcePath);
    await (app.vault as any).createBinary(
      targetPath,
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    );
    cache.set(sourcePath, targetPath);
    return targetPath;
  } catch {
    cache.set(sourcePath, '');
    return '';
  }
};

const resolveMarkdownImagePath = (app: App, destination: string, sourcePath: string) => {
  if (destination.startsWith('file://')) return safeDecode(destination.replace(/^file:\/\//i, ''));
  if (destination.startsWith('/')) return safeDecode(destination);

  const sourceFolder = sourcePath.includes('/') ? sourcePath.split('/').slice(0, -1).join('/') : '';
  const vaultPath = normalizeVaultPath(`${sourceFolder}/${safeDecode(destination)}`);
  const file = app.vault.getAbstractFileByPath(vaultPath) as TFile | null;
  return file ? resolveAbsolutePath(app, file.path) : '';
};

const resolveVaultFile = (app: App, linkPath: string, sourcePath: string) => {
  const file = (app as any).metadataCache?.getFirstLinkpathDest(linkPath, sourcePath);
  if (file) return file;
  const directFile = app.vault.getAbstractFileByPath(linkPath) as TFile | null;
  if (directFile) return directFile;
  const normalizedLink = linkPath.replace(/\\/g, '/');
  const basename = normalizedLink.split('/').pop()?.toLowerCase();
  if (!basename) return null;
  return ((app.vault as any).getFiles?.() || []).find((item: TFile) => {
    const path = item.path.toLowerCase();
    return path === normalizedLink.toLowerCase() || path.endsWith(`/${basename}`);
  }) || null;
};

const resolveAbsolutePath = (app: App, path: string) => {
  const adapter = (app.vault as any).adapter;
  const basePath = typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : '';
  return basePath ? `${String(basePath).replace(/\/+$/, '')}/${path}` : path;
};

const ensureVaultFolder = async (app: App, folderPath: string) => {
  const parts = folderPath.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
  }
};

const nextAvailableVaultPath = async (app: App, path: string) => {
  if (!app.vault.getAbstractFileByPath(path)) return path;
  const dot = path.lastIndexOf('.');
  const base = dot === -1 ? path : path.slice(0, dot);
  const ext = dot === -1 ? '' : path.slice(dot);
  let index = 2;
  let candidate = `${base} ${index}${ext}`;
  while (app.vault.getAbstractFileByPath(candidate)) {
    index += 1;
    candidate = `${base} ${index}${ext}`;
  }
  return candidate;
};

const cleanMarkdownDestination = (value: string) =>
  value.trim().replace(/^<|>$/g, '').replace(/^['"]|['"]$/g, '');

const wiseUrlToPath = (value: string) => {
  const path = value.replace(/^wise:\/\//i, '');
  return safeDecode(path.startsWith('/') ? path : `/${path}`).replaceAll(wiseMindSpaceFlag, ' ');
};

const toWiseUrl = (path: string) => `wise://${encodeURI(path.replaceAll(' ', wiseMindSpaceFlag))}`;

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeVaultPath = (value: string) => value.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
