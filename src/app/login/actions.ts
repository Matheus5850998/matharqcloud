'use server';

import { createClient } from '@/lib/supabase/server';

export type AuthActionResult =
  | { status: 'error'; message: string }
  | { status: 'mfa'; factorId: string; challengeId: string }
  | { status: 'success'; displayName: string };

function getOwnerId() {
  const ownerId = process.env.SUPABASE_OWNER_ID;
  if (!ownerId) {
    throw new Error('SUPABASE_OWNER_ID is not configured.');
  }
  return ownerId;
}

async function getDisplayName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; user_metadata: Record<string, unknown> },
) {
  const { data: settings, error } = await supabase
    .from('app_settings')
    .select('display_name')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not load the greeting name: ${error.message}`);
  }

  const fullName = user.user_metadata.full_name;
  return settings?.display_name ||
    (typeof fullName === 'string' && fullName.trim()) ||
    process.env.NEXT_PUBLIC_DISPLAY_NAME ||
    'Matheus';
}

export async function signInAction(formData: FormData): Promise<AuthActionResult> {
  const email = formData.get('email');
  const password = formData.get('password');
  if (
    typeof email !== 'string' ||
    email.length > 320 ||
    typeof password !== 'string' ||
    password.length < 1 ||
    password.length > 1024
  ) {
    return { status: 'error', message: 'E-mail ou senha inválidos.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) {
    return { status: 'error', message: 'Não foi possível autenticar. Confira suas credenciais.' };
  }

  if (data.user.id !== getOwnerId()) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      throw new Error(`Could not end an unauthorized session: ${signOutError.message}`);
    }
    return { status: 'error', message: 'Acesso não autorizado.' };
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) {
    throw new Error(`Could not verify the authentication assurance level: ${assuranceError.message}`);
  }

  if (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      throw new Error(`Could not load MFA factors: ${factorsError.message}`);
    }
    const factor = factors.totp.find((item) => item.status === 'verified');
    if (!factor) {
      return { status: 'error', message: 'Configure seu autenticador na conta Supabase e tente novamente.' };
    }
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: factor.id,
    });
    if (challengeError) {
      throw new Error(`Could not start MFA verification: ${challengeError.message}`);
    }
    return { status: 'mfa', factorId: factor.id, challengeId: challenge.id };
  }

  return { status: 'success', displayName: await getDisplayName(supabase, data.user) };
}

export async function verifyMfaAction(formData: FormData): Promise<AuthActionResult> {
  const factorId = formData.get('factorId');
  const challengeId = formData.get('challengeId');
  const code = formData.get('code');
  if (
    typeof factorId !== 'string' ||
    typeof challengeId !== 'string' ||
    typeof code !== 'string' ||
    !/^\d{6,8}$/.test(code)
  ) {
    return { status: 'error', message: 'Informe o código do autenticador.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
  if (error) {
    return { status: 'error', message: 'Código inválido ou expirado. Tente novamente.' };
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw new Error(`Could not verify the MFA session: ${userError.message}`);
  }
  if (!user || user.id !== getOwnerId()) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      throw new Error(`Could not end an unauthorized session: ${signOutError.message}`);
    }
    return { status: 'error', message: 'Acesso não autorizado.' };
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) {
    throw new Error(`Could not verify the authentication assurance level: ${assuranceError.message}`);
  }
  if (assurance.currentLevel !== 'aal2') {
    return { status: 'error', message: 'A verificação adicional não foi concluída.' };
  }

  return { status: 'success', displayName: await getDisplayName(supabase, user) };
}

export async function signOutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(`Could not sign out: ${error.message}`);
  }
}
