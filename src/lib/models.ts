export type ProfileType = 'personal' | 'student' | 'teacher';

export type UserProfile = {
  ownerId: string;
  displayName: string;
  profileType: ProfileType;
  teacherCode: string | null;
  grade: string | null;
  subjectIds: string[];
  teacherIds: string[];
  studentIds: string[];
  teacherSubjects: string[];
  teacherSubjectKeys: string[];
  sharePersonalPagesWithTeacher: boolean;
  storageUsedBytes: number;
};

export type Subject = {
  id: string;
  ownerId: string;
  name: string;
  icon: string;
  color: string;
  createdAt: unknown;
};

export type Folder = {
  id: string;
  ownerId: string;
  name: string;
  icon: string;
  color: string;
  parentId: string | null;
  private: boolean;
  sharedWithAccountIds: string[];
  subjectId: string | null;
  subjectName: string | null;
  subjectKey: string | null;
  createdAt: unknown;
};

export type FileMetadata = {
  id: string;
  ownerId: string;
  name: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  folderId: string | null;
  subjectId: string | null;
  subjectName?: string | null;
  subjectKey?: string | null;
  pageId: string | null;
  subjectVisibleToTeacher: boolean;
  sharedWithAccountIds: string[];
  createdAt: unknown;
};

export type Task = {
  id: string;
  teacherId: string;
  title: string;
  description: string;
  grade: string;
  assigneeIds: string[];
  kind: 'support' | 'submission';
  dueAt: string | null;
  targetType?: 'grade' | 'students' | 'all-linked';
  targetGrade?: string | null;
  editorMode?: 'text' | 'code';
  language?: string | null;
  createdAt: unknown;
};

export type CorrectionMark = {
  start: number;
  end: number;
  wrongText: string;
  correctText: string;
  note: string;
};

export type Submission = {
  id: string;
  taskId: string;
  studentId: string;
  teacherId: string;
  fileId: string | null;
  content: string;
  editorMode: 'text' | 'code';
  language: string | null;
  status: 'Pendente' | 'Em Revisão' | 'Aprovado' | 'Refazer';
  gradeValue: number | null;
  feedback: string;
  corrections: CorrectionMark[];
  correctAnswer: string;
  submittedAt: unknown;
  updatedAt: unknown;
  reviewedAt?: unknown;
};
