'use client';

import { createClient } from '@supabase/supabase-js';
import type { Auth } from 'firebase/auth';

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type FirebaseSupabaseDatabase = {
  public: {
    Tables: {
      teacher_directory: Table<
        { teacher_id: string; teacher_code: string; updated_at: string },
        { teacher_id: string; teacher_code: string; updated_at?: string }
      >;
      teacher_student_links: Table<
        { student_id: string; teacher_id: string; teacher_code: string | null; created_at: string },
        { student_id: string; teacher_id: string; teacher_code?: string | null; created_at?: string }
      >;
      teacher_subjects: Table<
        { teacher_id: string; subject_key: string; subject_name: string; created_at: string },
        { teacher_id: string; subject_key: string; subject_name: string; created_at?: string }
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let supabaseWithFirebase: ReturnType<typeof createClient<FirebaseSupabaseDatabase>> | null = null;

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

  supabaseWithFirebase ??= createClient<FirebaseSupabaseDatabase>(url, key, {
    accessToken: async () => {
      const currentUser = auth.currentUser;
      return currentUser ? currentUser.getIdToken() : null;
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return supabaseWithFirebase;
}
