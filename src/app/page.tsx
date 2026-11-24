'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebaseAuth } from '@/lib/auth-context';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useFirebaseAuth();

  useEffect(() => {
    if (!loading) router.replace(user ? '/dashboard' : '/login');
  }, [loading, router, user]);

  return <main className="auth-loading">Carregando…</main>;
}
