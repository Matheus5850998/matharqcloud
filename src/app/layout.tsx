import type { Metadata } from 'next';
import './globals.css';
import { FirebaseAuthProvider } from '@/lib/auth-context';

export const metadata: Metadata = {
  title: 'Viana Cloud',
  description: 'Seu espaço para estudos, arquivos e apresentações.',
  applicationName: 'Viana Cloud',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body><FirebaseAuthProvider>{children}</FirebaseAuthProvider></body>
    </html>
  );
}
