'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { requireOwner } from '@/lib/auth';
import { getSupabaseConfig } from '@/lib/supabase/server';

export type DashboardSettings = {
  display_name: string;
  accent_color: string;
};

export type SaveSettingsResult =
  | { status: 'error'; message: string }
  | { status: 'success'; settings: DashboardSettings };

export async function saveDashboardSettings(formData: FormData): Promise<SaveSettingsResult> {
  const displayNameValue = formData.get('displayName');
  const accentColorValue = formData.get('accentColor');
  const displayName =
    typeof displayNameValue === 'string' ? displayNameValue.trim().replace(/\s+/g, ' ') : '';
  const accentColor =
    typeof accentColorValue === 'string' ? accentColorValue.toLowerCase() : '';

  if (displayName.length < 1 || displayName.length > 60) {
    return { status: 'error', message: 'O nome deve ter entre 1 e 60 caracteres.' };
  }
  if (!/^#[0-9a-f]{6}$/.test(accentColor)) {
    return { status: 'error', message: 'Escolha uma cor válida.' };
  }

  const { supabase, user } = await requireOwner();
  const { data, error } = await supabase
    .from('app_settings')
    .upsert(
      {
        owner_id: user.id,
        display_name: displayName,
        accent_color: accentColor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id' },
    )
    .select('display_name, accent_color')
    .single();

  if (error) {
    return { status: 'error', message: `Não foi possível salvar as configurações: ${error.message}` };
  }

  return { status: 'success', settings: data };
}

export type ChangePasswordResult =
  | { status: 'error'; message: string }
  | { status: 'success' };

export async function changePasswordAction(formData: FormData): Promise<ChangePasswordResult> {
  const currentPasswordValue = formData.get('currentPassword');
  const newPasswordValue = formData.get('newPassword');
  const confirmPasswordValue = formData.get('confirmPassword');

  if (
    typeof currentPasswordValue !== 'string' ||
    currentPasswordValue.length < 1 ||
    currentPasswordValue.length > 1024 ||
    typeof newPasswordValue !== 'string' ||
    newPasswordValue.length < 12 ||
    newPasswordValue.length > 128 ||
    typeof confirmPasswordValue !== 'string' ||
    confirmPasswordValue !== newPasswordValue
  ) {
    return {
      status: 'error',
      message: 'Informe a senha atual e uma nova senha de 12 a 128 caracteres, igual nos dois campos.',
    };
  }
  if (currentPasswordValue === newPasswordValue) {
    return { status: 'error', message: 'A nova senha precisa ser diferente da senha atual.' };
  }

  const { supabase, user } = await requireOwner();
  if (!user.email) {
    return { status: 'error', message: 'A conta não possui um e-mail para confirmar a senha atual.' };
  }

  const { url, key } = getSupabaseConfig();
  const passwordCheckClient = createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data: verification, error: verificationError } =
    await passwordCheckClient.auth.signInWithPassword({
      email: user.email,
      password: currentPasswordValue,
    });

  if (verificationError) {
    if (verificationError.status === 400 || verificationError.status === 401) {
      return { status: 'error', message: 'A senha atual está incorreta.' };
    }
    return {
      status: 'error',
      message: `Não foi possível verificar a senha atual: ${verificationError.message}`,
    };
  }
  if (!verification.user || verification.user.id !== user.id) {
    return { status: 'error', message: 'A senha atual está incorreta.' };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPasswordValue });
  if (updateError) {
    return { status: 'error', message: `Não foi possível atualizar a senha: ${updateError.message}` };
  }

  return { status: 'success' };
}
