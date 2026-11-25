'use client';

import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  ArrowLeft,
  BookOpenCheck,
  CalendarClock,
  ChevronRight,
  CircleUserRound,
  Code2,
  FileText,
  GraduationCap,
  Highlighter,
  Inbox,
  MessageSquareText,
  Plus,
  Save,
  Send,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CorrectionPreview } from '@/components/CorrectionPreview';
import { getFirebase } from '@/lib/firebase';
import type { Submission, Task, UserProfile } from '@/lib/models';

type Student = { uid: string; displayName: string; grade: string };
type WorkspaceSection = 'overview' | 'create' | 'review';

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

export function TeacherWorkspace({ teacherId, displayName }: { teacherId: string; displayName: string }) {
  const router = useRouter();
  const { db } = getFirebase();
  const [section, setSection] = useState<WorkspaceSection>('overview');
  const [students, setStudents] = useState<Student[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [submissionSnapshot, setSubmissionSnapshot] = useState<{ taskId: string; items: Submission[] } | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [targetType, setTargetType] = useState<'grade' | 'students'>('grade');
  const [targetGrade, setTargetGrade] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [editorMode, setEditorMode] = useState<'text' | 'code'>('text');
  const [language, setLanguage] = useState('javascript');

  useEffect(() => onSnapshot(
    query(collection(db, 'teacherLinks'), where('teacherId', '==', teacherId)),
    async (snapshot) => {
      try {
        const roster = await Promise.all(snapshot.docs.map(async (link) => {
          const studentId = String(link.data().studentId);
          const profile = await getDoc(doc(db, 'users', studentId));
          if (!profile.exists()) return null;
          const data = profile.data() as UserProfile;
          return {
            uid: studentId,
            displayName: data.displayName || 'Aluno',
            grade: data.grade || 'Série não informada',
          };
        }));
        setStudents(roster.filter((student): student is Student => student !== null));
      } catch {
        setError('Não foi possível carregar a lista de alunos.');
      } finally {
        setLoading(false);
      }
    },
    () => {
      setError('Não foi possível carregar as turmas vinculadas.');
      setLoading(false);
    },
  ), [db, teacherId]);

  useEffect(() => onSnapshot(
    query(collection(db, 'tasks'), where('teacherId', '==', teacherId)),
    (snapshot) => {
      const nextTasks = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Task));
      setTasks(nextTasks);
      if (!selectedTaskId && nextTasks.length) setSelectedTaskId(nextTasks[0].id);
      setError('');
    },
    () => setError('Não foi possível carregar suas atividades.'),
  ), [db, selectedTaskId, teacherId]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const selectedTaskIdForSubscription = selectedTask?.id;
  const submissions = useMemo(() => (
    submissionSnapshot && selectedTaskIdForSubscription && submissionSnapshot.taskId === selectedTaskIdForSubscription
      ? submissionSnapshot.items
      : []
  ), [selectedTaskIdForSubscription, submissionSnapshot]);

  useEffect(() => {
    if (!selectedTaskIdForSubscription) return;
    return onSnapshot(
      collection(db, 'tasks', selectedTaskIdForSubscription, 'submissions'),
      (snapshot) => setSubmissionSnapshot({
        taskId: selectedTaskIdForSubscription,
        items: snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Submission)),
      }),
      () => setError('Não foi possível carregar as entregas desta atividade.'),
    );
  }, [db, selectedTaskIdForSubscription]);

  const latestSubmissionByStudent = useMemo(() => {
    const latest = new Map<string, Submission>();
    for (const submission of [...submissions].sort((a, b) => timestampMillis(a.submittedAt) - timestampMillis(b.submittedAt))) {
      latest.set(submission.studentId, submission);
    }
    return latest;
  }, [submissions]);

  const reviewQueueCount = submissions.filter((submission) => submission.status === 'Em Revisão').length;

  const taskStudents = useMemo(() => {
    if (!selectedTask) return [];
    return students.filter((student) => selectedTask.assigneeIds?.includes(student.uid));
  }, [selectedTask, students]);

  const selectedSubmission = submissions.find((submission) => submission.id === selectedSubmissionId)
    || taskStudents
      .map((student) => latestSubmissionByStudent.get(student.uid))
      .find((submission): submission is Submission => Boolean(submission))
    || null;

  const grades = useMemo(() => [...new Set(students.map((student) => student.grade))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR')), [students]);
  const gradeRecipients = students.filter((student) => student.grade === targetGrade);
  const chosenRecipients = targetType === 'grade'
    ? gradeRecipients
    : students.filter((student) => selectedStudentIds.includes(student.uid));

  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => {
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aDue - bDue;
  }), [tasks]);

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !chosenRecipients.length) {
      setError('Informe o título e selecione ao menos um aluno ou uma série com alunos vinculados.');
      return;
    }
    if (chosenRecipients.length > 500) {
      setError('Uma atividade pode ser enviada para no máximo 500 alunos por vez.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const dueAt = dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : null;
      const assignment = await addDoc(collection(db, 'tasks'), {
        teacherId,
        title: title.trim(),
        description: description.trim(),
        grade: targetType === 'grade' ? targetGrade : 'Alunos selecionados',
        targetType,
        targetGrade: targetType === 'grade' ? targetGrade : null,
        assigneeIds: chosenRecipients.map((student) => student.uid),
        kind: 'submission',
        editorMode,
        language: editorMode === 'code' ? language : null,
        dueAt,
        createdAt: serverTimestamp(),
      });
      setTitle('');
      setDescription('');
      setDueDate('');
      setSelectedStudentIds([]);
      setSelectedTaskId(assignment.id);
      setSection('review');
      setError('Atividade publicada para os alunos selecionados.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível publicar a atividade.');
    } finally {
      setSaving(false);
    }
  }

  function selectTask(taskId: string) {
    setSelectedTaskId(taskId);
    setSelectedSubmissionId('');
    setSection('review');
  }

  const selectedStudent = selectedSubmission
    ? students.find((student) => student.uid === selectedSubmission.studentId)
    : null;

  return (
    <main className="teacher-workspace">
      <header className="workspace-topbar">
        <button className="workspace-back" onClick={() => router.push('/dashboard')} type="button"><ArrowLeft size={17} /> Arquivos</button>
        <div className="workspace-brand"><span className="brand-glyph">V</span> viana<span>.cloud</span></div>
        <span className="workspace-role"><GraduationCap size={15} /> Espaço docente</span>
      </header>

      <div className="teacher-workspace-shell">
        <aside className="teacher-workspace-sidebar">
          <div className="teacher-workspace-identity">
            <div className="teacher-workspace-avatar">{displayName.charAt(0).toUpperCase()}</div>
            <div><strong>{displayName}</strong><span>Área de ensino</span></div>
          </div>
          <div className="teacher-workspace-nav-label">GESTÃO PEDAGÓGICA</div>
          <button className={section === 'overview' ? 'active' : ''} onClick={() => setSection('overview')} type="button"><BookOpenCheck size={17} /> Visão geral</button>
          <button className={section === 'create' ? 'active' : ''} onClick={() => setSection('create')} type="button"><Plus size={17} /> Criar atividade</button>
          <button className={section === 'review' ? 'active' : ''} onClick={() => setSection('review')} type="button"><Inbox size={17} /> Corrigir entregas <span>{reviewQueueCount}</span></button>
          <div className="teacher-workspace-sidebar-footer">
            <span><Users size={15} /> {students.length} alunos vinculados</span>
            <span><FileText size={15} /> {tasks.length} atividades publicadas</span>
          </div>
        </aside>

        <section className="teacher-workspace-main">
          <header className="teacher-workspace-heading">
            <div>
              <span className="eyebrow">PAINEL DO PROFESSOR</span>
              <h1>{section === 'create' ? 'Planejar atividade' : section === 'review' ? 'Correção e notas' : 'Sua sala de aula'}</h1>
              <p>{section === 'create'
                ? 'Escolha a turma ou os alunos que receberão o trabalho.'
                : section === 'review'
                  ? 'Leia, marque trechos e devolva uma correção clara.'
                  : 'Acompanhe atividades, entregas e avaliações em um só lugar.'}</p>
            </div>
            {section === 'overview' && <button className="workspace-primary-button" onClick={() => setSection('create')} type="button"><Plus size={16} /> Nova atividade</button>}
          </header>

          {error && <p className="workspace-message" role="status">{error}</p>}
          {loading && <div className="activity-loading">Carregando suas turmas…</div>}

          {!loading && section === 'overview' && (
            <div className="teacher-overview">
              <div className="teacher-metric-row">
                <article><span>Alunos vinculados</span><strong>{students.length}</strong><Users size={18} /></article>
                <article><span>Atividades publicadas</span><strong>{tasks.length}</strong><BookOpenCheck size={18} /></article>
                <article><span>Entregas a corrigir · atividade ativa</span><strong>{reviewQueueCount}</strong><Inbox size={18} /></article>
              </div>
              <div className="teacher-overview-columns">
                <section className="teacher-card-panel">
                  <div className="teacher-panel-title"><div><span className="eyebrow">PRAZOS E TURMAS</span><h2>Atividades publicadas</h2></div><button onClick={() => setSection('create')} type="button"><Plus size={15} /> Criar</button></div>
                  {sortedTasks.map((task) => (
                    <button className="teacher-task-row" key={task.id} onClick={() => selectTask(task.id)} type="button">
                      <span className="teacher-task-icon">{task.editorMode === 'code' ? <Code2 size={18} /> : <FileText size={18} />}</span>
                      <span className="teacher-task-copy"><strong>{task.title}</strong><small>{task.grade} · {task.assigneeIds.length} aluno(s)</small></span>
                      <span className="teacher-task-due">{dueLabel(task.dueAt)}</span><ChevronRight size={16} />
                    </button>
                  ))}
                  {tasks.length === 0 && <div className="teacher-empty">Você ainda não publicou atividades.</div>}
                </section>
                <section className="teacher-card-panel teacher-class-panel">
                  <div className="teacher-panel-title"><div><span className="eyebrow">SEUS ALUNOS</span><h2>Turmas vinculadas</h2></div><span>{students.length}</span></div>
                  {grades.map((grade) => (
                    <article className="teacher-grade-row" key={grade}>
                      <span className="teacher-grade-icon"><GraduationCap size={17} /></span>
                      <strong>{grade}</strong><span>{students.filter((student) => student.grade === grade).length} aluno(s)</span>
                    </article>
                  ))}
                  {students.length === 0 && <div className="teacher-empty">Os alunos vinculados aparecerão aqui.</div>}
                </section>
              </div>
            </div>
          )}

          {!loading && section === 'create' && (
            <form className="teacher-assignment-form" onSubmit={createAssignment}>
              <div className="teacher-form-section">
                <span className="teacher-form-step">01</span>
                <div className="teacher-form-content">
                  <h2>Sobre a atividade</h2>
                  <label>Título da atividade<input autoFocus maxLength={100} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
                  <label>Instruções<textarea maxLength={4000} onChange={(event) => setDescription(event.target.value)} placeholder="Explique o que o aluno deve fazer…" rows={4} value={description} /></label>
                  <div className="teacher-form-inline">
                    <label>Prazo de entrega<input onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} /></label>
                    <label>Formato da resposta<select onChange={(event) => setEditorMode(event.target.value as 'text' | 'code')} value={editorMode}><option value="text">Texto</option><option value="code">Código</option></select></label>
                  </div>
                  {editorMode === 'code' && <label>Linguagem sugerida<select onChange={(event) => setLanguage(event.target.value)} value={language}><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="html">HTML</option><option value="css">CSS</option><option value="text">Outra</option></select></label>}
                </div>
              </div>

              <div className="teacher-form-section">
                <span className="teacher-form-step">02</span>
                <div className="teacher-form-content">
                  <h2>Quem recebe?</h2>
                  <div className="recipient-mode-switch">
                    <button className={targetType === 'grade' ? 'active' : ''} onClick={() => setTargetType('grade')} type="button"><GraduationCap size={16} /> Uma série inteira</button>
                    <button className={targetType === 'students' ? 'active' : ''} onClick={() => setTargetType('students')} type="button"><CircleUserRound size={16} /> Escolher alunos</button>
                  </div>
                  {targetType === 'grade' ? (
                    <label>Série / turma<select onChange={(event) => setTargetGrade(event.target.value)} required value={targetGrade}><option value="">Selecione uma série</option>{grades.map((grade) => <option key={grade} value={grade}>{grade} · {students.filter((student) => student.grade === grade).length} aluno(s)</option>)}</select></label>
                  ) : (
                    <div className="recipient-student-list">
                      {students.map((student) => (
                        <label className="recipient-student" key={student.uid}>
                          <input checked={selectedStudentIds.includes(student.uid)} onChange={(event) => setSelectedStudentIds((current) => event.target.checked ? [...current, student.uid] : current.filter((id) => id !== student.uid))} type="checkbox" />
                          <span className="recipient-avatar">{student.displayName.charAt(0).toUpperCase()}</span>
                          <span><strong>{student.displayName}</strong><small>{student.grade}</small></span>
                        </label>
                      ))}
                      {students.length === 0 && <p className="teacher-empty">Vincule alunos antes de publicar uma atividade.</p>}
                    </div>
                  )}
                  <div className="recipient-summary"><Users size={15} /> Será enviada para <strong>{chosenRecipients.length}</strong> aluno(s).</div>
                </div>
              </div>
              <div className="teacher-form-footer">
                <span><CalendarClock size={15} /> {dueDate ? `Prazo: ${new Date(`${dueDate}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Sem prazo definido'}</span>
                <button className="workspace-primary-button" disabled={saving || chosenRecipients.length === 0} type="submit"><Send size={16} /> {saving ? 'Publicando…' : 'Publicar atividade'}</button>
              </div>
            </form>
          )}

          {!loading && section === 'review' && (
            <div className="teacher-review-layout">
              <aside className="teacher-review-queue">
                <label className="teacher-task-picker">Atividade<select onChange={(event) => selectTask(event.target.value)} value={selectedTaskId}><option value="">Selecione</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
                {selectedTask && <div className="review-queue-summary">{taskStudents.length} aluno(s) · prazo {dueLabel(selectedTask.dueAt)}</div>}
                {taskStudents.map((student) => {
                  const submission = latestSubmissionByStudent.get(student.uid);
                  return (
                    <button className={`review-student-row ${selectedSubmission?.studentId === student.uid ? 'active' : ''}`} key={student.uid} onClick={() => {
                      if (submission) setSelectedSubmissionId(submission.id);
                    }} type="button" disabled={!submission}>
                      <span className="recipient-avatar">{student.displayName.charAt(0).toUpperCase()}</span>
                      <span><strong>{student.displayName}</strong><small>{submission?.status || 'Ainda não enviou'}</small></span>
                      {submission?.status === 'Em Revisão' ? <span className="review-dot" /> : <ChevronRight size={15} />}
                    </button>
                  );
                })}
                {!selectedTask && <div className="teacher-empty">Selecione uma atividade para ver as entregas.</div>}
              </aside>

              <section className="teacher-review-editor">
                {selectedTask && selectedSubmission ? (
                  <SubmissionReviewEditor
                    key={selectedSubmission.id}
                    saving={saving}
                    setSaving={setSaving}
                    submission={selectedSubmission}
                    studentGrade={selectedStudent?.grade || ''}
                    studentName={selectedStudent?.displayName || 'Aluno'}
                    task={selectedTask}
                    onMessage={setError}
                  />
                ) : (
                  <div className="teacher-review-empty"><MessageSquareText size={28} /><strong>{selectedTask ? 'Selecione uma entrega para corrigir' : 'Escolha uma atividade'}</strong><span>Você pode revisar respostas, marcar erros e lançar notas neste espaço.</span></div>
                )}
              </section>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SubmissionReviewEditor({
  submission,
  task,
  studentName,
  studentGrade,
  saving,
  setSaving,
  onMessage,
}: {
  submission: Submission;
  task: Task;
  studentName: string;
  studentGrade: string;
  saving: boolean;
  setSaving: (value: boolean) => void;
  onMessage: (value: string) => void;
}) {
  const { db } = getFirebase();
  const responseRef = useRef<HTMLTextAreaElement>(null);
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [corrections, setCorrections] = useState(submission.corrections || []);
  const [gradeValue, setGradeValue] = useState(submission.gradeValue === null ? '' : String(submission.gradeValue));
  const [feedback, setFeedback] = useState(submission.feedback || '');
  const [correctAnswer, setCorrectAnswer] = useState(submission.correctAnswer || '');
  const [reviewStatus, setReviewStatus] = useState<'Aprovado' | 'Refazer'>(submission.status === 'Refazer' ? 'Refazer' : 'Aprovado');
  const [localError, setLocalError] = useState('');
  const sentAt = timestampMillis(submission.submittedAt);

  function captureSelection() {
    const editor = responseRef.current;
    if (!editor || editor.selectionStart === editor.selectionEnd) {
      setLocalError('Selecione um trecho da resposta antes de marcar.');
      return;
    }
    setSelectedRange({ start: editor.selectionStart, end: editor.selectionEnd });
    setLocalError('');
  }

  function addCorrection() {
    if (!selectedRange) {
      setLocalError('Selecione um trecho da resposta para adicionar a correção.');
      return;
    }
    if (!correctionText.trim()) {
      setLocalError('Digite a resposta correta para o trecho selecionado.');
      return;
    }
    if (corrections.length >= 100) {
      setLocalError('O limite de 100 marcações por entrega foi atingido.');
      return;
    }
    if (corrections.some((item) => selectedRange.start < item.end && selectedRange.end > item.start)) {
      setLocalError('Esse trecho se sobrepõe a uma marcação existente. Remova a anterior ou escolha outro trecho.');
      return;
    }
    setCorrections((current) => [...current, {
      ...selectedRange,
      wrongText: submission.content.slice(selectedRange.start, selectedRange.end),
      correctText: correctionText.trim(),
      note: correctionNote.trim(),
    }].sort((a, b) => a.start - b.start));
    setCorrectionText('');
    setCorrectionNote('');
    setSelectedRange(null);
    setLocalError('');
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericGrade = Number(gradeValue);
    if (!Number.isFinite(numericGrade) || numericGrade < 0 || numericGrade > 10) {
      setLocalError('A nota deve ser um número entre 0 e 10.');
      return;
    }
    setSaving(true);
    setLocalError('');
    try {
      await updateDoc(doc(db, 'tasks', task.id, 'submissions', submission.id), {
        gradeValue: numericGrade,
        feedback: feedback.trim(),
        corrections,
        correctAnswer: correctAnswer.trim(),
        status: reviewStatus,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onMessage('Correção e nota salvas. O aluno já pode consultar o resultado.');
    } catch (reviewError) {
      setLocalError(reviewError instanceof Error ? reviewError.message : 'Não foi possível salvar a correção.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="submission-titlebar">
        <div><span className="eyebrow">ENTREGA DE {studentGrade}</span><h2>{studentName}</h2><p>{task.title} · enviada {sentAt ? `em ${new Date(sentAt).toLocaleString('pt-BR')}` : 'recentemente'}</p></div>
        <span className={`assignment-status ${submission.status === 'Em Revisão' ? 'status-review' : submission.status === 'Aprovado' ? 'status-complete' : 'status-revision'}`}>{submission.status}</span>
      </div>
      {localError && <p className="workspace-message" role="alert">{localError}</p>}
      <div className="review-response-label">{submission.editorMode === 'code' ? <Code2 size={16} /> : <FileText size={16} />} Resposta do aluno · {submission.language || 'Texto'}</div>
      <textarea
        className={submission.editorMode === 'code' ? 'response-editor review-source editor-code' : 'response-editor review-source'}
        onSelect={(event) => setSelectedRange({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })}
        readOnly
        ref={responseRef}
        value={submission.content || ''}
      />
      <div className="teacher-annotator">
        <div className="annotator-title"><Highlighter size={16} /><strong>Marcar um trecho incorreto</strong></div>
        <p>Selecione o trecho na resposta, escreva a forma correta e adicione a marcação vermelha.</p>
        <div className="annotator-selection">{selectedRange && selectedRange.end > selectedRange.start
          ? `Selecionado: “${submission.content.slice(selectedRange.start, selectedRange.end).slice(0, 100)}”`
          : 'Nenhum trecho selecionado'}</div>
        <button className="annotator-mark-button" onClick={captureSelection} type="button"><Highlighter size={14} /> Capturar seleção</button>
        <label>Resposta correta para o trecho<input maxLength={1000} onChange={(event) => setCorrectionText(event.target.value)} value={correctionText} /></label>
        <label>Comentário sobre este trecho<input maxLength={500} onChange={(event) => setCorrectionNote(event.target.value)} value={correctionNote} /></label>
        <button className="annotator-add-button" disabled={!selectedRange || selectedRange.end <= selectedRange.start} onClick={addCorrection} type="button"><Plus size={15} /> Adicionar correção</button>
      </div>
      <div className="review-marks-list">
        {corrections.map((mark, index) => (
          <article key={`${mark.start}-${mark.end}-${index}`}>
            <span className="review-mark-incorrect">{mark.wrongText}</span><ChevronRight size={14} /><span className="review-mark-correct">{mark.correctText}</span>
            {mark.note && <small>{mark.note}</small>}
            <button aria-label="Remover marcação" onClick={() => setCorrections((current) => current.filter((_, markIndex) => markIndex !== index))} type="button">×</button>
          </article>
        ))}
      </div>
      <div className="correction-preview-panel"><span>PRÉVIA DAS MARCAÇÕES PARA O ALUNO</span><CorrectionPreview content={submission.content || ''} corrections={corrections} /></div>
      <form className="review-grading-form" onSubmit={saveReview}>
        <label>Resposta correta geral<textarea maxLength={10000} onChange={(event) => setCorrectAnswer(event.target.value)} placeholder="Opcional: escreva uma solução modelo para o aluno consultar." rows={4} value={correctAnswer} /></label>
        <div className="grading-row">
          <label>Nota (0–10)<input max="10" min="0" onChange={(event) => setGradeValue(event.target.value)} required step="0.1" type="number" value={gradeValue} /></label>
          <label>Resultado<select onChange={(event) => setReviewStatus(event.target.value as 'Aprovado' | 'Refazer')} value={reviewStatus}><option value="Aprovado">Aprovado</option><option value="Refazer">Solicitar ajuste</option></select></label>
        </div>
        <label>Feedback geral<textarea maxLength={4000} onChange={(event) => setFeedback(event.target.value)} placeholder="Oriente o aluno sobre o resultado…" rows={3} value={feedback} /></label>
        <button className="workspace-primary-button" disabled={saving || submission.status !== 'Em Revisão'} type="submit"><Save size={16} />{saving ? 'Salvando…' : 'Salvar correção e nota'}</button>
      </form>
    </>
  );
}
