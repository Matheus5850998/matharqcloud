import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export function isMissingAuthSession(error: { name: string } | null) {
  return error?.name === 'AuthSessionMissingError';
}

export async function requireOwner() {
  const ownerId = process.env.SUPABASE_OWNER_ID;
  if (!ownerId) {
    throw new Error('SUPABASE_OWNER_ID is not configured.');
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error && !isMissingAuthSession(error)) {
    throw new Error(`Could not verify the authenticated user: ${error.message}`);
  }
  if (!user) {
    redirect('/login');
  }
  if (user.id !== ownerId) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      throw new Error(`Could not end an unauthorized session: ${signOutError.message}`);
    }
    redirect('/login?error=access');
  }

  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) {
    throw new Error(`Could not verify the authentication assurance level: ${assuranceError.message}`);
  }
  if (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
    redirect('/login?mfa=required');
  }

  return { supabase, user };
}

export async function getApiOwner() {
  const ownerId = process.env.SUPABASE_OWNER_ID;
  if (!ownerId) {
    throw new Error('SUPABASE_OWNER_ID is not configured.');
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error && !isMissingAuthSession(error)) {
    throw new Error(`Could not verify the authenticated user: ${error.message}`);
  }
  if (!user || user.id !== ownerId) {
    return null;
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) {
    throw new Error(`Could not verify the authentication assurance level: ${assuranceError.message}`);
  }
  if (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
    return null;
  }

  return { supabase, user };
}
