'use client';

import { createClient } from '@supabase/supabase-js';
import type { Auth } from 'firebase/auth';

let supabaseWithFirebase: ReturnType<typeof createClient> | null = null;

export async function createFirebaseSupabaseClient(auth: Auth) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const user = auth.currentUser;

  if (!url || !key) {
    throw new Error('As variáveis do Supabase não estão configuradas.');
  }
  if (!user) {
    throw new Error('Faça login antes de acessar arquivos.');
  }

  supabaseWithFirebase ??= createClient(url, key, {
    accessToken: async () => {
      const currentUser = auth.currentUser;
      return currentUser ? currentUser.getIdToken() : null;
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return supabaseWithFirebase;
}
