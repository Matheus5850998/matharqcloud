'use client';

import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { BookOpen, Cloud, Copy, Files, Folder as FolderIcon, GraduationCap, Link2, LogOut, Plus, Trash2, UploadCloud, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useFirebaseAuth } from '@/lib/auth-context';
import { getFirebase } from '@/lib/firebase';
import { createFirebaseSupabaseClient } from '@/lib/supabase/firebase';
import type { FileMetadata, Folder, Subject, Task, UserProfile } from '@/lib/models';
import { getLocalAlerts } from '@/lib/ai-service';
import { SharePanel } from '@/components/SharePanel';
import { TeacherStudentActivities } from '@/components/TeacherStudentActivities';
import dynamic from 'next/dynamic';
import { normalizeSubjectKey } from '@/lib/subjects';

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
  const [linkedStudentIds, setLinkedStudentIds] = useState<string[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [viewerFile, setViewerFile] = useState<FileMetadata | null>(null);
  const [viewerFiles, setViewerFiles] = useState<FileMetadata[] | null>(null);
  const [activeSection, setActiveSection] = useState<'library' | 'student-activities'>('library');
  const [teacherSubjectsInput, setTeacherSubjectsInput] = useState('');
  const [teacherCode, setTeacherCode] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
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
        const nextProfile = snapshot.data() as UserProfile;
        setProfile(nextProfile);
        setTeacherSubjectsInput((nextProfile.teacherSubjects || []).join(', '));
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
      const supabase = await createFirebaseSupabaseClient(auth);
      const { data: directoryEntry, error: readError } = await supabase
        .from('teacher_directory')
        .select('teacher_id')
        .eq('teacher_id', user.uid)
        .maybeSingle();
      if (readError) throw readError;
      const directoryValues = { teacher_id: user.uid, teacher_code: profile.teacherCode! };
      const { error: writeError } = directoryEntry
        ? await supabase.from('teacher_directory').update(directoryValues).eq('teacher_id', user.uid)
        : await supabase.from('teacher_directory').insert(directoryValues);
      if (writeError) throw writeError;
    }).catch((directoryError: unknown) => setError(directoryError instanceof Error
      ? `Não foi possível preparar o código seguro do professor: ${directoryError.message}`
      : 'Não foi possível preparar seu código de professor.'));
  }, [auth, db, profile?.profileType, profile?.teacherCode, user]);

  useEffect(() => {
    if (!user || profile?.profileType !== 'student') return;
    let active = true;
    async function syncStorageLinks() {
      const links = await getDocs(query(collection(db, 'teacherLinks'), where('studentId', '==', user!.uid)));
      const supabase = await createFirebaseSupabaseClient(auth);
      for (const link of links.docs) {
        const { teacherId, teacherCode } = link.data();
        if (typeof teacherId !== 'string' || typeof teacherCode !== 'string') continue;
        const { data, error: readError } = await supabase
          .from('teacher_student_links')
          .select('student_id')
          .eq('student_id', user!.uid)
          .eq('teacher_id', teacherId)
          .maybeSingle();
        if (readError) throw readError;
        if (!data) {
          const { error: insertError } = await supabase
            .from('teacher_student_links')
            .insert({ student_id: user!.uid, teacher_id: teacherId, teacher_code: teacherCode });
          if (insertError) throw insertError;
        }
      }
    }
    syncStorageLinks().catch((syncError: unknown) => {
      if (active) setError(syncError instanceof Error
        ? `Falha ao sincronizar vínculo seguro: ${syncError.message}`
        : 'Falha ao sincronizar o vínculo seguro com o Storage.');
    });
    return () => { active = false; };
  }, [auth, db, profile?.profileType, user]);

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
    return () => { subjectsStop(); foldersStop(); tasksStop(); };
  }, [db, user]);

  const storageUsed = useMemo(
    () => files.reduce((total, file) => total + file.fileSize, 0),
    [files],
  );

  const visibleFiles = useMemo(() => {
    return files.filter((file) =>
      (!activeSubject || file.subjectId === activeSubject)
      && (!activeFolder || file.folderId === activeFolder),
    );
  }, [activeFolder, activeSubject, files]);

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

  async function saveTeacherSubjects() {
    if (!user || profile?.profileType !== 'teacher') return;
    const subjectNames = [...new Set(teacherSubjectsInput
      .split(',')
      .map((name) => name.trim().slice(0, 80))
      .filter(Boolean))];
    const subjectRows = subjectNames
      .map((subject_name) => ({ teacher_id: user.uid, subject_name, subject_key: normalizeSubjectKey(subject_name) }))
      .filter((subject) => subject.subject_key);
    try {
      const supabase = await createFirebaseSupabaseClient(auth);
      const { error: deleteError } = await supabase.from('teacher_subjects').delete().eq('teacher_id', user.uid);
      if (deleteError) throw new Error(`Falha ao atualizar permissões das matérias: ${deleteError.message}`);
      if (subjectRows.length) {
        const { error: insertError } = await supabase.from('teacher_subjects').insert(subjectRows);
        if (insertError) throw new Error(`Falha ao salvar matérias no Storage: ${insertError.message}`);
      }
      await updateDoc(doc(db, 'users', user.uid), {
        teacherSubjects: subjectRows.map((subject) => subject.subject_name),
        teacherSubjectKeys: subjectRows.map((subject) => subject.subject_key),
      });
      setError('Matérias atualizadas. O acesso aos arquivos foi ajustado.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar suas matérias.');
    }
  }

  async function deleteFolder(folder: Folder) {
    if (!user) return;
    try {
      const [allFolders, allFiles] = await Promise.all([
        getDocs(query(collection(db, 'folders'), where('ownerId', '==', user.uid))),
        getDocs(query(collection(db, 'files'), where('ownerId', '==', user.uid))),
      ]);
      const folderIds = new Set([folder.id]);
      let foundChild = true;
      while (foundChild) {
        foundChild = false;
        for (const candidate of allFolders.docs) {
          const parentId = candidate.data().parentId;
          if (typeof parentId === 'string' && folderIds.has(parentId) && !folderIds.has(candidate.id)) {
            folderIds.add(candidate.id);
            foundChild = true;
          }
        }
      }
      const foldersToDelete = allFolders.docs.filter((item) => folderIds.has(item.id));
      const filesToDelete = allFiles.docs.filter((item) => {
        const folderId = item.data().folderId;
        return typeof folderId === 'string' && folderIds.has(folderId);
      });
      if (!window.confirm(`Apagar “${folder.name}” e seu conteúdo? ${foldersToDelete.length} pasta(s) e ${filesToDelete.length} arquivo(s) serão removidos permanentemente.`)) return;

      const supabase = await createFirebaseSupabaseClient(auth);
      const storagePaths = filesToDelete
        .map((item) => item.data().storagePath)
        .filter((path): path is string => typeof path === 'string');
      for (let index = 0; index < storagePaths.length; index += 100) {
        const { error: storageError } = await supabase.storage
          .from('personal-files')
          .remove(storagePaths.slice(index, index + 100));
        if (storageError) throw new Error(`Não foi possível remover os arquivos do Storage: ${storageError.message}`);
      }

      const docsToDelete = [...filesToDelete, ...foldersToDelete];
      for (let index = 0; index < docsToDelete.length; index += 450) {
        const batch = writeBatch(db);
        docsToDelete.slice(index, index + 450).forEach((item) => batch.delete(item.ref));
        await batch.commit();
      }
      if (activeFolder && folderIds.has(activeFolder)) setActiveFolder(null);
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
      const supabase = await createFirebaseSupabaseClient(auth);
      const { data: existingLink, error: existingError } = await supabase
        .from('teacher_student_links')
        .select('student_id')
        .eq('student_id', user.uid)
        .eq('teacher_id', teacherId)
        .maybeSingle();
      if (existingError) throw new Error(`Falha ao verificar vínculo no Storage: ${existingError.message}`);
      if (!existingLink) {
        const { error: storageLinkError } = await supabase
          .from('teacher_student_links')
          .insert({ student_id: user.uid, teacher_id: teacherId, teacher_code: normalizedCode });
        if (storageLinkError) throw new Error(`Falha ao proteger o vínculo no Storage: ${storageLinkError.message}`);
      }
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
      const subject = subjects.find((item) => item.id === activeSubject);
      const subjectKey = subject ? normalizeSubjectKey(subject.name) : '';
      let sharedTeacherId: string | null = null;
      const linkedTeacherId = profile?.teacherIds?.[0];
      if (subject && subjectKey && linkedTeacherId) {
        const { data: teacherSubject, error: permissionError } = await supabase
          .from('teacher_subjects')
          .select('subject_key')
          .eq('teacher_id', linkedTeacherId)
          .eq('subject_key', subjectKey)
          .maybeSingle();
        if (permissionError) throw new Error(`Não foi possível verificar a matéria do professor: ${permissionError.message}`);
        if (teacherSubject) sharedTeacherId = linkedTeacherId;
      }
      for (const file of Array.from(fileList)) {
        if (storageUsed + file.size > 1024 * 1024 * 1024) {
          throw new Error('O limite gratuito de 1 GB foi atingido.');
        }
        const storagePath = `${user.uid}/${sharedTeacherId || 'private'}/${activeFolder || 'root'}/${Date.now()}-${sanitizeName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from('personal-files')
          .upload(storagePath, file, {
            upsert: false,
            contentType: file.type,
            metadata: {
              teacher_id: sharedTeacherId,
              subject_key: sharedTeacherId ? subjectKey : '',
            },
          });
        if (uploadError) throw new Error(`Supabase Storage (${uploadError.name}): ${uploadError.message}`);
        await setDoc(doc(db, 'files', crypto.randomUUID()), {
          ownerId: user.uid,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
          storagePath,
          folderId: activeFolder,
          subjectId: activeSubject,
          subjectName: subject?.name || null,
          subjectKey: subjectKey || null,
          pageId: null,
          subjectVisibleToTeacher: Boolean(sharedTeacherId && subjectKey),
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

  async function deleteFile(file: FileMetadata) {
    if (!user || file.ownerId !== user.uid) return;
    if (!window.confirm(`Apagar o arquivo “${file.name}” permanentemente?`)) return;
    try {
      const supabase = await createFirebaseSupabaseClient(auth);
      const { error: storageError } = await supabase.storage.from('personal-files').remove([file.storagePath]);
      if (storageError) throw new Error(`Não foi possível apagar o arquivo do Storage: ${storageError.message}`);
      await deleteDoc(doc(db, 'files', file.id));
      setError('Arquivo apagado.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Não foi possível apagar o arquivo.');
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
          <button className={activeSection === 'library' && !activeSubject && !activeFolder ? 'active' : ''} onClick={() => { setActiveSection('library'); setActiveSubject(null); setActiveFolder(null); }} type="button">
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
              <button onClick={() => router.push('/atividades')} type="button"><GraduationCap size={15} /> Minhas atividades <span>{tasks.length}</span></button>
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
            <button className="teacher-sidebar-action" onClick={() => router.push('/professor')} type="button"><GraduationCap size={15} /> Painel do professor</button>
            <button className={`teacher-sidebar-action ${activeSection === 'student-activities' ? 'selected' : ''}`} onClick={() => setActiveSection('student-activities')} type="button"><Users size={15} /> Arquivos por aluno</button>
            <button className="teacher-sidebar-action" disabled={!activeFolder} onClick={() => setShareOpen(true)} type="button"><Link2 size={15} /> Compartilhar pasta</button>
            <label className="teacher-subjects-field">MATÉRIAS QUE LECIONO
              <input value={teacherSubjectsInput} onChange={(event) => setTeacherSubjectsInput(event.target.value)} placeholder="Ex.: Matemática, História" />
            </label>
            <button className="teacher-sidebar-action" onClick={() => void saveTeacherSubjects()} type="button">Salvar matérias</button>
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
      {profile?.profileType === 'teacher' && activeSection === 'student-activities' ? (
        <TeacherStudentActivities
          teacherId={user.uid}
          teacherSubjectKeys={profile.teacherSubjectKeys || []}
          onOpenFile={(file, selectedFiles) => { setViewerFiles(selectedFiles); setViewerFile(file); }}
        />
      ) : <section>
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
            <button className="student-activities-shortcut" onClick={() => router.push('/atividades')} type="button">
              Abrir central de atividades <GraduationCap size={16} />
            </button>
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
              <button className="open-file" type="button" onClick={() => { setViewerFiles(null); setViewerFile(file); }}>Abrir no leitor</button>
              {file.ownerId === user.uid && <button className="delete-file" type="button" onClick={() => void deleteFile(file)} aria-label={`Apagar ${file.name}`}><Trash2 size={14} /> Apagar</button>}
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
      </section>}
      <ClientUniversalFileViewer file={viewerFile} files={viewerFiles || visibleFiles} onClose={() => { setViewerFile(null); setViewerFiles(null); }} onChange={setViewerFile} />
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
