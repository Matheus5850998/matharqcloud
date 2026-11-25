'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight, Cloud, FileStack, FolderOpen, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type CSSProperties } from 'react';
import { signOutAction } from '@/app/login/actions';
import type { DashboardSettings } from '@/app/dashboard/settings-actions';
import type { FileRecord } from '@/lib/files';
import { FileManager } from './FileManager';
import { MfaSetup } from './MfaSetup';
import { SettingsPanel } from './SettingsPanel';

type DashboardProps = {
  files: FileRecord[];
  userId: string;
  displayName: string;
  accentColor: string;
  hasMfa: boolean;
};

export function Dashboard({
  files,
  userId,
  displayName: initialDisplayName,
  accentColor: initialAccentColor,
  hasMfa,
}: DashboardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeView, setActiveView] = useState<'library' | 'settings'>('library');
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [accentColor, setAccentColor] = useState(initialAccentColor);
  const themeStyle: CSSProperties & { '--user-accent': string } = { '--user-accent': accentColor };
  const totalBytes = files.reduce((total, file) => total + file.size_bytes, 0);
  const storageValue = totalBytes < 1024 * 1024
    ? Math.max(1, Math.round(totalBytes / 1024))
    : (totalBytes / (1024 * 1024)).toFixed(1);
  const storageUnit = totalBytes < 1024 * 1024 ? 'KB' : 'MB';
  const storagePercent = Math.min(100, (totalBytes / (1024 * 1024 * 1024)) * 100);

  function signOut() {
    startTransition(async () => {
      await signOutAction();
      router.replace('/login');
      router.refresh();
    });
  }

  function applySettings(settings: DashboardSettings) {
    setDisplayName(settings.display_name);
    setAccentColor(settings.accent_color);
  }

  return (
    <main className="dashboard-shell" style={themeStyle}>
      <aside className="sidebar">
        <a className="brand-lockup sidebar-brand" href="/" aria-label="Viana Cloud">
          <span className="brand-glyph">V</span>
          <span>viana<span className="brand-light">.cloud</span></span>
        </a>
        <div className="sidebar-label">SEU ESPAÇO</div>
        <nav className="sidebar-nav" aria-label="Navegação principal">
          <button
            aria-current={activeView === 'library' ? 'page' : undefined}
            className={`nav-item${activeView === 'library' ? ' nav-item-active' : ''}`}
            onClick={() => setActiveView('library')}
            type="button"
          >
            <FolderOpen size={17} />
            <span>Biblioteca</span>
            <span className="nav-count">{files.length.toString().padStart(2, '0')}</span>
          </button>
          <button
            aria-current={activeView === 'settings' ? 'page' : undefined}
            className={`nav-item${activeView === 'settings' ? ' nav-item-active' : ''}`}
            onClick={() => setActiveView('settings')}
            type="button"
          >
            <Settings size={17} />
            <span>Configurações</span>
          </button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-security">
          <div className="security-icon"><ShieldCheck size={16} /></div>
          <div>
            <strong>Espaço privado</strong>
            <span>Somente sua conta tem acesso.</span>
          </div>
          <span className="security-live" />
        </div>
        <div className="sidebar-profile">
          <div className="avatar">{displayName.charAt(0).toUpperCase()}</div>
          <div className="profile-copy">
            <strong>{displayName}</strong>
            <span>Proprietário</span>
          </div>
          <button
            aria-label="Sair da conta"
            className="icon-button profile-logout"
            disabled={isPending}
            onClick={signOut}
            title="Sair"
            type="button"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="breadcrumb">
            <span>Espaço pessoal</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{activeView === 'library' ? 'Biblioteca' : 'Configurações'}</strong>
          </div>
          <div className="topbar-actions">
            <span className="secure-badge"><i /> <span>PRIVADO</span></span>
            <MfaSetup enabled={hasMfa} />
            <button className="topbar-logout" disabled={isPending} onClick={signOut} type="button">
              <LogOut size={15} />
              {isPending ? 'Saindo…' : 'Sair'}
            </button>
          </div>
        </header>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="dashboard-content"
          initial={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.65, ease: [0.2, 0.75, 0.2, 1] }}
        >
          {activeView === 'library' ? (
            <>
          <div className="page-intro">
            <div>
              <div className="eyebrow"><span className="live-dot" /> SEU ACERVO PESSOAL</div>
              <h1>Olá, {displayName}<span className="hello-period">.</span></h1>
              <p>Um espaço tranquilo para guardar o que importa.</p>
            </div>
            <div className="intro-mark" aria-hidden="true">
              <div className="intro-mark-ring" />
              <Cloud size={24} strokeWidth={1.4} />
            </div>
          </div>

          <div className="overview-grid">
            <article className="overview-card overview-card-featured">
              <div className="overview-topline">
                <span>ARQUIVOS NO ESPAÇO</span>
                <FileStack size={17} />
              </div>
              <div className="overview-value">{files.length.toString().padStart(2, '0')}</div>
              <div className="overview-foot">
                <span>itens na sua biblioteca</span>
                <span className="overview-dot" />
              </div>
              <div className="card-glow" />
            </article>
            <article className="overview-card">
              <div className="overview-topline">
                <span>ARMAZENAMENTO USADO</span>
                <Cloud size={16} />
              </div>
              <div className="overview-value overview-value-small">
                {storageValue} <small>{storageUnit}</small>
              </div>
              <div className="overview-foot">
                <span>limite por arquivo de 50 MB</span>
                <span className="storage-indicator"><i style={{ width: `${storagePercent}%` }} /></span>
              </div>
            </article>
            <article className="overview-card overview-card-status">
              <div className="overview-topline">
                <span>STATUS DE ACESSO</span>
                <ShieldCheck size={16} />
              </div>
              <div className="status-value"><i /> Protegido</div>
              <div className="overview-foot">
                <span>autenticação ativa</span>
                <span className="status-lock"><ShieldCheck size={13} /></span>
              </div>
            </article>
          </div>

          <FileManager initialFiles={files} userId={userId} />
            </>
          ) : (
            <SettingsPanel
              initialSettings={{ display_name: displayName, accent_color: accentColor }}
              onSaved={applySettings}
            />
          )}

          <footer className="dashboard-footer">
            <span>MATHARQ CLOUD <span className="footer-separator">/</span> ESPAÇO PESSOAL</span>
            <span><ShieldCheck size={13} /> ARQUIVOS PROTEGIDOS POR RLS</span>
          </footer>
        </motion.div>
      </section>
    </main>
  );
}
