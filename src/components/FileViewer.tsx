'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Expand,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getFileKind, type FileRecord, type FileKind } from '@/lib/files';

type FileViewerProps = {
  file: FileRecord;
  onClose: () => void;
};

type PdfModule = typeof import('react-pdf');
type SpreadsheetSheet = { name: string; rows: string[][] };

const OFFICE_PREVIEW_LIMIT = 20 * 1024 * 1024;
const SPREADSHEET_ROW_LIMIT = 500;
const SPREADSHEET_COLUMN_LIMIT = 20;

function getCellText(value: unknown) {
  if (value instanceof Date) return value.toLocaleString('pt-BR');
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value && typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text;
  }
  return '';
}

function getColumnLabel(index: number) {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function FileViewer({ file, onClose }: FileViewerProps) {
  const [fileUrl, setFileUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pdfModule, setPdfModule] = useState<PdfModule | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [documentText, setDocumentText] = useState('');
  const [sheets, setSheets] = useState<SpreadsheetSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const pptxViewport = useRef<HTMLDivElement>(null);
  const viewerDialog = useRef<HTMLDivElement>(null);
  const fileKind: FileKind = getFileKind(file);
  const isPdf = fileKind === 'pdf';
  const isPptx = fileKind === 'pptx';
  const isDocx = fileKind === 'docx';
  const isXlsx = fileKind === 'xlsx';
  const isImage = fileKind === 'image';

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const viewport = pptxViewport.current;

    async function loadFile() {
      try {
        const response = await fetch(`/api/files/${file.id}/signed-url`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json() as { url?: string; error?: string };
        if (!response.ok || !result.url) {
          throw new Error(result.error || 'Não foi possível abrir o arquivo.');
        }
        if (!active) return;
        setFileUrl(result.url);

        if (isPdf) {
          const pdf = await import('react-pdf');
          if (!pdf.Document || !pdf.Page) {
            throw new Error('O leitor de PDF não foi carregado corretamente. Atualize a página e tente novamente.');
          }
          pdf.pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url,
          ).toString();
          if (active) setPdfModule(pdf);
          return;
        }

        if (isImage) {
          return;
        }

        if (file.size_bytes > OFFICE_PREVIEW_LIMIT) {
          throw new Error('A pré-visualização de documentos do Office está limitada a 20 MB. Baixe o arquivo para abrir completo.');
        }

        const fileResponse = await fetch(result.url, { signal: controller.signal });
        if (!fileResponse.ok) {
          throw new Error('O armazenamento não conseguiu entregar este arquivo.');
        }
        const buffer = await fileResponse.arrayBuffer();
        if (buffer.byteLength > OFFICE_PREVIEW_LIMIT) {
          throw new Error('A pré-visualização de documentos do Office está limitada a 20 MB. Baixe o arquivo para abrir completo.');
        }

        if (isPptx) {
          const renderer = await import('@aiden0z/pptx-renderer');
          if (!active || !viewport) return;
          await renderer.PptxViewer.open(buffer, viewport, {
            zipLimits: renderer.RECOMMENDED_ZIP_LIMITS,
            listOptions: { windowed: true, batchSize: 4, initialSlides: 4 },
            signal: controller.signal,
          });
        } else if (isDocx) {
          const mammoth = await import('mammoth');
          const result = await mammoth.extractRawText({ arrayBuffer: buffer });
          if (active) setDocumentText(result.value);
        } else if (isXlsx) {
          const spreadsheet = await import('@e965/xlsx');
          const workbook = spreadsheet.read(buffer, {
            type: 'array',
            dense: true,
            cellDates: true,
            sheetRows: SPREADSHEET_ROW_LIMIT + 1,
          });
          const parsedSheets = workbook.SheetNames.map((name) => {
            const worksheet = workbook.Sheets[name];
            const rows = spreadsheet.utils.sheet_to_json<unknown[]>(worksheet, {
              header: 1,
              raw: false,
              defval: '',
              blankrows: false,
            });
            return {
              name,
              rows: rows.slice(0, SPREADSHEET_ROW_LIMIT).map((row) =>
                row.slice(0, SPREADSHEET_COLUMN_LIMIT).map(getCellText),
              ),
            };
          });
          if (active) {
            setSheets(parsedSheets);
            setActiveSheet(0);
          }
        }

        if (active) setIsLoading(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : 'Não foi possível renderizar este arquivo.');
        setIsLoading(false);
      }
    }

    void loadFile();
    return () => {
      active = false;
      controller.abort();
      viewport?.replaceChildren();
    };
  }, [file.id, file.size_bytes, isDocx, isImage, isPdf, isPptx, isXlsx]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (document.fullscreenElement) {
          void document.exitFullscreen();
          return;
        }
        onClose();
      }
      if (isPdf && event.key === 'ArrowLeft') setPageNumber((page) => Math.max(1, page - 1));
      if (isPdf && event.key === 'ArrowRight') setPageNumber((page) => Math.min(pageCount || page, page + 1));
      if (isPptx && event.key === 'ArrowLeft') moveSlide(-1);
      if (isPptx && event.key === 'ArrowRight') moveSlide(1);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPdf, isPptx, onClose, pageCount]);

  useEffect(() => {
    function syncFullscreenState() {
      setIsFullscreen(document.fullscreenElement === viewerDialog.current);
    }
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  async function downloadFile() {
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

  async function toggleFullscreen() {
    if (!viewerDialog.current) return;
    if (!document.fullscreenElement) {
      await viewerDialog.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  function moveSlide(direction: -1 | 1) {
    const viewport = pptxViewport.current;
    if (!viewport) return;
    viewport.scrollBy({
      top: direction * Math.max(viewport.clientHeight * 0.82, 360),
      behavior: 'smooth',
    });
  }

  const PdfDocument = pdfModule?.Document;
  const PdfPage = pdfModule?.Page;
  const activeRows = sheets[activeSheet]?.rows ?? [];
  const activeColumnCount = activeRows.reduce((max, row) => Math.max(max, row.length), 0);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="viewer-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      transition={{ duration: 0.2 }}
    >
      <motion.section
        animate={{ opacity: 1, y: 0, scale: 1 }}
        aria-label={`Visualizador de ${file.name}`}
        aria-modal="true"
        className={`viewer-dialog${isFullscreen ? ' viewer-dialog-fullscreen' : ''}`}
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        ref={viewerDialog}
        role="dialog"
        transition={{ duration: 0.3, ease: [0.2, 0.75, 0.2, 1] }}
      >
        <header className="viewer-header">
          <div className="viewer-file-heading">
            <div className={`file-type-icon file-type-${fileKind}`}>
              {isPdf || isDocx
                ? <FileText size={17} />
                : isXlsx
                  ? <FileSpreadsheet size={17} />
                  : isImage
                    ? <FileImage size={17} />
                    : <FileArchive size={17} />}
            </div>
            <div>
              <strong title={file.name}>{file.name}</strong>
              <span>
                {isPdf ? 'LEITOR DE PDF'
                  : isPptx ? 'MODO APRESENTAÇÃO'
                    : isDocx ? 'DOCUMENTO WORD'
                      : isXlsx ? 'PLANILHA EXCEL'
                        : 'VISUALIZADOR DE IMAGEM'} <i /> PRIVADO
              </span>
            </div>
          </div>
          <div className="viewer-actions">
            <button className="viewer-header-action" onClick={() => void downloadFile()} type="button">
              <ArrowDown size={15} /> <span>BAIXAR</span>
            </button>
            <button
              aria-label={isFullscreen ? 'Sair da apresentação em tela cheia' : (isPdf || isPptx ? 'Apresentar' : 'Tela cheia')}
              className="viewer-header-action"
              onClick={() => void toggleFullscreen()}
              type="button"
            >
              <Expand size={15} /> <span>{isPdf || isPptx ? 'APRESENTAR' : 'TELA CHEIA'}</span>
            </button>
            <button aria-label="Fechar visualizador" className="viewer-close" onClick={onClose} type="button">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className={`viewer-content${isPdf ? ' viewer-content-pdf' : isPptx ? ' viewer-content-pptx' : ' viewer-content-office'}`}>
          {errorMessage ? (
            <div className="viewer-state viewer-state-error">
              <div className="viewer-state-icon"><X size={20} /></div>
              <strong>Não foi possível abrir este arquivo.</strong>
              <span>{errorMessage}</span>
            </div>
          ) : isPdf ? (
            !fileUrl || !PdfDocument || !PdfPage ? (
              <div className="viewer-state">
                <LoaderCircle className="spin" size={24} />
                <span>Preparando o leitor…</span>
              </div>
            ) : (
              <div className="pdf-page-wrap">
                <PdfDocument
                  file={{ url: fileUrl }}
                  loading={<div className="viewer-state"><LoaderCircle className="spin" size={24} /><span>Carregando documento…</span></div>}
                  onLoadError={(error) => setErrorMessage(error.message)}
                  onLoadSuccess={({ numPages }) => {
                    setPageCount(numPages);
                    setIsLoading(false);
                  }}
                  onSourceError={(error) => setErrorMessage(error.message)}
                >
                  <PdfPage
                    className="pdf-page"
                    devicePixelRatio={typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2)}
                    error={<div className="viewer-state viewer-state-error">Esta página não pôde ser renderizada.</div>}
                    loading={<div className="viewer-state"><LoaderCircle className="spin" size={24} /><span>Renderizando página…</span></div>}
                    pageNumber={pageNumber}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    width={Math.min(820, typeof window === 'undefined' ? 820 : window.innerWidth - 80)}
                  />
                </PdfDocument>
              </div>
            )
          ) : isPptx ? (
            <div className="pptx-viewer-shell">
              {isLoading && !errorMessage && (
                <div className="viewer-loading-overlay"><LoaderCircle className="spin" size={24} /><span>Preparando apresentação…</span></div>
              )}
              <div className="pptx-canvas" ref={pptxViewport} />
            </div>
          ) : isImage ? (
            <div className="image-preview-wrap">
              {!fileUrl ? (
                <div className="viewer-state"><LoaderCircle className="spin" size={24} /><span>Carregando imagem…</span></div>
              ) : (
                <>
                  {isLoading && (
                    <div className="viewer-loading-overlay">
                      <LoaderCircle className="spin" size={24} /><span>Carregando imagem…</span>
                    </div>
                  )}
                  <Image
                    alt={file.name}
                    className="image-preview"
                    fill
                    onError={() => setErrorMessage('Não foi possível carregar esta imagem.')}
                    onLoad={() => setIsLoading(false)}
                    sizes="(max-width: 800px) 100vw, 90vw"
                    src={fileUrl}
                    unoptimized
                  />
                </>
              )}
            </div>
          ) : isDocx ? (
            <article className="document-text-preview">
              {isLoading ? (
                <div className="viewer-state"><LoaderCircle className="spin" size={24} /><span>Lendo documento…</span></div>
              ) : documentText.trim() ? (
                <pre>{documentText}</pre>
              ) : (
                <div className="viewer-state"><span>Este documento não contém texto para pré-visualizar.</span></div>
              )}
            </article>
          ) : (
            <div className="spreadsheet-preview">
              {isLoading ? (
                <div className="viewer-state"><LoaderCircle className="spin" size={24} /><span>Lendo planilha…</span></div>
              ) : sheets.length ? (
                <>
                  {sheets.length > 1 && (
                    <div aria-label="Abas da planilha" className="spreadsheet-tabs">
                      {sheets.map((sheet, index) => (
                        <button
                          aria-pressed={index === activeSheet}
                          className={index === activeSheet ? 'spreadsheet-tab spreadsheet-tab-active' : 'spreadsheet-tab'}
                          key={sheet.name}
                          onClick={() => setActiveSheet(index)}
                          type="button"
                        >
                          {sheet.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="spreadsheet-table-wrap">
                    <table className="spreadsheet-table">
                      <thead>
                        <tr>
                          <th scope="col">#</th>
                          {Array.from(
                            { length: activeColumnCount },
                            (_, index) => <th key={index} scope="col">{getColumnLabel(index)}</th>,
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {activeRows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            <th scope="row">{rowIndex + 1}</th>
                            {Array.from(
                              { length: activeColumnCount },
                              (_, columnIndex) => <td key={columnIndex}>{row[columnIndex] || ''}</td>,
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <span className="spreadsheet-limit-note">Prévia limitada às primeiras 500 linhas e 20 colunas.</span>
                </>
              ) : (
                <div className="viewer-state"><span>Esta planilha não contém dados para pré-visualizar.</span></div>
              )}
            </div>
          )}
        </div>

        <footer className="viewer-footer">
          {isPdf ? (
            <>
              <button
                aria-label="Página anterior"
                className="viewer-page-button"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
                type="button"
              >
                <ArrowLeft size={15} /> Anterior
              </button>
              <span className="viewer-page-count">
                <strong>{pageNumber.toString().padStart(2, '0')}</strong>
                <i />
                {pageCount.toString().padStart(2, '0')}
              </span>
              <button
                aria-label="Próxima página"
                className="viewer-page-button"
                disabled={!pageCount || pageNumber >= pageCount}
                onClick={() => setPageNumber((page) => Math.min(pageCount, page + 1))}
                type="button"
              >
                Próxima <ArrowRight size={15} />
              </button>
            </>
          ) : isPptx ? (
            <>
              <button className="viewer-page-button" onClick={() => moveSlide(-1)} type="button">
                <ArrowLeft size={15} /> Anterior
              </button>
              <span className="viewer-page-count"><i /> APRESENTAÇÃO</span>
              <button className="viewer-page-button" onClick={() => moveSlide(1)} type="button">
                Próximo <ArrowRight size={15} />
              </button>
            </>
          ) : isXlsx ? (
            <span className="viewer-page-count">
              {sheets.length ? `${sheets[activeSheet]?.name} · ${sheets.length} ABA(S)` : 'PLANILHA'}
            </span>
          ) : (
            <span className="viewer-page-count">
              {isDocx ? 'PRÉVIA DE TEXTO' : 'IMAGEM'}
            </span>
          )}
        </footer>
      </motion.section>
    </motion.div>
  );
}
