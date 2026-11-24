'use client';

import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { Cloud, FolderPlus, GraduationCap, Link2, LogOut, Plus, UploadCloud, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useFirebaseAuth } from '@/lib/auth-context';
import { getFirebase } from '@/lib/firebase';
import { createFirebaseSupabaseClient } from '@/lib/supabase/firebase';
import type { FileMetadata, Folder, Subject, Task, UserProfile } from '@/lib/models';
import { getLocalAlerts, getLocalSuggestions, getGeminiKey, saveGeminiKey } from '@/lib/ai-service';
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [viewerFile, setViewerFile] = useState<FileMetadata | null>(null);
  const [teacherCode, setTeacherCode] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then((snapshot) => {
      if (snapshot.exists()) setProfile(snapshot.data() as UserProfile);
    });
    setGeminiKey(getGeminiKey(user.uid));
    const filesQuery = query(
      collection(db, 'files'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(filesQuery, (snapshot) => {
      setFiles(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as FileMetadata)));
    }, () => setError('Não foi possível carregar seus arquivos.'));
  }, [db, user]);

  useEffect(() => {
    if (!user) return;
    const subjectsQuery = query(collection(db, 'subjects'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'));
    const subjectsStop = onSnapshot(subjectsQuery, (snapshot) => {
      setSubjects(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Subject)));
    });
    const foldersQuery = query(collection(db, 'folders'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'));
    const foldersStop = onSnapshot(foldersQuery, (snapshot) => {
      setFolders(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Folder)));
    });
    const tasksQuery = query(collection(db, 'tasks'), where('assigneeIds', 'array-contains', user.uid), orderBy('createdAt', 'desc'));
    const tasksStop = onSnapshot(tasksQuery, (snapshot) => {
      setTasks(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Task)));
    });
    return () => { subjectsStop(); foldersStop(); tasksStop(); };
  }, [db, user]);

  const storageUsed = useMemo(
    () => files.reduce((total, file) => total + file.fileSize, 0),
    [files],
  );

  const visibleFiles = useMemo(
    () => activeSubject
      ? files.filter((file) => file.subjectId === activeSubject)
      : files,
    [activeSubject, files],
  );

  const smartAlerts = useMemo(() => getLocalAlerts({
    storageUsedBytes: storageUsed,
    looseFiles: files.filter((file) => !file.folderId && !file.subjectId).length,
    pendingSubmissions: tasks.filter((task) => task.kind === 'submission').length,
    upcomingDeadlines: tasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() - Date.now() < 7 * 86400000).length,
  }), [files, storageUsed, tasks]);

  async function createSubject() {
    if (!user) return;
    const suggestion = getLocalSuggestions('Matéria')[subjects.length % 3];
    await addDoc(collection(db, 'subjects'), {
      ownerId: user.uid,
      name: suggestion.name,
      icon: suggestion.icon,
      color: suggestion.color,
      createdAt: serverTimestamp(),
    });
  }

  async function createFolder() {
    if (!user) return;
    const suggestion = getLocalSuggestions('Pasta')[folders.length % 3];
    await addDoc(collection(db, 'folders'), {
      ownerId: user.uid,
      name: suggestion.name,
      icon: suggestion.icon,
      color: suggestion.color,
      parentId: null,
      private: true,
      sharedWithAccountIds: [],
      subjectId: activeSubject,
      createdAt: serverTimestamp(),
    });
  }

  async function createTask() {
    if (!user) return;
    const title = window.prompt('Título da tarefa');
    if (!title?.trim()) return;
    await addDoc(collection(db, 'tasks'), {
      teacherId: user.uid,
      title: title.trim(),
      description: 'Material ou atividade disponível para a turma.',
      grade: profile?.grade || 'Todas as séries',
      assigneeIds: [],
      kind: 'submission',
      dueAt: null,
      createdAt: serverTimestamp(),
    });
  }

  async function linkTeacher() {
    if (!user || !teacherCode.trim()) return;
    setError('');
    const normalizedCode = teacherCode.trim().toUpperCase();
    const usersQuery = query(collection(db, 'users'), where('teacherCode', '==', normalizedCode));
    const result = await getDocs(usersQuery);
    if (result.empty) {
      setError('Código de professor não encontrado.');
      return;
    }
    const teacher = result.docs[0];
    await updateDoc(doc(db, 'users', user.uid), {
      teacherIds: [...new Set([...(profile?.teacherIds || []), teacher.id])],
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'users', teacher.id), {
      studentIds: [...new Set([...(Array.isArray(teacher.data().studentIds) ? teacher.data().studentIds : []), user.uid])],
      updatedAt: serverTimestamp(),
    });
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
        const storagePath = `${user.uid}/root/${Date.now()}-${sanitizeName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from('personal-files')
          .upload(storagePath, file, { upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;
        await setDoc(doc(db, 'files', crypto.randomUUID()), {
          ownerId: user.uid,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
          storagePath,
          folderId: null,
          subjectId: activeSubject,
          pageId: null,
          subjectVisibleToTeacher: profile?.sharePersonalPagesWithTeacher || false,
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
        <div className="brand-lockup"><span className="brand-glyph">M</span><span>matharq<span className="brand-light">.cloud</span></span></div>
        <nav>
          <button className="active" type="button">Biblioteca</button>
          {subjects.length > 0 && <button type="button" onClick={() => setActiveSubject(null)}>Todas as matérias</button>}
          {subjects.map((subject) => (
            <button key={subject.id} className={activeSubject === subject.id ? 'active' : ''} onClick={() => setActiveSubject(subject.id)} type="button">
              <span>{subject.icon}</span> {subject.name}
            </button>
          ))}
        </nav>
        <button className="logout" onClick={async () => { await signOut(); router.replace('/login'); }} type="button"><LogOut size={16} /> Sair</button>
      </aside>
      <section>
        <header>
          <div><span className="eyebrow">ESPAÇO PESSOAL</span><h1>Olá, {user.displayName || 'Usuário'}.</h1></div>
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
            <button onClick={createSubject} type="button"><Plus size={15} /> Nova matéria</button>
            <button onClick={createFolder} type="button"><FolderPlus size={15} /> Nova pasta</button>
          </div>
        )}
        {profile?.profileType === 'teacher' && (
          <div className="school-tools">
            <button onClick={createFolder} type="button"><FolderPlus size={15} /> Nova pasta/material</button>
            <button type="button"><Users size={15} /> Gerenciar alunos</button>
            <button type="button" onClick={createTask}><Plus size={15} /> Nova tarefa</button>
            <button type="button" onClick={() => setShareOpen(true)}><Link2 size={15} /> Compartilhar</button>
          </div>
        )}
        {profile && (
          <div className="ai-tools">
            <strong>Sugestões locais</strong>
            {getLocalSuggestions(activeSubject ? 'Matéria' : 'Pasta').map((item) => (
              <button key={item.name} type="button" onClick={async () => {
                if (!user) return;
                await addDoc(collection(db, activeSubject ? 'subjects' : 'folders'), activeSubject
                  ? { ownerId: user.uid, name: item.name, icon: item.icon, color: item.color, createdAt: serverTimestamp() }
                  : { ownerId: user.uid, name: item.name, icon: item.icon, color: item.color, parentId: null, private: true, sharedWithAccountIds: [], subjectId: activeSubject, createdAt: serverTimestamp() });
              }}>{item.icon} {item.name}</button>
            ))}
            <label>Gemini BYOK
              <input type="password" value={geminiKey} onChange={(event) => setGeminiKey(event.target.value)} placeholder="Sua chave gratuita" />
            </label>
            <button type="button" onClick={() => {
              try { saveGeminiKey(user!.uid, geminiKey); setError('Chave Gemini salva apenas neste navegador.'); }
              catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a chave.'); }
            }}>Salvar chave</button>
          </div>
        )}
        {error && <p className="auth-message" role="status">{error}</p>}
        <div className="file-grid">
          {visibleFiles.map((file) => (
            <motion.article key={file.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onDoubleClick={() => setViewerFile(file)}>
              <strong>{file.name}</strong><span>{Math.max(1, Math.ceil(file.fileSize / 1024))} KB</span>
              <button className="open-file" type="button" onClick={() => setViewerFile(file)}>Abrir no leitor</button>
            </motion.article>
          ))}
        </div>
      </section>
      <ClientUniversalFileViewer file={viewerFile} files={visibleFiles} onClose={() => setViewerFile(null)} onChange={setViewerFile} />
      <SharePanel
        open={shareOpen}
        ownerId={user.uid}
        targetId={activeSubject || 'root'}
        targetName={subjects.find((subject) => subject.id === activeSubject)?.name || 'Espaço pessoal'}
        onClose={() => setShareOpen(false)}
      />
    </main>
  );
}
