'use client';

import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { BookOpen, ChevronRight, Files, GraduationCap, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getFirebase } from '@/lib/firebase';
import type { FileMetadata, Subject, UserProfile } from '@/lib/models';
import { normalizeSubjectKey } from '@/lib/subjects';

type Student = { uid: string; displayName: string; grade: string };

type Props = {
  teacherId: string;
  teacherSubjectKeys: string[];
  onOpenFile: (file: FileMetadata, files: FileMetadata[]) => void;
};

export function TeacherStudentActivities({ teacherId, teacherSubjectKeys, onOpenFile }: Props) {
  const { db } = getFirebase();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentSubjects, setStudentSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [studentFiles, setStudentFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => onSnapshot(
    query(collection(db, 'teacherLinks'), where('teacherId', '==', teacherId)),
    async (snapshot) => {
      try {
        const linkedStudents = await Promise.all(snapshot.docs.map(async (link) => {
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
        setStudents(linkedStudents.filter((student): student is Student => student !== null));
        setError('');
      } catch {
        setError('Não foi possível carregar os alunos vinculados.');
      } finally {
        setLoading(false);
      }
    },
    () => {
      setError('Não foi possível carregar os vínculos dos alunos.');
      setLoading(false);
    },
  ), [db, teacherId]);

  const gradeGroups = useMemo(() => {
    const groups = new Map<string, Student[]>();
    for (const student of students) {
      groups.set(student.grade, [...(groups.get(student.grade) || []), student]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [students]);

  const gradeStudents = students.filter((student) => student.grade === selectedGrade);

  async function selectStudent(student: Student) {
    setSelectedStudent(student);
    setSelectedSubject(null);
    setStudentFiles([]);
    setLoading(true);
    setError('');
    try {
      const snapshot = await getDocs(query(collection(db, 'subjects'), where('ownerId', '==', student.uid)));
      const allowedKeys = new Set(teacherSubjectKeys);
      setStudentSubjects(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as Subject))
        .filter((subject) => allowedKeys.has(normalizeSubjectKey(subject.name))));
    } catch {
      setError('Não foi possível carregar as matérias deste aluno.');
    } finally {
      setLoading(false);
    }
  }

  async function selectSubject(subject: Subject) {
    if (!selectedStudent) return;
    setSelectedSubject(subject);
    setLoading(true);
    setError('');
    try {
      const snapshot = await getDocs(query(
        collection(db, 'files'),
        where('ownerId', '==', selectedStudent.uid),
        where('subjectId', '==', subject.id),
        where('subjectVisibleToTeacher', '==', true),
      ));
      setStudentFiles(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as FileMetadata)));
    } catch {
      setError('Não foi possível carregar os arquivos desta matéria.');
    } finally {
      setLoading(false);
    }
  }

  function backToGrades() {
    setSelectedGrade('');
    setSelectedStudent(null);
    setStudentSubjects([]);
    setSelectedSubject(null);
    setStudentFiles([]);
  }

  function backToStudents() {
    setSelectedStudent(null);
    setStudentSubjects([]);
    setSelectedSubject(null);
    setStudentFiles([]);
  }

  function backToSubjects() {
    setSelectedSubject(null);
    setStudentFiles([]);
  }

  return (
    <section className="student-activity-page">
      <header className="student-activity-header">
        <div>
          <span className="eyebrow">ESPAÇO DOCENTE</span>
          <h1>Arquivos por aluno</h1>
          <p>Consulte os arquivos da turma, separados por série, aluno e matéria.</p>
        </div>
        <div className="student-activity-count"><UsersCount />{students.length} aluno(s)</div>
      </header>

      <nav className="activity-breadcrumbs" aria-label="Navegação das atividades">
        <button type="button" onClick={backToGrades} className={!selectedGrade ? 'current' : ''}>Séries</button>
        {selectedGrade && <><ChevronRight size={14} /><button type="button" onClick={backToStudents} className={!selectedStudent ? 'current' : ''}>{selectedGrade}</button></>}
        {selectedStudent && <><ChevronRight size={14} /><button type="button" onClick={backToSubjects} className={!selectedSubject ? 'current' : ''}>{selectedStudent.displayName}</button></>}
        {selectedSubject && <><ChevronRight size={14} /><span className="current">{selectedSubject.name}</span></>}
      </nav>

      {error && <p className="auth-message dashboard-error" role="alert">{error}</p>}
      {loading && <div className="activity-loading">Carregando…</div>}

      {!loading && !selectedGrade && (
        <div className="activity-card-grid">
          {gradeGroups.map(([grade, gradeStudents]) => (
            <motion.button className="activity-selection-card" key={grade} onClick={() => setSelectedGrade(grade)} type="button" whileHover={{ y: -3 }}>
              <span className="activity-card-icon"><GraduationCap size={21} /></span>
              <strong>{grade}</strong>
              <span>{gradeStudents.length} aluno(s)</span>
              <ChevronRight className="activity-card-arrow" size={17} />
            </motion.button>
          ))}
          {gradeGroups.length === 0 && <div className="activity-empty"><UserRound size={23} /><strong>Nenhum aluno vinculado</strong><span>Quando seus alunos se vincularem, eles aparecerão aqui por série.</span></div>}
        </div>
      )}

      {!loading && selectedGrade && !selectedStudent && (
        <div className="activity-card-grid">
          {gradeStudents.map((student) => (
            <motion.button className="activity-selection-card" key={student.uid} onClick={() => void selectStudent(student)} type="button" whileHover={{ y: -3 }}>
              <span className="activity-card-icon"><UserRound size={20} /></span>
              <strong>{student.displayName}</strong>
              <span>{student.grade}</span>
              <ChevronRight className="activity-card-arrow" size={17} />
            </motion.button>
          ))}
          {gradeStudents.length === 0 && <div className="activity-empty"><UserRound size={23} /><strong>Nenhum aluno nesta série</strong><span>Volte para escolher outra série.</span></div>}
        </div>
      )}

      {!loading && selectedStudent && !selectedSubject && (
        <div className="activity-card-grid">
          {studentSubjects.map((subject) => (
            <motion.button className="activity-selection-card" key={subject.id} onClick={() => void selectSubject(subject)} type="button" whileHover={{ y: -3 }}>
              <span className="activity-card-icon"><BookOpen size={20} /></span>
              <strong>{subject.name}</strong>
              <span>Matéria lecionada por você</span>
              <ChevronRight className="activity-card-arrow" size={17} />
            </motion.button>
          ))}
          {studentSubjects.length === 0 && <div className="activity-empty"><BookOpen size={23} /><strong>Nenhuma matéria disponível</strong><span>Este aluno ainda não cadastrou matérias que você leciona.</span></div>}
        </div>
      )}

      {!loading && selectedSubject && (
        <div className="student-file-list">
          {studentFiles.map((file) => (
            <article key={file.id}>
              <span className="activity-card-icon"><Files size={19} /></span>
              <div><strong>{file.name}</strong><span>{Math.max(1, Math.ceil(file.fileSize / 1024))} KB</span></div>
              <button type="button" onClick={() => onOpenFile(file, studentFiles)}>Abrir arquivo</button>
            </article>
          ))}
          {studentFiles.length === 0 && <div className="activity-empty"><Files size={23} /><strong>Nenhum arquivo nesta matéria</strong><span>Os arquivos que o aluno compartilhar aparecerão aqui.</span></div>}
        </div>
      )}
    </section>
  );
}

function UsersCount() {
  return <UserRound size={15} aria-hidden="true" />;
}
