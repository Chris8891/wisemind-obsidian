export const hashText = async (text: string) => {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const markdownToPlainText = (markdown: string) =>
  markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_\-~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string') return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const normalizeTags = (value: unknown): string[] => {
  const parsed = typeof value === 'string' ? safeJsonParse<unknown>(value, value) : value;
  if (Array.isArray(parsed)) {
    return Array.from(
      new Set(
        parsed
          .map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object' && 'text' in item) return String((item as any).text);
            if (item && typeof item === 'object' && 'name' in item) return String((item as any).name);
            return '';
          })
          .map(item => item.replace(/^#/, '').trim())
          .filter(Boolean),
      ),
    );
  }
  if (typeof parsed === 'string') {
    return parsed
      .split(/[,，\s]+/)
      .map(item => item.replace(/^#/, '').trim())
      .filter(Boolean);
  }
  return [];
};

export const sanitizeFileName = (value: string, fallback: string) => {
  const text = (value || fallback).replace(/[\\/:"*?<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return text || fallback;
};

export const quoteYamlString = (value: string) => JSON.stringify(value ?? '');
