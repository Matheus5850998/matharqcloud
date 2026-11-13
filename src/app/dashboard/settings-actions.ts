'use server';

import { requireOwner } from '@/lib/auth';

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
