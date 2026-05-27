import { stripSourceMarkers } from './markers';
import { hashText, markdownToPlainText, normalizeTags } from './text';
import type { WiseMindFolder, WiseMindSnapshot, WiseMindSourceItem } from './types';
import type { WiseMindApiClient } from './wisemindApi';

export type WiseMindScanOptions = {
  includeNotes: boolean;
  includeDocuments: boolean;
  includeKnowledgeDocuments: boolean;
};

export const loadWiseMindSources = async (
  api: WiseMindApiClient,
  options: WiseMindScanOptions,
): Promise<{ snapshot: WiseMindSnapshot; items: WiseMindSourceItem[] }> => {
  const snapshot = await api.loadSnapshot();
  const items: WiseMindSourceItem[] = [];

  if (options.includeNotes) {
    for (const note of snapshot.notes.filter(item => !item.is_folder)) {
      items.push(await normalizeWiseMindNote(note, snapshot.noteFolders));
    }
  }

  if (options.includeDocuments) {
    for (const doc of snapshot.documents.filter(item => !item.is_folder && isMarkdownRecord(item))) {
      const detail = hasDocumentBody(doc) ? doc : await api.getDocument(doc.id).catch(() => doc);
      const normalized = await normalizeWiseMindDocument({ ...doc, ...detail }, snapshot.documentFolders);
      if (normalized.markdown.trim()) items.push(normalized);
    }
  }

  if (options.includeKnowledgeDocuments) {
    for (const knowledgeDocument of snapshot.knowledgeDocuments.filter(isMarkdownRecord)) {
      const base = snapshot.knowledgeBases.find(item => String(item.id) === String(knowledgeDocument.knowledgeBaseId));
      const detail = hasKnowledgeDocumentContent(knowledgeDocument)
        ? knowledgeDocument
        : await api.getKnowledgeDocument(knowledgeDocument.id).catch(() => knowledgeDocument);
      const normalized = await normalizeWiseMindKnowledgeDocument({ ...knowledgeDocument, ...detail }, base);
      if (normalized.markdown.trim() || isKnowledgeMarkdownUploadRecord(normalized.raw)) items.push(normalized);
    }
  }

  return { snapshot, items };
};

export const normalizeWiseMindNote = async (note: any, folders: WiseMindFolder[] = []): Promise<WiseMindSourceItem> => {
  const markdown = stripSourceMarkers(firstText(note.md, note.text, note.content));
  const title = firstText(note.title, note.fileName, `note-${note.id}`);
  const folderPath = resolveFolderPath(note.from_folder, folders);
  return {
    sourceType: 'note',
    id: note.id,
    title,
    markdown,
    plainText: firstText(note.text, markdownToPlainText(markdown)),
    tags: normalizeTags(note.tags),
    folderPath,
    updatedAt: note.updated_at || note.lastModified,
    contentHash: await hashText(markdown),
    raw: note,
  };
};

export const normalizeWiseMindDocument = async (doc: any, folders: WiseMindFolder[] = []): Promise<WiseMindSourceItem> => {
  const markdown = stripSourceMarkers(firstText(doc.content, doc.md, doc.markdown, doc.note, doc.summary));
  const title = firstText(doc.name, doc.title, `document-${doc.id}`);
  const folderPath = resolveFolderPath(doc.from_folder, folders);
  return {
    sourceType: 'document',
    id: doc.id,
    title,
    markdown,
    plainText: markdownToPlainText(markdown),
    tags: normalizeTags(doc.tags),
    folderPath,
    updatedAt: doc.updated_at || doc.lastModified,
    contentHash: await hashText(markdown),
    raw: doc,
  };
};

const hasDocumentBody = (doc: any) => Boolean(firstText(doc?.content, doc?.md, doc?.markdown, doc?.note, doc?.summary));

export const normalizeWiseMindKnowledgeDocument = async (doc: any, base: any): Promise<WiseMindSourceItem> => {
  const markdown = stripSourceMarkers(firstText(doc.content, doc.md, doc.markdown, doc.note, doc.text, doc.summary));
  const knowledgeBaseName = firstText(base?.name, `knowledge-${doc.knowledgeBaseId}`);
  const title = firstText(doc.title, `knowledge-document-${doc.id}`);
  return {
    sourceType: 'knowledge-document',
    id: doc.id,
    title,
    markdown,
    plainText: markdownToPlainText(markdown),
    tags: normalizeTags(doc.tags),
    folderPath: `Knowledge/${knowledgeBaseName}`,
    updatedAt: doc.updated_at,
    contentHash: await hashText(markdown),
    knowledgeBaseName,
    raw: doc,
  };
};

const hasKnowledgeDocumentContent = (doc: any) =>
  Boolean(firstText(doc?.content, doc?.md, doc?.markdown, doc?.note, doc?.text));

const isKnowledgeMarkdownUploadRecord = (doc: any) =>
  String(doc?.type || '').toLowerCase() === 'upload' && isMarkdownRecord(doc);

export const resolveFolderPath = (folderId: unknown, folders: WiseMindFolder[]) => {
  if (folderId === undefined || folderId === null || folderId === '') return '';
  const byId = new Map(folders.map(folder => [String(folder.id), folder]));
  const names: string[] = [];
  let current = byId.get(String(folderId));
  const seen = new Set<string>();
  while (current && !seen.has(String(current.id))) {
    seen.add(String(current.id));
    names.unshift(current.name);
    current = current.from_folder ? byId.get(String(current.from_folder)) : undefined;
  }
  return names.join('/');
};

export const isMarkdownRecord = (record: any) => {
  const inputValues = [record?.type, record?.fileType, record?.file_type, record?.fileExt, record?.file_ext];
  const hasInputContent = inputValues.some(value => String(value || '').trim().toLowerCase() === 'input')
    && firstText(record?.content, record?.md, record?.markdown, record?.note, record?.text);
  if (hasInputContent) return true;

  const values = [
    record?.type,
    record?.fileType,
    record?.file_type,
    record?.fileExt,
    record?.file_ext,
    record?.ext,
    record?.extension,
    record?.name,
    record?.title,
    record?.fileName,
    record?.filename,
    record?.filePath,
    record?.path,
    record?.md,
    record?.content,
  ];

  return values.some(value => {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'md' || normalized === '.md' || normalized === 'markdown' || normalized.endsWith('.md');
  });
};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
};
