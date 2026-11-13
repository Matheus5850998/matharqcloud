'use client';

import { motion } from 'framer-motion';
import { Check, LoaderCircle, Palette, UserRound } from 'lucide-react';
import { useState, useTransition } from 'react';
import {
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
    </motion.section>
  );
}
