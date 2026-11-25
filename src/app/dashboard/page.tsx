'use client';

import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { BookOpen, Cloud, Copy, Files, Folder as FolderIcon, GraduationCap, Link2, LogOut, Plus, Trash2, UploadCloud, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useFirebaseAuth } from '@/lib/auth-context';
import { getFirebase } from '@/lib/firebase';
import { createFirebaseSupabaseClient } from '@/lib/supabase/firebase';
import type { FileMetadata, Folder, Subject, Task, UserProfile } from '@/lib/models';
import { getLocalAlerts } from '@/lib/ai-service';
import { SharePanel } from '@/components/SharePanel';
import dynamic from 'next/dynamic';

const ClientUniversalFileViewer = dynamic(
  () => import('@/components/UniversalFileViewer').then((module) => module.UniversalFileViewer),
  { ssr: false },
);

function sanitizeName(name: string) {
  return name.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/[^A-Za-z0-9._-]/g, '-');
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, signOut } = useFirebaseAuth();
  const { db, auth } = getFirebase();
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [classFiles, setClassFiles] = useState<FileMetadata[]>([]);
  const [linkedStudentIds, setLinkedStudentIds] = useState<string[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teacherTasks, setTeacherTasks] = useState<Task[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [viewerFile, setViewerFile] = useState<FileMetadata | null>(null);
  const [teacherCode, setTeacherCode] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    const stopProfile = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        setProfile(snapshot.data() as UserProfile);
      }
    }, () => setError('Não foi possível carregar seu perfil.'));
    const stopLinks = onSnapshot(
      query(collection(db, 'teacherLinks'), where('teacherId', '==', user.uid)),
      (snapshot) => setLinkedStudentIds(snapshot.docs.map((item) => String(item.data().studentId))),
      () => setError('Não foi possível carregar os vínculos escolares.'),
    );
    const filesQuery = query(collection(db, 'files'), where('ownerId', '==', user.uid));
    const stopFiles = onSnapshot(filesQuery, (snapshot) => {
      setFiles(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as FileMetadata)));
      setError('');
    }, (snapshotError) => setError(`Falha ao carregar arquivos (${snapshotError.code}): ${snapshotError.message}`));
    return () => { stopProfile(); stopLinks(); stopFiles(); };
  }, [db, user]);

  useEffect(() => {
    if (!user || profile?.profileType !== 'teacher') {
      return;
    }
    const unsubscribers = linkedStudentIds.map((studentId) => onSnapshot(
      query(
        collection(db, 'files'),
        where('ownerId', '==', studentId),
        where('subjectVisibleToTeacher', '==', true),
      ),
      (snapshot) => {
        const studentFiles = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as FileMetadata));
        setClassFiles((current) => [
          ...current.filter((file) => file.ownerId !== studentId),
          ...studentFiles,
        ]);
      },
      () => setError('Não foi possível carregar os arquivos compartilhados da turma.'),
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [db, linkedStudentIds, profile?.profileType, user]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60000);
    const initialTimer = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(initialTimer);
    };
  }, []);

  useEffect(() => {
    if (!user || profile?.profileType !== 'teacher' || !profile.teacherCode) return;
    getDoc(doc(db, 'teacherCodes', profile.teacherCode)).then(async (snapshot) => {
      if (!snapshot.exists()) {
        await setDoc(doc(db, 'teacherCodes', profile.teacherCode!), {
          teacherId: user.uid,
          active: true,
          createdAt: serverTimestamp(),
        });
      }
    }).catch(() => setError('Não foi possível preparar seu código de professor.'));
  }, [db, profile?.profileType, profile?.teacherCode, user]);

  useEffect(() => {
    if (!user) return;
    const subjectsQuery = query(collection(db, 'subjects'), where('ownerId', '==', user.uid));
    const subjectsStop = onSnapshot(subjectsQuery, (snapshot) => {
      setSubjects(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Subject)));
    });
    const foldersQuery = query(collection(db, 'folders'), where('ownerId', '==', user.uid));
    const foldersStop = onSnapshot(foldersQuery, (snapshot) => {
      setFolders(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Folder)));
    });
    const tasksQuery = query(collection(db, 'tasks'), where('assigneeIds', 'array-contains', user.uid));
    const tasksStop = onSnapshot(tasksQuery, (snapshot) => {
      setTasks(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Task)));
    });
    const teacherTasksQuery = query(collection(db, 'tasks'), where('teacherId', '==', user.uid));
    const teacherTasksStop = onSnapshot(teacherTasksQuery, (snapshot) => {
      setTeacherTasks(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Task)));
    });
    return () => { subjectsStop(); foldersStop(); tasksStop(); teacherTasksStop(); };
  }, [db, user]);

  const storageUsed = useMemo(
    () => files.reduce((total, file) => total + file.fileSize, 0),
    [files],
  );

  const visibleFiles = useMemo(() => {
    const sourceFiles = profile?.profileType === 'teacher'
      ? [...files, ...classFiles]
      : files;
    return sourceFiles.filter((file) =>
      (!activeSubject || file.subjectId === activeSubject)
      && (!activeFolder || file.folderId === activeFolder),
    );
  }, [activeFolder, activeSubject, classFiles, files, profile?.profileType]);

  const smartAlerts = useMemo(() => getLocalAlerts({
    storageUsedBytes: storageUsed,
    looseFiles: files.filter((file) => !file.folderId && !file.subjectId).length,
    pendingSubmissions: tasks.filter((task) => task.kind === 'submission').length,
    upcomingDeadlines: tasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() - currentTime < 7 * 86400000).length,
  }), [currentTime, files, storageUsed, tasks]);

  async function createSubject() {
    if (!user) return;
    const name = window.prompt('Nome da matéria', 'Nova matéria')?.trim();
    if (!name) return;
    await addDoc(collection(db, 'subjects'), {
      ownerId: user.uid,
      name,
      icon: '📚',
      color: '#6D9BFF',
      createdAt: serverTimestamp(),
    });
  }

  async function createFolder() {
    if (!user) return;
    const name = window.prompt('Nome da pasta', 'Nova pasta')?.trim();
    if (!name) return;
    await addDoc(collection(db, 'folders'), {
      ownerId: user.uid,
      name,
      icon: '📁',
      color: '#7A93AC',
      parentId: null,
      private: true,
      sharedWithAccountIds: [],
      subjectId: activeSubject,
      createdAt: serverTimestamp(),
    });
  }

  async function publishTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    if (linkedStudentIds.length === 0) {
      setError('Vincule pelo menos um aluno antes de publicar uma atividade.');
      setTaskFormOpen(false);
      return;
    }
    try {
      await addDoc(collection(db, 'tasks'), {
        teacherId: user.uid,
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        grade: 'Alunos vinculados',
        assigneeIds: linkedStudentIds,
        kind: 'submission',
        dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : null,
        createdAt: serverTimestamp(),
      });
      setTaskTitle('');
      setTaskDescription('');
      setTaskDueAt('');
      setTaskFormOpen(false);
      setError('Atividade publicada para os alunos vinculados.');
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : 'Não foi possível publicar a atividade.');
    }
  }

  async function deleteFolder(folder: Folder) {
    if (!user) return;
    try {
      const [filesInFolder, childFolders] = await Promise.all([
        getDocs(query(collection(db, 'files'), where('ownerId', '==', user.uid), where('folderId', '==', folder.id))),
        getDocs(query(collection(db, 'folders'), where('ownerId', '==', user.uid), where('parentId', '==', folder.id))),
      ]);
      if (!filesInFolder.empty || !childFolders.empty) {
        setError('A pasta contém itens. Mova ou remova os arquivos e subpastas antes de apagá-la.');
        return;
      }
      if (!window.confirm(`Apagar a pasta “${folder.name}”?`)) return;
      await deleteDoc(doc(db, 'folders', folder.id));
      if (activeFolder === folder.id) setActiveFolder(null);
      setError('Pasta apagada.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Não foi possível apagar a pasta.');
    }
  }

  async function linkTeacher() {
    if (!user || !teacherCode.trim()) return;
    setError('');
    try {
      const normalizedCode = teacherCode.trim().toUpperCase();
      const codeSnapshot = await getDoc(doc(db, 'teacherCodes', normalizedCode));
      if (!codeSnapshot.exists() || codeSnapshot.data().active !== true) {
        setError('Código de professor não encontrado ou desativado.');
        return;
      }
      const teacherId = String(codeSnapshot.data().teacherId);
      if (teacherId === user.uid) {
        setError('Você não pode vincular sua conta a si mesma.');
        return;
      }
      const linkId = `${user.uid}_${teacherId}`;
      await setDoc(doc(db, 'teacherLinks', linkId), {
        studentId: user.uid,
        teacherId,
        teacherCode: normalizedCode,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', user.uid), {
        teacherIds: [...new Set([...(profile?.teacherIds || []), teacherId])],
        updatedAt: serverTimestamp(),
      });
      setTeacherCode('');
      setError('Professor vinculado. Arquivos enviados para suas matérias poderão ser vistos por ele.');
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'Não foi possível vincular o professor.');
    }
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || !user) return;
    setUploading(true);
    setError('');
    try {
      const supabase = await createFirebaseSupabaseClient(auth);
      for (const file of Array.from(fileList)) {
        if (storageUsed + file.size > 1024 * 1024 * 1024) {
          throw new Error('O limite gratuito de 1 GB foi atingido.');
        }
        const teacherId = profile?.teacherIds?.[0] || 'private';
        const storagePath = `${user.uid}/${teacherId}/${activeFolder || 'root'}/${Date.now()}-${sanitizeName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from('personal-files')
          .upload(storagePath, file, { upsert: false, contentType: file.type });
        if (uploadError) throw new Error(`Supabase Storage (${uploadError.name}): ${uploadError.message}`);
        await setDoc(doc(db, 'files', crypto.randomUUID()), {
          ownerId: user.uid,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
          storagePath,
          folderId: activeFolder,
          subjectId: activeSubject,
          pageId: null,
          subjectVisibleToTeacher: Boolean(activeSubject),
          sharedWithAccountIds: [],
          createdAt: serverTimestamp(),
        });
      }
    } catch (uploadFailure) {
      setError(uploadFailure instanceof Error ? uploadFailure.message : 'Não foi possível enviar o arquivo.');
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <main className="auth-loading">Carregando…</main>;
  if (!user) return null;

  return (
    <main className="firebase-dashboard">
      <aside>
        <div className="brand-lockup"><span className="brand-glyph">V</span><span>viana<span className="brand-light">.cloud</span></span></div>
        <div className="sidebar-caption">ESPAÇO PESSOAL</div>
        <nav className="cloud-sidebar-nav">
          <button className={!activeSubject && !activeFolder ? 'active' : ''} onClick={() => { setActiveSubject(null); setActiveFolder(null); }} type="button">
            <Files size={16} /> Biblioteca <span>{files.length}</span>
          </button>
          <div className="sidebar-section-heading">
            <span>PASTAS</span>
            <button onClick={createFolder} type="button" aria-label="Criar pasta"><Plus size={14} /></button>
          </div>
          {folders.map((folder) => (
            <div className="sidebar-folder-row" key={folder.id}>
              <button className={activeFolder === folder.id ? 'active' : ''} onClick={() => { setActiveFolder(folder.id); setActiveSubject(folder.subjectId); }} type="button">
                <FolderIcon size={15} style={{ color: folder.color }} /> <span className="sidebar-item-name">{folder.name}</span>
              </button>
              <button className="sidebar-folder-delete" aria-label={`Apagar pasta ${folder.name}`} onClick={() => deleteFolder(folder)} type="button"><Trash2 size={13} /></button>
            </div>
          ))}
          {profile?.profileType === 'student' && (
            <>
              <div className="sidebar-section-heading">
                <span>MATÉRIAS</span>
                <button onClick={createSubject} type="button" aria-label="Criar matéria"><Plus size={14} /></button>
              </div>
              {subjects.map((subject) => (
                <button key={subject.id} className={activeSubject === subject.id && !activeFolder ? 'active' : ''} onClick={() => { setActiveSubject(subject.id); setActiveFolder(null); }} type="button">
                  <BookOpen size={15} style={{ color: subject.color }} /> <span className="sidebar-item-name">{subject.name}</span>
                </button>
              ))}
            </>
          )}
        </nav>
        {profile?.profileType === 'teacher' && (
          <section className="teacher-sidebar">
            <div className="teacher-sidebar-title"><Users size={15} /><span>ÁREA DO PROFESSOR</span></div>
            <div className="teacher-sidebar-stat">
              <span>Alunos vinculados</span>
              <strong>{linkedStudentIds.length}</strong>
            </div>
            <div className="teacher-code-card">
              <span>CÓDIGO PARA ALUNOS</span>
              <strong>{profile.teacherCode || 'Indisponível'}</strong>
              <button onClick={() => {
                if (profile.teacherCode) void navigator.clipboard.writeText(profile.teacherCode);
              }} type="button"><Copy size={13} /> Copiar código</button>
            </div>
            <button className="teacher-sidebar-action" onClick={() => setTaskFormOpen(true)} type="button"><Plus size={15} /> Criar atividade</button>
            <button className="teacher-sidebar-action" disabled={!activeFolder} onClick={() => setShareOpen(true)} type="button"><Link2 size={15} /> Compartilhar pasta</button>
            {teacherTasks.slice(0, 3).map((task) => (
              <div className="sidebar-task-item" key={task.id}>
                <strong>{task.title}</strong>
                <span>{task.assigneeIds.length} aluno(s) · {task.dueAt ? new Date(task.dueAt).toLocaleDateString('pt-BR') : 'Sem prazo'}</span>
              </div>
            ))}
          </section>
        )}
        <div className="sidebar-account">
          <div className="account-avatar">{(user.displayName || 'U').charAt(0).toUpperCase()}</div>
          <div className="account-copy">
            <strong>{user.displayName || 'Usuário'}</strong>
            <span>{profile?.profileType === 'teacher' ? 'Professor' : profile?.profileType === 'student' ? 'Aluno' : 'Pessoal'}</span>
          </div>
        </div>
        <button className="logout" onClick={async () => { await signOut(); router.replace('/login'); }} type="button"><LogOut size={16} /> Sair</button>
      </aside>
      <section>
        <header>
          <div><span className="eyebrow">{profile?.profileType === 'teacher' ? 'ESPAÇO DOCENTE' : 'SEU ESPAÇO'}</span><h1>Olá, {user.displayName || 'Usuário'}.</h1><p className="dashboard-subtitle">Seus arquivos, organizados com calma e prontos para acompanhar você.</p></div>
          <label className="upload-button"><UploadCloud size={17} /><input type="file" multiple onChange={(event) => handleUpload(event.target.files)} />{uploading ? 'Enviando…' : 'Enviar arquivos'}</label>
        </header>
        <motion.div className="storage-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Cloud size={18} /><div><strong>{(storageUsed / (1024 * 1024)).toFixed(1)} MB usados</strong><span>de 1 GB disponíveis</span></div>
        </motion.div>
        {smartAlerts.length > 0 && (
          <div className="smart-alerts">
            {smartAlerts.map((alert) => (
              <motion.article className={`smart-alert smart-alert-${alert.tone}`} key={alert.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                <div><strong>{alert.title}</strong><span>{alert.detail}</span></div>
                <button type="button">{alert.action}</button>
              </motion.article>
            ))}
          </div>
        )}
        {profile?.profileType === 'student' && (
          <div className="school-tools">
            <div>
              <GraduationCap size={17} />
              <input value={teacherCode} onChange={(event) => setTeacherCode(event.target.value)} placeholder="Código do professor" />
              <button onClick={linkTeacher} type="button"><Link2 size={15} /> Vincular</button>
            </div>
            <span className="school-profile-note">{profile.grade || 'Série não informada'} · {profile.teacherIds?.length || 0} professor(es) vinculado(s)</span>
          </div>
        )}
        {profile?.profileType === 'student' && tasks.length > 0 && (
          <section className="student-tasks">
            <div className="library-heading">
              <div><span className="eyebrow">DA SUA TURMA</span><h2>Atividades</h2></div>
              <span>{tasks.length} recebida(s)</span>
            </div>
            <div className="task-grid">
              {tasks.map((task) => (
                <article key={task.id}>
                  <strong>{task.title}</strong>
                  <p>{task.description || 'Atividade enviada pelo professor.'}</p>
                  <span>{task.dueAt ? `Prazo: ${new Date(task.dueAt).toLocaleDateString('pt-BR')}` : 'Sem prazo definido'}</span>
                </article>
              ))}
            </div>
          </section>
        )}
        {error && <p className="auth-message dashboard-error" role="alert">{error}</p>}
        <div className="library-heading">
          <div><span className="eyebrow">SUA BIBLIOTECA</span><h2>{activeFolder ? folders.find((folder) => folder.id === activeFolder)?.name : activeSubject ? subjects.find((subject) => subject.id === activeSubject)?.name : 'Arquivos recentes'}</h2></div>
          <span>{visibleFiles.length} {visibleFiles.length === 1 ? 'arquivo' : 'arquivos'}</span>
        </div>
        <div className="file-grid">
          {visibleFiles.map((file) => (
            <motion.article key={file.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onDoubleClick={() => setViewerFile(file)}>
              <strong>{file.name}</strong><span>{Math.max(1, Math.ceil(file.fileSize / 1024))} KB</span>
              <button className="open-file" type="button" onClick={() => setViewerFile(file)}>Abrir no leitor</button>
            </motion.article>
          ))}
          {visibleFiles.length === 0 && (
            <div className="empty-library">
              <div><Files size={22} /></div>
              <strong>Nenhum arquivo por aqui ainda</strong>
              <span>Envie um arquivo ou crie uma pasta para começar.</span>
            </div>
          )}
        </div>
      </section>
      {taskFormOpen && (
        <div className="task-modal-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setTaskFormOpen(false);
        }}>
          <form className="task-modal" onSubmit={publishTask}>
            <span className="eyebrow">NOVA ATIVIDADE</span>
            <h2>Enviar para seus alunos</h2>
            <p>A atividade será enviada aos {linkedStudentIds.length} aluno(s) vinculados.</p>
            <label>Título
              <input autoFocus maxLength={100} onChange={(event) => setTaskTitle(event.target.value)} required value={taskTitle} />
            </label>
            <label>Instruções
              <textarea maxLength={2000} onChange={(event) => setTaskDescription(event.target.value)} rows={4} value={taskDescription} />
            </label>
            <label>Prazo (opcional)
              <input onChange={(event) => setTaskDueAt(event.target.value)} type="date" value={taskDueAt} />
            </label>
            <div className="task-modal-actions">
              <button onClick={() => setTaskFormOpen(false)} type="button">Cancelar</button>
              <button className="task-publish" disabled={!linkedStudentIds.length} type="submit">Publicar atividade</button>
            </div>
          </form>
        </div>
      )}
      <ClientUniversalFileViewer file={viewerFile} files={visibleFiles} onClose={() => setViewerFile(null)} onChange={setViewerFile} />
      <SharePanel
        open={shareOpen}
        ownerId={user.uid}
        targetId={activeFolder || ''}
        targetName={folders.find((folder) => folder.id === activeFolder)?.name || 'Pasta'}
        onClose={() => setShareOpen(false)}
      />
    </main>
  );
}
