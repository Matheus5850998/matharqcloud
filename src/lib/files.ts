export const STORAGE_BUCKET = 'personal-files';
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export type FileRecord = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
};

export type FileKind = 'pdf' | 'pptx' | 'docx' | 'xlsx' | 'image' | 'other';

export function sanitizeStorageFileName(name: string) {
  const safeName = name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return safeName || 'arquivo';
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function getFileKind(file: Pick<FileRecord, 'name' | 'mime_type'>): FileKind {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const mimeType = file.mime_type.toLowerCase();
  if (extension === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (
    extension === 'pptx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return 'pptx';
  }
  if (
    extension === 'docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (
    extension === 'xlsx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'xlsx';
  }
  if (
    ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension || '') ||
    ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType)
  ) {
    return 'image';
  }
  return 'other';
}
