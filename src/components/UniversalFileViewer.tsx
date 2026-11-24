'use client';

import * as XLSX from '@e965/xlsx';
import { AnimatePresence, motion } from 'framer-motion';
import mammoth from 'mammoth';
import { Download, Maximize2, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FileMetadata } from '@/lib/models';
import { createFirebaseSupabaseClient } from '@/lib/supabase/firebase';
import { getFirebase } from '@/lib/firebase';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

type Props = {
  file: FileMetadata | null;
  files: FileMetadata[];
  onClose: () => void;
  onChange: (file: FileMetadata) => void;
};

export function UniversalFileViewer({ file, files, onClose, onChange }: Props) {
  const { auth } = getFirebase();
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [docHtml, setDocHtml] = useState('');
  const [sheetRows, setSheetRows] = useState<unknown[][]>([]);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState('');
  const pptxContainerRef = useRef<HTMLDivElement>(null);
  const pptxViewerRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    if (!file) return;
    let active = true;
    let objectUrl = '';
    pptxViewerRef.current?.destroy();
    pptxViewerRef.current = null;
    setError('');
    setText('');
    setDocHtml('');
    setSheetRows([]);
    setPage(1);
    setZoom(1);
    setRotation(0);

    async function load() {
      try {
        const supabase = await createFirebaseSupabaseClient(auth);
        const { data, error: signError } = await supabase.storage
          .from('personal-files')
          .createSignedUrl(file!.storagePath, 300);
        if (signError || !data?.signedUrl) throw signError || new Error('Não foi possível abrir o arquivo.');
        active && setUrl(data.signedUrl);

        const extension = file!.name.split('.').pop()?.toLowerCase();
        const textTypes = ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css', 'csv'];
        if (textTypes.includes(extension || '')) {
          const response = await fetch(data.signedUrl);
          const value = await response.text();
          if (extension === 'csv') {
            const workbook = XLSX.read(value, { type: 'string' });
            setSheetRows(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }));
          } else {
            active && setText(value);
          }
        }
        if (extension === 'docx') {
          const response = await fetch(data.signedUrl);
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
          active && setDocHtml(result.value);
        }
        if (extension === 'xlsx') {
          const response = await fetch(data.signedUrl);
          const dataBuffer = await response.arrayBuffer();
          const workbook = XLSX.read(dataBuffer, { type: 'array' });
          setSheetRows(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }));
        }
        if (extension === 'pptx' && pptxContainerRef.current) {
          const response = await fetch(data.signedUrl);
          const buffer = await response.arrayBuffer();
          const { PptxViewer, RECOMMENDED_ZIP_LIMITS } = await import('@aiden0z/pptx-renderer');
          if (!active) return;
          const viewer = await PptxViewer.open(buffer, pptxContainerRef.current, {
            renderMode: 'slide',
            externalMedia: 'block',
            zipLimits: RECOMMENDED_ZIP_LIMITS,
            lazySlides: true,
            lazyMedia: true,
            pdfjs: false,
          });
          pptxViewerRef.current = viewer;
        }
      } catch (loadError) {
        active && setError(loadError instanceof Error ? loadError.message : 'Não foi possível abrir o arquivo.');
      }
    }
    load();
    return () => {
      active = false;
      pptxViewerRef.current?.destroy();
      pptxViewerRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [auth, file]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
      if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(2, value + 0.1));
      if (event.key === '-') setZoom((value) => Math.max(0.5, value - 0.1));
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  const currentIndex = useMemo(() => file ? files.findIndex((item) => item.id === file.id) : -1, [file, files]);

  function move(direction: number) {
    if (!file) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < files.length) onChange(files[nextIndex]);
  }

  async function download() {
    if (!url) return;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file?.name || 'arquivo';
    anchor.rel = 'noopener';
    anchor.click();
  }

  async function toggleFullscreen() {
    const element = document.querySelector('.universal-viewer');
    if (!document.fullscreenElement) await element?.requestFullscreen();
    else await document.exitFullscreen();
  }

  if (!file) return null;
  const extension = file.name.split('.').pop()?.toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension || '');
  const isAudio = ['mp3', 'wav', 'ogg'].includes(extension || '');
  const isVideo = ['mp4', 'webm', 'mov'].includes(extension || '');
  const isText = ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css'].includes(extension || '');

  return (
    <AnimatePresence>
      <motion.div className="universal-viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <header>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Fechar"><X size={19} /></button>
          <div><strong>{file.name}</strong><span>{Math.ceil(file.fileSize / 1024)} KB</span></div>
          <nav>
            <button onClick={() => move(-1)} disabled={currentIndex <= 0} type="button">Anterior</button>
            <button onClick={() => move(1)} disabled={currentIndex >= files.length - 1} type="button">Próximo</button>
            <button onClick={download} type="button"><Download size={16} /> Baixar</button>
            <button onClick={toggleFullscreen} type="button"><Maximize2 size={16} /> Tela cheia</button>
          </nav>
        </header>
        <main>
          {error && <p className="viewer-error">{error}</p>}
          {extension === 'pdf' && url && (
            <>
              <div className="viewer-tools">
                <button onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} type="button"><ZoomOut size={16} /></button>
                <span>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((value) => Math.min(2, value + 0.1))} type="button"><ZoomIn size={16} /></button>
                <button onClick={() => setRotation((value) => (value + 90) % 360)} type="button"><RotateCw size={16} /></button>
              </div>
              <Document file={url} onLoadSuccess={({ numPages }) => setPages(numPages)} loading="Carregando PDF…">
                <Page pageNumber={page} scale={zoom} rotate={rotation} />
              </Document>
              <div className="viewer-page-control">
                <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">Anterior</button>
                <span>{page} / {pages}</span>
                <button disabled={page >= pages} onClick={() => setPage((value) => value + 1)} type="button">Próxima</button>
              </div>
            </>
          )}
          {isImage && url && <img className="viewer-image" style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }} src={url} alt={file.name} />}
          {isText && <pre className="viewer-code"><code>{text}</code></pre>}
          {extension === 'docx' && <article className="viewer-docx" dangerouslySetInnerHTML={{ __html: docHtml }} />}
          {(extension === 'xlsx' || extension === 'csv') && sheetRows.length > 0 && (
            <div className="viewer-table">
              <table><tbody>{sheetRows.slice(0, 500).map((row, rowIndex) => (
                <tr key={rowIndex}>{row.slice(0, 20).map((cell, cellIndex) => <td key={cellIndex}>{String(cell ?? '')}</td>)}</tr>
              ))}</tbody></table>
            </div>
          )}
          {isAudio && url && <audio className="viewer-media" controls src={url} />}
          {isVideo && url && <video className="viewer-media" controls src={url} />}
          {(extension === 'pptx' || extension === 'ppt') && (
            extension === 'pptx'
              ? <div className="pptx-viewer" ref={pptxContainerRef} />
              : <div className="viewer-fallback"><strong>Formato legado não suportado</strong><span>Converta o .ppt para .pptx para apresentação web.</span></div>
          )}
          {!['pdf', 'docx', 'xlsx', 'csv'].includes(extension || '') && !isImage && !isText && !isAudio && !isVideo && (
            <div className="viewer-fallback"><strong>Prévia não disponível</strong><span>Use o botão de download para abrir este formato.</span></div>
          )}
        </main>
      </motion.div>
    </AnimatePresence>
  );
}
