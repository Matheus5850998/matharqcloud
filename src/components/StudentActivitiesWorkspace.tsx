'use client';

import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowUpRight, CalendarClock, CheckCircle2, Clock3, Code2, FileText, GraduationCap, Maximize2, Minimize2, Send, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CorrectionPreview } from '@/components/CorrectionPreview';
import { getFirebase } from '@/lib/firebase';
import type { Submission, Task } from '@/lib/models';

const MAX_RESPONSE_LENGTH = 50000;

function formatJavaCode(source: string) {
  let indentation = 0;
  let inBlockComment = false;
  let inTextBlock = false;

  return source.replace(/\r\n?/g, '\n').split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return '';

    const lineIndentation = inTextBlock || inBlockComment
      ? line.match(/^[\t ]*/)?.[0] || ''
      : '  '.repeat(Math.max(0, indentation - (trimmed.match(/^}+/)?.[0].length || 0)));
    let braceChange = 0;
    let quote: '"' | "'" | null = null;
    let escaped = false;

    for (let index = 0; index < trimmed.length; index += 1) {
      const character = trimmed[index];
      const next = trimmed[index + 1];

      if (inBlockComment) {
        if (character === '*' && next === '/') {
          inBlockComment = false;
          index += 1;
        }
        continue;
      }
      if (inTextBlock) {
        if (trimmed.slice(index, index + 3) === '"""') {
          inTextBlock = false;
          index += 2;
        }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '/' && next === '/') break;
      if (character === '/' && next === '*') {
        inBlockComment = true;
        index += 1;
        continue;
      }
      if (trimmed.slice(index, index + 3) === '"""') {
        inTextBlock = true;
        index += 2;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === '{') braceChange += 1;
      if (character === '}') braceChange -= 1;
    }

    indentation = Math.max(0, indentation + braceChange);
    return `${lineIndentation}${trimmed}`;
  }).join('\n');
}

function timestampMillis(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  return 0;
}

function dueLabel(dueAt: string | null) {
  return dueAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dueAt))
    : 'Sem prazo';
}

function taskStatus(task: Task, submission: Submission | undefined, currentTime: number) {
  if (submission?.status === 'Aprovado') return { label: 'Concluída', tone: 'complete' };
  if (submission?.status === 'Refazer') return { label: 'Precisa de ajuste', tone: 'revision' };
  if (submission) return { label: 'Em correção', tone: 'review' };
  if (task.dueAt && new Date(task.dueAt).getTime() < currentTime) return { label: 'Prazo vencido', tone: 'overdue' };
  return { label: 'Pendente', tone: 'pending' };
}

export function StudentActivitiesWorkspace({ studentId, grade }: { studentId: string; grade: string | null }) {
  const router = useRouter();
  const { db } = getFirebase();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissionsByTask, setSubmissionsByTask] = useState<Record<string, Submission[]>>({});
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [response, setResponse] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const responseEditor = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => onSnapshot(
    query(collection(db, 'tasks'), where('assigneeIds', 'array-contains', studentId)),
    (snapshot) => setTasks(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Task))),
    () => setError('Não foi possível carregar as atividades.'),
  ), [db, studentId]);

  useEffect(() => {
    if (!tasks.length) {
      return;
    }
    const unsubscribers = tasks.map((task) => onSnapshot(
      query(collection(db, 'tasks', task.id, 'submissions'), where('studentId', '==', studentId)),
      (snapshot) => setSubmissionsByTask((current) => ({
        ...current,
        [task.id]: snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Submission)),
      })),
      () => setError('Não foi possível carregar o histórico de entregas.'),
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [db, studentId, tasks]);

  const orderedTasks = useMemo(() => [...tasks].sort((a, b) => {
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aDue - bDue;
  }), [tasks]);

  const latestSubmissionByTask = useMemo(() => {
    const entries: Record<string, Submission | undefined> = {};
    for (const [taskId, attempts] of Object.entries(submissionsByTask)) {
      entries[taskId] = [...attempts].sort((a, b) => timestampMillis(b.submittedAt) - timestampMillis(a.submittedAt))[0];
    }
    return entries;
  }, [submissionsByTask]);

  const dueTasks = orderedTasks.filter((task) => {
    const latest = latestSubmissionByTask[task.id];
    return task.dueAt && latest?.status !== 'Aprovado';
  });
  const futureDueTasks = dueTasks.filter((task) => new Date(task.dueAt!).getTime() >= currentTime);
  const nearestTask = futureDueTasks[0]
    || [...dueTasks].sort((a, b) => new Date(b.dueAt!).getTime() - new Date(a.dueAt!).getTime())[0];
  const openCount = orderedTasks.filter((task) => latestSubmissionByTask[task.id]?.status !== 'Aprovado').length;
  const canSubmit = selectedTask
    ? !latestSubmissionByTask[selectedTask.id] || latestSubmissionByTask[selectedTask.id]?.status === 'Refazer'
    : false;

  function openTask(task: Task) {
    setSelectedTask(task);
    setResponse('');
    setLanguage(task.language || 'javascript');
    setExpanded(false);
    setError('');
  }

  function handleCodeEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Tab' && event.key !== 'Enter') return;

    const editor = event.currentTarget;
    const { selectionStart, selectionEnd, value } = editor;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const currentLine = value.slice(lineStart, selectionStart);
    const currentIndentation = currentLine.match(/^[\t ]*/)?.[0] || '';
    const inserted = event.key === 'Tab'
      ? '  '
      : `\n${currentIndentation}${/\{\s*$/.test(currentLine.trimEnd()) ? '  ' : ''}`;

    event.preventDefault();
    const nextResponse = `${value.slice(0, selectionStart)}${inserted}${value.slice(selectionEnd)}`;
    setResponse(nextResponse);
    const cursorPosition = selectionStart + inserted.length;
    window.requestAnimationFrame(() => editor.setSelectionRange(cursorPosition, cursorPosition));
  }

  function applyJavaFormatting() {
    setResponse(formatJavaCode(response));
    window.requestAnimationFrame(() => {
      const editor = responseEditor.current;
      if (editor) editor.setSelectionRange(editor.value.length, editor.value.length);
    });
  }

  async function submitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTask || !response.trim()) {
      setError('Escreva sua resposta antes de enviar.');
      return;
    }
    if (response.length > MAX_RESPONSE_LENGTH) {
      setError('A resposta deve ter no máximo 50.000 caracteres.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const previousAttempt = latestSubmissionByTask[selectedTask.id];
      await addDoc(collection(db, 'tasks', selectedTask.id, 'submissions'), {
        taskId: selectedTask.id,
        studentId,
        teacherId: selectedTask.teacherId,
        content: response,
        editorMode: selectedTask.editorMode || 'text',
        language: selectedTask.editorMode === 'code' ? language : null,
        fileId: null,
        status: 'Em Revisão',
        gradeValue: null,
        feedback: '',
        corrections: [],
        correctAnswer: '',
        previousSubmissionId: previousAttempt?.id || null,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setResponse('');
      setError('Resposta enviada ao professor.');
      setSelectedTask(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível enviar sua resposta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="student-workspace">
      <header className="workspace-topbar">
        <button className="workspace-back" onClick={() => router.push('/dashboard')} type="button"><ArrowLeft size={17} /> Biblioteca</button>
        <div className="workspace-brand"><span className="brand-glyph">V</span> viana<span>.cloud</span></div>
        <span className="workspace-role"><GraduationCap size={15} /> Área do aluno</span>
      </header>

      <section className="student-workspace-content">
        <div className="workspace-heading">
          <div>
            <span className="eyebrow">CENTRAL DE APRENDIZAGEM · {grade || 'MINHAS TURMAS'}</span>
            <h1>Suas atividades<span>.</span></h1>
            <p>Acompanhe os prazos, envie respostas e consulte as correções do professor.</p>
          </div>
          <div className="workspace-summary">
            <span><strong>{openCount}</strong> em andamento</span>
            {nearestTask && <span className="nearest-deadline"><CalendarClock size={16} /><span>Mais próxima: <strong>{nearestTask.title}</strong><small>{dueLabel(nearestTask.dueAt)}</small></span></span>}
          </div>
        </div>

        {error && <p className="workspace-message" role="status">{error}</p>}

        <div className="student-assignment-grid">
          {orderedTasks.map((task, index) => {
            const latest = latestSubmissionByTask[task.id];
            const status = taskStatus(task, latest, currentTime);
            return (
              <motion.article className="student-assignment-card" key={task.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.035, 0.25) }}>
                <div className="assignment-card-top">
                  <span className={`assignment-status status-${status.tone}`}>{status.label}</span>
                  {task.editorMode === 'code' ? <Code2 size={18} /> : <FileText size={18} />}
                </div>
                <h2>{task.title}</h2>
                <p>{task.description || 'Atividade enviada pelo professor.'}</p>
                <div className={`assignment-deadline ${task.dueAt && new Date(task.dueAt).getTime() < currentTime && status.tone !== 'complete' ? 'is-overdue' : ''}`}>
                  <Clock3 size={15} /> {dueLabel(task.dueAt)}
                </div>
                {latest?.gradeValue !== null && latest?.gradeValue !== undefined && <div className="assignment-grade"><span>Nota</span><strong>{latest.gradeValue}<small>/10</small></strong></div>}
                <button className="assignment-open-button" onClick={() => openTask(task)} type="button">
                  {status.tone === 'revision' ? 'Revisar e reenviar' : latest ? 'Ver entrega e correção' : 'Abrir atividade'} <ArrowUpRight size={16} />
                </button>
              </motion.article>
            );
          })}
          {orderedTasks.length === 0 && <div className="workspace-empty"><CalendarClock size={25} /><strong>Nenhuma atividade por enquanto</strong><span>As atividades enviadas pelos seus professores aparecerão aqui.</span></div>}
        </div>
      </section>

      {selectedTask && (
        <div className="activity-overlay" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedTask(null);
        }}>
          <section className={`activity-detail-panel ${expanded ? 'activity-detail-panel-expanded' : ''}`} role="dialog" aria-modal="true" aria-labelledby="student-task-title">
            <div className="activity-panel-heading">
              <div><span className="eyebrow">ATIVIDADE · PRAZO {dueLabel(selectedTask.dueAt)}</span><h2 id="student-task-title">{selectedTask.title}</h2></div>
              <div className="activity-panel-actions">
                <button onClick={() => setExpanded((current) => !current)} type="button" aria-label={expanded ? 'Sair da tela cheia' : 'Expandir atividade'} title={expanded ? 'Sair da tela cheia' : 'Expandir atividade'}>
                  {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                <button onClick={() => setSelectedTask(null)} type="button" aria-label="Fechar"><X size={19} /></button>
              </div>
            </div>
            <p className="activity-instructions">{selectedTask.description || 'Sem instruções adicionais.'}</p>

            {latestSubmissionByTask[selectedTask.id] && (
              <article className="student-review-card">
                <div className="review-result-heading">
                  <strong>{latestSubmissionByTask[selectedTask.id]?.status === 'Aprovado' ? 'Atividade corrigida' : latestSubmissionByTask[selectedTask.id]?.status === 'Refazer' ? 'Correção do professor' : 'Entrega enviada'}</strong>
                  {latestSubmissionByTask[selectedTask.id]?.gradeValue !== null && latestSubmissionByTask[selectedTask.id]?.gradeValue !== undefined && <span>Nota: {latestSubmissionByTask[selectedTask.id]?.gradeValue}/10</span>}
                </div>
                <CorrectionPreview
                  content={latestSubmissionByTask[selectedTask.id]?.content || ''}
                  corrections={latestSubmissionByTask[selectedTask.id]?.corrections || []}
                />
                {!!latestSubmissionByTask[selectedTask.id]?.corrections?.length && (
                  <div className="student-correction-list">
                    {latestSubmissionByTask[selectedTask.id]?.corrections.map((mark, index) => (
                      <article key={`${mark.start}-${index}`}>
                        <span>Trecho: <del>{mark.wrongText}</del></span>
                        <strong>Correção: {mark.correctText}</strong>
                        {mark.note && <small>{mark.note}</small>}
                      </article>
                    ))}
                  </div>
                )}
                {latestSubmissionByTask[selectedTask.id]?.correctAnswer && <div className="correct-answer-panel"><span>RESPOSTA / TRECHO CORRETO</span><pre>{latestSubmissionByTask[selectedTask.id]?.correctAnswer}</pre></div>}
                {latestSubmissionByTask[selectedTask.id]?.feedback && <p className="teacher-feedback">{latestSubmissionByTask[selectedTask.id]?.feedback}</p>}
              </article>
            )}

            {canSubmit ? (
              <form className="student-response-form" onSubmit={submitResponse}>
                <div className="editor-toolbar">
                  <strong>{selectedTask.editorMode === 'code' ? 'Editor de código' : 'Editor de texto'}</strong>
                  {selectedTask.editorMode === 'code' && (
                    <label>Linguagem
                      <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                        <option value="java">Java</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="html">HTML</option><option value="css">CSS</option><option value="text">Outra</option>
                      </select>
                    </label>
                  )}
                  <span>{response.length.toLocaleString('pt-BR')}/{MAX_RESPONSE_LENGTH.toLocaleString('pt-BR')}</span>
                </div>
                <textarea
                  className={selectedTask.editorMode === 'code' ? 'response-editor editor-code student-code-input' : 'response-editor'}
                  onKeyDown={selectedTask.editorMode === 'code' ? handleCodeEditorKeyDown : undefined}
                  maxLength={MAX_RESPONSE_LENGTH}
                  onChange={(event) => setResponse(event.target.value)}
                  placeholder={selectedTask.editorMode === 'code' ? '// Escreva sua solução aqui…' : 'Escreva sua resposta aqui…'}
                  required
                  ref={responseEditor}
                  spellCheck={selectedTask.editorMode !== 'code'}
                  value={response}
                />
                {selectedTask.editorMode === 'code' && language === 'java' && (
                  <button className="editor-format-button" onClick={applyJavaFormatting} type="button"><Code2 size={15} /> Formatar Java</button>
                )}
                <p className="editor-safety-note">O editor guarda e envia seu texto/código para correção; ele não executa código.</p>
                {error && <p className="workspace-message" role="alert">{error}</p>}
                <button className="workspace-primary-button" disabled={saving} type="submit"><Send size={16} />{saving ? 'Enviando…' : 'Enviar para o professor'}</button>
              </form>
            ) : (
              <div className="submitted-response">
                <div className="submitted-response-label"><CheckCircle2 size={16} /> Sua resposta</div>
                <CorrectionPreview
                  content={latestSubmissionByTask[selectedTask.id]?.content || ''}
                  corrections={latestSubmissionByTask[selectedTask.id]?.corrections || []}
                />
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
