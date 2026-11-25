'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Fingerprint, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { signInAction, verifyMfaAction, type AuthActionResult } from '@/app/login/actions';

type LoginFormProps = {
  accessError: boolean;
  requiresMfa: boolean;
  displayName: string;
  initialChallenge?: { factorId: string; challengeId: string };
};

function getErrorMessage(result: AuthActionResult) {
  return result.status === 'error' ? result.message : '';
}

export function LoginForm({
  accessError,
  requiresMfa,
  displayName,
  initialChallenge,
}: LoginFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState(
    accessError ? 'Esta conta não está autorizada a acessar o espaço.' : '',
  );
  const [challenge, setChallenge] = useState(
    requiresMfa ? initialChallenge : undefined,
  );
  const [welcomeName, setWelcomeName] = useState('');
  const [isWelcoming, setIsWelcoming] = useState(false);

  function showWelcome(name: string) {
    setWelcomeName(name || displayName);
    setIsWelcoming(true);
    window.setTimeout(() => {
      router.replace('/');
      router.refresh();
    }, 1650);
  }

  function handleSignIn(formData: FormData) {
    setErrorMessage('');
    startTransition(async () => {
      const result = await signInAction(formData);
      if (result.status === 'error') {
        setErrorMessage(getErrorMessage(result));
      } else if (result.status === 'mfa') {
        setChallenge({ factorId: result.factorId, challengeId: result.challengeId });
      } else {
        showWelcome(result.displayName);
      }
    });
  }

  function handleVerifyMfa(formData: FormData) {
    if (!challenge) return;
    formData.set('factorId', challenge.factorId);
    formData.set('challengeId', challenge.challengeId);
    setErrorMessage('');
    startTransition(async () => {
      const result = await verifyMfaAction(formData);
      if (result.status === 'error') {
        setErrorMessage(getErrorMessage(result));
      } else if (result.status === 'success') {
        showWelcome(result.displayName);
      } else {
        setErrorMessage('Não foi possível concluir a verificação.');
      }
    });
  }

  return (
    <main className="login-page">
      <div className="login-orbit login-orbit-one" />
      <div className="login-orbit login-orbit-two" />
      <motion.section
        className="login-layout"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.2, 0.75, 0.2, 1] }}
      >
        <div className="login-story">
          <a className="brand-lockup" href="/" aria-label="Viana Cloud">
            <span className="brand-glyph">V</span>
            <span>viana<span className="brand-light">.cloud</span></span>
          </a>
          <div className="story-copy">
            <div className="eyebrow"><span className="live-dot" /> SEU ESPAÇO, SUA NUVEM</div>
            <h1>Um lugar só seu.<br /><span>Em qualquer lugar.</span></h1>
            <p>Arquivos, apresentações e ideias — organizados em um espaço privado feito para acompanhar você.</p>
          </div>
          <div className="login-trust-row">
            <span><ShieldCheck size={15} strokeWidth={1.7} /> Privado por padrão</span>
            <span className="trust-divider" />
            <span>Seus dados, suas regras</span>
          </div>
          <div className="story-glass-card" aria-hidden="true">
            <div className="glass-card-top">
              <span className="glass-card-label">ESPAÇO PESSOAL</span>
              <span className="glass-card-indicator"><i /> ONLINE</span>
            </div>
            <div className="glass-card-art">
              <div className="glass-ring glass-ring-a" />
              <div className="glass-ring glass-ring-b" />
              <div className="glass-core"><Fingerprint size={31} strokeWidth={1.1} /></div>
            </div>
            <div className="glass-card-bottom">
              <span>ACESSO AUTORIZADO</span>
              <span>01 / 01</span>
            </div>
          </div>
        </div>

        <div className="login-panel">
          <div className="login-panel-heading">
            <div className="login-panel-icon">
              {challenge ? <Fingerprint size={20} /> : <LockKeyhole size={19} />}
            </div>
            <span className="eyebrow">ACESSO SEGURO</span>
          </div>
          <h2>{challenge ? 'Confirme sua identidade.' : 'Bem-vindo de volta.'}</h2>
          <p className="login-subtitle">
            {challenge
              ? 'Digite o código de seis dígitos do seu autenticador.'
              : 'Entre para continuar para o seu espaço pessoal.'}
          </p>

          <AnimatePresence mode="wait" initial={false}>
            {challenge ? (
              <motion.form
                key="mfa-form"
                action={handleVerifyMfa}
                className="login-form"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.22 }}
              >
                <label className="field-label" htmlFor="mfa-code">Código do autenticador</label>
                <div className="input-shell">
                  <Fingerprint size={17} aria-hidden="true" />
                  <input
                    autoComplete="one-time-code"
                    autoFocus
                    id="mfa-code"
                    inputMode="numeric"
                    maxLength={8}
                    name="code"
                    pattern="[0-9]{6,8}"
                    placeholder="000 000"
                    required
                    aria-label="Código de autenticação"
                  />
                </div>
                <p className="mfa-hint">O código expira em poucos segundos.</p>
                <button className="login-submit" disabled={isPending} type="submit">
                  {isPending ? 'Verificando…' : 'Confirmar acesso'}
                  <ArrowUpRight size={17} />
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="credentials-form"
                action={handleSignIn}
                className="login-form"
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 14 }}
                transition={{ duration: 0.22 }}
              >
                <label className="field-label" htmlFor="email">E-mail</label>
                <div className="input-shell">
                  <Mail size={17} aria-hidden="true" />
                  <input
                    autoComplete="username"
                    id="email"
                    maxLength={320}
                    name="email"
                    placeholder="voce@exemplo.com"
                    required
                    type="email"
                  />
                </div>
                <div className="field-label-row">
                  <label className="field-label" htmlFor="password">Senha</label>
                  <span className="field-caption">Acesso individual</span>
                </div>
                <div className="input-shell">
                  <LockKeyhole size={17} aria-hidden="true" />
                  <input
                    autoComplete="current-password"
                    id="password"
                    maxLength={1024}
                    name="password"
                    placeholder="Sua senha"
                    required
                    type="password"
                  />
                </div>
                <button className="login-submit" disabled={isPending} type="submit">
                  {isPending ? 'Autenticando…' : 'Entrar no meu espaço'}
                  <ArrowUpRight size={17} />
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          <div aria-live="polite" className="login-error" role="status">
            {errorMessage}
          </div>
          <div className="login-footnote">
            <LockKeyhole size={13} />
            <span>Sessão protegida · Arquivos privados</span>
          </div>
        </div>
      </motion.section>

      <div className="login-footer">
        <span>© {new Date().getFullYear()} MATHARQ CLOUD</span>
        <span>FEITO PARA SER SEU</span>
      </div>

      <AnimatePresence>
        {isWelcoming && (
          <motion.div
            animate={{ opacity: 1 }}
            className="welcome-overlay"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <motion.div
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="welcome-content"
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="welcome-symbol"><ShieldCheck size={25} /></div>
              <span className="eyebrow">IDENTIDADE CONFIRMADA</span>
              <h2>Olá novamente,<br /><span>{welcomeName}</span></h2>
              <p>Seu espaço está pronto.</p>
              <div className="welcome-progress"><i /></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
