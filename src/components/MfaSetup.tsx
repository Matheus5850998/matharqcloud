'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Fingerprint, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState, useTransition } from 'react';
import {
  enrollAuthenticatorAction,
  verifyAuthenticatorAction,
} from '@/app/dashboard/mfa-actions';

type MfaSetupProps = {
  enabled: boolean;
};

type Enrollment = {
  factorId: string;
  uri: string;
  secret: string;
};

export function MfaSetup({ enabled }: MfaSetupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function startEnrollment() {
    setErrorMessage('');
    startTransition(async () => {
      const result = await enrollAuthenticatorAction();
      if (result.status === 'error') {
        setErrorMessage(result.message);
      } else if (result.status === 'setup') {
        setEnrollment(result);
      } else {
        setErrorMessage('Não foi possível iniciar a configuração.');
      }
    });
  }

  function verify(formData: FormData) {
    if (!enrollment) return;
    formData.set('factorId', enrollment.factorId);
    setErrorMessage('');
    startTransition(async () => {
      const result = await verifyAuthenticatorAction(formData);
      if (result.status === 'error') {
        setErrorMessage(result.message);
      } else {
        setEnrollment(null);
        setIsOpen(false);
        window.location.reload();
      }
    });
  }

  async function copySecret() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setErrorMessage('Não foi possível copiar. Anote a chave manualmente.');
    }
  }

  return (
    <>
      <button
        className={`mfa-status-button${enabled ? ' mfa-status-enabled' : ' mfa-status-disabled'}`}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <ShieldCheck size={14} />
        <span>{enabled ? '2FA ATIVO' : 'ATIVAR 2FA'}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            animate={{ opacity: 1 }}
            className="viewer-backdrop mfa-backdrop"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsOpen(false);
            }}
          >
            <motion.section
              animate={{ opacity: 1, y: 0, scale: 1 }}
              aria-labelledby="mfa-title"
              aria-modal="true"
              className="mfa-dialog"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              role="dialog"
              transition={{ duration: 0.25 }}
            >
              <header className="mfa-dialog-header">
                <div className="mfa-title-icon"><Fingerprint size={19} /></div>
                <div>
                  <span className="eyebrow">PROTEÇÃO DA CONTA</span>
                  <h2 id="mfa-title">{enabled ? 'Autenticação em duas etapas' : 'Adicione uma camada extra.'}</h2>
                </div>
                <button aria-label="Fechar" className="viewer-close" onClick={() => setIsOpen(false)} type="button">
                  <X size={18} />
                </button>
              </header>

              <div className="mfa-dialog-content">
                {enabled ? (
                  <div className="mfa-enabled-state">
                    <div className="mfa-success-mark"><Check size={22} /></div>
                    <strong>Autenticador conectado</strong>
                    <p>Além da sua senha, sua conta pede um código temporário do aplicativo autenticador a cada novo login.</p>
                  </div>
                ) : !enrollment ? (
                  <div className="mfa-intro">
                    <p>Use um aplicativo autenticador para gerar códigos temporários e proteger ainda mais o seu espaço.</p>
                    <ol>
                      <li>Abra um autenticador como 1Password, Bitwarden ou Google Authenticator.</li>
                      <li>Escaneie o QR code que será exibido.</li>
                      <li>Confirme com o código gerado pelo aplicativo.</li>
                    </ol>
                    <button className="login-submit mfa-start-button" disabled={isPending} onClick={startEnrollment} type="button">
                      {isPending ? 'Preparando…' : 'Configurar autenticador'}
                      {isPending ? <LoaderCircle className="spin" size={15} /> : <Fingerprint size={16} />}
                    </button>
                  </div>
                ) : (
                  <form action={verify} className="mfa-enrollment">
                    <div className="mfa-qr-wrap">
                      <QRCodeSVG bgColor="#ffffff" fgColor="#10151b" includeMargin level="M" size={166} value={enrollment.uri} />
                    </div>
                    <p>Escaneie este código com seu aplicativo autenticador. Se não puder escanear, use a chave secreta abaixo.</p>
                    <div className="mfa-secret">
                      <code>{enrollment.secret}</code>
                      <button aria-label="Copiar chave secreta" className="icon-button" onClick={() => void copySecret()} type="button">
                        {copied ? <Check size={15} /> : <Copy size={15} />}
                      </button>
                    </div>
                    <label className="field-label" htmlFor="mfa-setup-code">Código de verificação</label>
                    <input
                      autoComplete="one-time-code"
                      autoFocus
                      className="mfa-code-input"
                      id="mfa-setup-code"
                      inputMode="numeric"
                      maxLength={8}
                      name="code"
                      pattern="[0-9]{6,8}"
                      placeholder="000 000"
                      required
                    />
                    <button className="login-submit mfa-start-button" disabled={isPending} type="submit">
                      {isPending ? 'Verificando…' : 'Ativar autenticação'}
                      {isPending ? <LoaderCircle className="spin" size={15} /> : <Check size={16} />}
                    </button>
                  </form>
                )}
                <div aria-live="polite" className="mfa-error" role="status">{errorMessage}</div>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
