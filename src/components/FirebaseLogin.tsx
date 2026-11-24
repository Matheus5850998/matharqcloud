'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { getFirebase, googleProvider } from '@/lib/firebase';

type Mode = 'login' | 'signup';
type ProfileType = 'personal' | 'student' | 'teacher';

export function FirebaseLogin() {
  const router = useRouter();
  const { auth, db } = getFirebase();
  const [mode, setMode] = useState<Mode>('login');
  const [profileType, setProfileType] = useState<ProfileType>('personal');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function ensureProfile(uid: string, displayName: string, preferredType = profileType) {
    const profileRef = doc(db, 'users', uid);
    const existing = await getDoc(profileRef);
    if (!existing.exists()) {
      await setDoc(profileRef, {
        ownerId: uid,
        displayName,
        profileType: preferredType,
        teacherCode: preferredType === 'teacher'
          ? `PROF-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(-4).toUpperCase()}`
          : null,
        subjectIds: [],
        teacherIds: [],
        grade: preferredType === 'student' ? 'Não informado' : null,
        studentIds: preferredType === 'teacher' ? [] : [],
        sharePersonalPagesWithTeacher: false,
        storageUsedBytes: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const name = String(form.get('name') || '').trim();
    try {
      if (mode === 'signup') {
        if (password.length < 12) throw new Error('Use uma senha com pelo menos 12 caracteres.');
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: name });
        await ensureProfile(credential.user.uid, name);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir o acesso.');
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    setMessage('');
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      await ensureProfile(
        credential.user.uid,
        credential.user.displayName || 'Usuário',
        profileType,
      );
      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível entrar com Google.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    const email = (document.querySelector<HTMLInputElement>('#auth-email')?.value || '').trim();
    if (!email) {
      setMessage('Informe seu e-mail para receber o link de recuperação.');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Enviamos um link de recuperação para seu e-mail.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar o e-mail.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <motion.section className="auth-story" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="brand-lockup"><span className="brand-glyph">M</span><span>matharq<span className="brand-light">.cloud</span></span></div>
        <div className="auth-story-copy">
          <span className="eyebrow"><i className="live-dot" /> SUA CENTRAL DE ESTUDOS</span>
          <h1>Organize ideias.<br /><span>Avance com clareza.</span></h1>
          <p>Páginas, matérias, entregas e arquivos em um ambiente seguro feito para alunos e professores.</p>
        </div>
      </motion.section>

      <section className="auth-panel">
        <div className="auth-tabs" role="tablist">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">Entrar</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')} type="button">Criar conta</button>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={mode} initial={{ opacity: 0, x: mode === 'login' ? -12 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <h2>{mode === 'login' ? 'Bem-vindo de volta.' : 'Crie seu espaço.'}</h2>
            <p>{mode === 'login' ? 'Continue de onde parou.' : 'Escolha como você usará a plataforma.'}</p>

            {mode === 'signup' && (
              <div className="profile-options">
                {([
                  ['personal', 'Pessoal'],
                  ['student', 'Aluno'],
                  ['teacher', 'Professor'],
                ] as const).map(([value, label]) => (
                  <button className={profileType === value ? 'active' : ''} key={value} onClick={() => setProfileType(value)} type="button">{label}</button>
                ))}
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <label>Nome completo
                  <div className="input-shell"><UserRound size={17} /><input name="name" maxLength={80} required /></div>
                </label>
              )}
              <label>E-mail
                <div className="input-shell"><Mail size={17} /><input id="auth-email" name="email" type="email" autoComplete="email" required /></div>
              </label>
              <label>Senha
                <div className="input-shell"><LockKeyhole size={17} /><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /><button className="password-toggle" onClick={() => setShowPassword((value) => !value)} type="button" aria-label="Mostrar ou ocultar senha">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
              </label>
              {mode === 'login' && <button className="forgot-button" onClick={handleReset} type="button">Esqueci minha senha</button>}
              <button className="auth-submit" disabled={busy} type="submit">{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}<ArrowRight size={17} /></button>
            </form>

            <button className="google-button" disabled={busy} onClick={handleGoogle} type="button">
              <span className="google-mark">G</span> Continuar com Google
            </button>
            {message && <p className="auth-message" role="status">{message}</p>}
          </motion.div>
        </AnimatePresence>
      </section>
    </main>
  );
}
