import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Matharq Cloud',
  description: 'Seu espaço pessoal para arquivos e apresentações.',
  applicationName: 'Matharq Cloud',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
