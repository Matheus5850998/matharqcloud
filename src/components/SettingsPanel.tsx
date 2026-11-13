'use client';

import { motion } from 'framer-motion';
import { Check, KeyRound, LoaderCircle, Palette, UserRound } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import {
  changePasswordAction,
  saveDashboardSettings,
  type DashboardSettings,
} from '@/app/dashboard/settings-actions';

type SettingsPanelProps = {
  initialSettings: DashboardSettings;
  onSaved: (settings: DashboardSettings) => void;
};

export function SettingsPanel({ initialSettings, onSaved }: SettingsPanelProps) {
  const [displayName, setDisplayName] = useState(initialSettings.display_name);
  const [accentColor, setAccentColor] = useState(initialSettings.accent_color);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [passwordMessage, setPasswordMessage] = useState('');
  const [isPasswordError, setIsPasswordError] = useState(false);
  const [isPasswordPending, startPasswordTransition] = useTransition();
  const passwordForm = useRef<HTMLFormElement>(null);

  function saveSettings(formData: FormData) {
    setMessage('');
    startTransition(async () => {
      const result = await saveDashboardSettings(formData);
      if (result.status === 'error') {
        setIsError(true);
        setMessage(result.message);
        return;
      }

      setIsError(false);
      setMessage('Configurações salvas.');
      setDisplayName(result.settings.display_name);
      setAccentColor(result.settings.accent_color);
      onSaved(result.settings);
    });
  }

  function changePassword(formData: FormData) {
    setPasswordMessage('');
    startPasswordTransition(async () => {
      const result = await changePasswordAction(formData);
      if (result.status === 'error') {
        setIsPasswordError(true);
        setPasswordMessage(result.message);
        return;
      }

      setIsPasswordError(false);
      setPasswordMessage('Senha alterada com sucesso.');
      passwordForm.current?.reset();
    });
  }

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="settings-section"
      initial={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.3 }}
    >
      <div className="section-kicker"><span className="section-kicker-line" /> PERSONALIZAÇÃO</div>
      <h1>Configurações<span className="hello-period">.</span></h1>
      <p className="settings-intro">Personalize a saudação e a cor de destaque do seu espaço.</p>

      <form action={saveSettings} className="settings-form">
        <label className="settings-field">
          <span><UserRound size={15} /> Nome da saudação</span>
          <input
            autoComplete="nickname"
            maxLength={60}
            name="displayName"
            onChange={(event) => setDisplayName(event.target.value)}
            required
            value={displayName}
          />
          <small>Este nome aparecerá no painel e na animação após o login.</small>
        </label>

        <label className="settings-field">
          <span><Palette size={15} /> Cor de destaque</span>
          <div className="settings-color-control">
            <input
              aria-label="Escolher cor de destaque"
              name="accentColor"
              onChange={(event) => setAccentColor(event.target.value)}
              type="color"
              value={accentColor}
            />
            <code>{accentColor.toUpperCase()}</code>
            <span className="settings-color-preview" style={{ backgroundColor: accentColor }} />
          </div>
          <small>A cor será aplicada aos detalhes da interface.</small>
        </label>

        <button className="settings-save-button" disabled={isPending} type="submit">
          {isPending ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
          {isPending ? 'Salvando…' : 'Salvar configurações'}
        </button>
        {message && (
          <p className={isError ? 'settings-message settings-message-error' : 'settings-message'} role={isError ? 'alert' : 'status'}>
            {message}
          </p>
        )}
      </form>

      <section aria-labelledby="password-settings-title" className="settings-password-section">
        <div className="section-kicker"><span className="section-kicker-line" /> SEGURANÇA DA CONTA</div>
        <h2 id="password-settings-title">Alterar senha</h2>
        <p className="settings-intro">Confirme sua senha atual para definir uma nova senha.</p>
        <form action={changePassword} className="settings-form settings-password-form" ref={passwordForm}>
          <label className="settings-field">
            <span><KeyRound size={15} /> Senha atual</span>
            <input
              autoComplete="current-password"
              maxLength={1024}
              name="currentPassword"
              required
              type="password"
            />
          </label>
          <label className="settings-field">
            <span>Nova senha</span>
            <input
              autoComplete="new-password"
              maxLength={128}
              minLength={12}
              name="newPassword"
              required
              type="password"
            />
            <small>Use pelo menos 12 caracteres.</small>
          </label>
          <label className="settings-field">
            <span>Confirmar nova senha</span>
            <input
              autoComplete="new-password"
              maxLength={128}
              minLength={12}
              name="confirmPassword"
              required
              type="password"
            />
          </label>
          <button className="settings-save-button" disabled={isPasswordPending} type="submit">
            {isPasswordPending ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />}
            {isPasswordPending ? 'Atualizando…' : 'Atualizar senha'}
          </button>
          {passwordMessage && (
            <p
              className={isPasswordError ? 'settings-message settings-message-error' : 'settings-message'}
              role={isPasswordError ? 'alert' : 'status'}
            >
              {passwordMessage}
            </p>
          )}
        </form>
      </section>
    </motion.section>
  );
}
