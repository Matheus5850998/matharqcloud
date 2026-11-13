'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownToLine,
  Eye,
  File,
  FileArchive,
  FileImage,
  FileStack,
  FileText,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  formatFileSize,
  getFileKind,
  MAX_FILE_SIZE,
  sanitizeStorageFileName,
  STORAGE_BUCKET,
  type FileRecord,
} from '@/lib/files';
import { FileViewer } from './FileViewer';

type FileManagerProps = {
  initialFiles: FileRecord[];
  userId: string;
};

function FileIcon({ file }: { file: FileRecord }) {
  const kind = getFileKind(file);
  if (kind === 'pdf') return <FileText size={19} />;
  if (kind === 'pptx') return <FileArchive size={19} />;
  if (kind === 'docx') return <FileText size={19} />;
  if (kind === 'xlsx') return <FileStack size={19} />;
  if (kind === 'image') return <FileImage size={19} />;
  return <File size={19} />;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(value));
}

export function FileManager({ initialFiles, userId }: FileManagerProps) {
  const [files, setFiles] = useState(initialFiles);
  const [search, setSearch] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [viewingFile, setViewingFile] = useState<FileRecord | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visibleFiles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return query ? files.filter((file) => file.name.toLocaleLowerCase('pt-BR').includes(query)) : files;
  }, [files, search]);

  async function uploadFiles(selectedFiles: FileList | File[]) {
    const items = Array.from(selectedFiles);
    if (!items.length) return;

    setErrorMessage('');
    setStatusMessage('');
    setIsUploading(true);
    const supabase = createClient();
    let uploadedCount = 0;

    try {
      for (const file of items) {
        if (file.size < 1 || file.size > MAX_FILE_SIZE) {
          throw new Error(`“${file.name}” deve ter entre 1 byte e 50 MB.`);
        }
        if (file.name.length > 255) {
          throw new Error('O nome de cada arquivo deve ter no máximo 255 caracteres.');
        }

        const safeName = sanitizeStorageFileName(file.name);
        const storagePath = `${userId}/${crypto.randomUUID()}-${safeName}`;
        const mimeType = file.type || 'application/octet-stream';

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, file, { contentType: mimeType, upsert: false });
        if (uploadError) {
          throw new Error(`Falha ao enviar “${file.name}”: ${uploadError.message}`);
        }

        const { data: record, error: insertError } = await supabase
          .from('files')
          .insert({
            owner_id: userId,
            storage_path: storagePath,
            name: file.name,
            mime_type: mimeType,
            size_bytes: file.size,
          })
          .select('id, name, mime_type, size_bytes, storage_path, created_at')
          .single();

        if (insertError) {
          const { error: cleanupError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([storagePath]);
          if (cleanupError) {
            throw new Error(`Falha ao salvar os dados de “${file.name}” e limpar o envio: ${cleanupError.message}`);
          }
          throw new Error(`Falha ao registrar “${file.name}”: ${insertError.message}`);
        }

        setFiles((current) => [record, ...current]);
        uploadedCount += 1;
      }

      setStatusMessage(
        uploadedCount === 1 ? 'Arquivo enviado com sucesso.' : `${uploadedCount} arquivos enviados com sucesso.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível enviar os arquivos.');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function downloadFile(file: FileRecord) {
    setErrorMessage('');
    try {
      const response = await fetch(`/api/files/${file.id}/signed-url?download=1`, { cache: 'no-store' });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        throw new Error(result.error || 'Não foi possível gerar o link de download.');
      }
      const link = document.createElement('a');
      link.href = result.url;
      link.download = file.name;
      link.rel = 'noopener noreferrer';
      link.target = '_blank';
      link.click();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível baixar o arquivo.');
    }
  }

  async function deleteFile(file: FileRecord) {
    if (!window.confirm(`Excluir “${file.name}” permanentemente?`)) return;
    setErrorMessage('');
    setStatusMessage('');

    try {
      const response = await fetch(`/api/files/${file.id}`, {
        method: 'DELETE',
        cache: 'no-store',
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível excluir o arquivo.');
      }
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setStatusMessage('Arquivo excluído.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível excluir o arquivo.');
    }
  }

  return (
    <>
      <section className="library-section" id="library">
        <div className="library-heading">
          <div>
            <div className="section-kicker"><span className="section-kicker-line" /> BIBLIOTECA</div>
            <h2>Seus arquivos<span className="hello-period">.</span></h2>
          </div>
          <button className="add-file-button" onClick={() => inputRef.current?.click()} type="button">
            <Plus size={16} />
            Adicionar arquivo
          </button>
          <input
            ref={inputRef}
            accept="*/*"
            className="visually-hidden"
            multiple
            onChange={(event) => {
              if (event.target.files) void uploadFiles(event.target.files);
            }}
            type="file"
          />
        </div>

        <div
          className={`upload-zone${isDragging ? ' upload-zone-active' : ''}${isUploading ? ' upload-zone-busy' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            void uploadFiles(event.dataTransfer.files);
          }}
        >
          <div className="upload-icon-wrap">
            {isUploading ? <LoaderCircle className="spin" size={20} /> : <UploadCloud size={20} />}
          </div>
          <div className="upload-copy">
            <strong>{isUploading ? 'Enviando seus arquivos…' : 'Traga seus arquivos para cá'}</strong>
            <span>Arraste e solte ou <button onClick={() => inputRef.current?.click()} type="button">escolha no dispositivo</button></span>
          </div>
          <span className="upload-limit">PDF · PPTX · DOCX · XLSX · IMAGENS · ATÉ 50 MB</span>
        </div>

        <AnimatePresence>
          {(statusMessage || errorMessage) && (
            <motion.div
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              className={`file-message${errorMessage ? ' file-message-error' : ''}`}
              exit={{ opacity: 0, height: 0 }}
              initial={{ opacity: 0, height: 0, y: -4 }}
              role={errorMessage ? 'alert' : 'status'}
            >
              <span>{errorMessage || statusMessage}</span>
              <button
                aria-label="Fechar mensagem"
                className="message-close"
                onClick={() => { setErrorMessage(''); setStatusMessage(''); }}
                type="button"
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="files-toolbar">
          <div className="files-title-group">
            <span className="files-title">ARQUIVOS</span>
            <span className="files-total">{files.length.toString().padStart(2, '0')}</span>
          </div>
          <label className="search-field">
            <Search size={15} />
            <span className="visually-hidden">Buscar arquivos</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar na biblioteca"
              type="search"
              value={search}
            />
            {search && (
              <button aria-label="Limpar busca" onClick={() => setSearch('')} type="button"><X size={13} /></button>
            )}
          </label>
        </div>

        <div className="file-list">
          <div className="file-list-header">
            <span>ARQUIVO</span>
            <span>TIPO</span>
            <span>TAMANHO</span>
            <span>ADICIONADO</span>
            <span aria-label="Ações" />
          </div>
          {visibleFiles.length ? (
            visibleFiles.map((file, index) => (
              <motion.article
                animate={{ opacity: 1, y: 0 }}
                className="file-row"
                initial={{ opacity: 0, y: 8 }}
                key={file.id}
                transition={{ duration: 0.28, delay: Math.min(index * 0.035, 0.25) }}
              >
                <div className="file-name-cell">
                  <div className={`file-type-icon file-type-${getFileKind(file)}`}><FileIcon file={file} /></div>
                  <div className="file-name-copy">
                    <strong title={file.name}>{file.name}</strong>
                    <span><ShieldCheck size={11} /> Privado</span>
                  </div>
                </div>
                <span className="file-type-label">{file.name.split('.').pop()?.toUpperCase() || 'ARQUIVO'}</span>
                <span className="file-size">{formatFileSize(file.size_bytes)}</span>
                <span className="file-date">{formatDate(file.created_at)}</span>
                <div className="file-actions">
                  {getFileKind(file) !== 'other' && (
                    <button
                      aria-label={`Visualizar ${file.name}`}
                      className="file-preview-action"
                      onClick={() => setViewingFile(file)}
                      title="Visualizar"
                      type="button"
                    >
                      <Eye aria-hidden="true" size={14} />
                      <span>Abrir</span>
                    </button>
                  )}
                  <button
                    aria-label={`Baixar ${file.name}`}
                    className="icon-button file-action"
                    onClick={() => void downloadFile(file)}
                    title="Baixar"
                    type="button"
                  >
                    <ArrowDownToLine size={15} />
                  </button>
                  <button
                    aria-label={`Excluir ${file.name}`}
                    className="icon-button file-action file-action-delete"
                    onClick={() => void deleteFile(file)}
                    title="Excluir"
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </motion.article>
            ))
          ) : (
            <div className="empty-library">
              <div className="empty-library-icon"><FileStack size={21} /></div>
              <strong>{search ? 'Nenhum arquivo encontrado.' : 'Sua biblioteca começa aqui.'}</strong>
              <span>{search ? 'Tente outra busca.' : 'Envie um arquivo acima para começar a montar seu espaço.'}</span>
            </div>
          )}
        </div>

        <div className="library-privacy-note">
          <ShieldCheck size={14} />
          <span>Arquivos privados · prévia: PDF, PPTX, DOCX, XLSX e imagens · demais formatos: download.</span>
          <span className="privacy-lock">ACESSO RESTRITO</span>
        </div>
      </section>

      <AnimatePresence>
        {viewingFile && (
          <FileViewer file={viewingFile} onClose={() => setViewingFile(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
