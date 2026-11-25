'use server';

import { createClient } from '@/lib/supabase/server';

type MfaActionResult =
  | { status: 'error'; message: string }
  | { status: 'setup'; factorId: string; uri: string; secret: string }
  | { status: 'success' };

async function getOwnerClient() {
  const ownerId = process.env.SUPABASE_OWNER_ID;
  if (!ownerId) {
    throw new Error('SUPABASE_OWNER_ID is not configured.');
  }
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error(`Could not verify the authenticated user: ${error.message}`);
  }
  if (!user || user.id !== ownerId) {
    return null;
  }
  return { supabase, user };
}

export async function enrollAuthenticatorAction(): Promise<MfaActionResult> {
  const current = await getOwnerClient();
  if (!current) {
    return { status: 'error', message: 'Acesso não autorizado.' };
  }

  const { data: factors, error: factorsError } = await current.supabase.auth.mfa.listFactors();
  if (factorsError) {
    throw new Error(`Could not load MFA factors: ${factorsError.message}`);
  }
  if (factors.totp.some((factor) => factor.status === 'verified')) {
    return { status: 'error', message: 'Já existe um autenticador configurado nesta conta.' };
  }

  const { data, error } = await current.supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Viana Cloud',
  });
  if (error) {
    throw new Error(`Could not enroll an authenticator: ${error.message}`);
  }

  return {
    status: 'setup',
    factorId: data.id,
    uri: data.totp.uri,
    secret: data.totp.secret,
  };
}

export async function verifyAuthenticatorAction(formData: FormData): Promise<MfaActionResult> {
  const factorId = formData.get('factorId');
  const code = formData.get('code');
  if (typeof factorId !== 'string' || typeof code !== 'string' || !/^\d{6,8}$/.test(code)) {
    return { status: 'error', message: 'Informe o código de seis dígitos do autenticador.' };
  }

  const current = await getOwnerClient();
  if (!current) {
    return { status: 'error', message: 'Acesso não autorizado.' };
  }

  const { error } = await current.supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return { status: 'error', message: 'Código inválido ou expirado. Tente novamente.' };
  }

  const { data: assurance, error: assuranceError } =
    await current.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) {
    throw new Error(`Could not verify the authentication assurance level: ${assuranceError.message}`);
  }
  if (assurance.currentLevel !== 'aal2') {
    return { status: 'error', message: 'A confirmação adicional não foi concluída.' };
  }

  return { status: 'success' };
}
