import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { isMissingAuthSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type LoginPageProps = {
  searchParams: Promise<{ error?: string; mfa?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error && !isMissingAuthSession(error)) {
    throw new Error(`Could not verify the current session: ${error.message}`);
  }

  const ownerId = process.env.SUPABASE_OWNER_ID;
  const isOwner = Boolean(user && user.id === ownerId);
  let initialChallenge: { factorId: string; challengeId: string } | undefined;

  if (isOwner) {
    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) {
      throw new Error(`Could not verify the authentication assurance level: ${assuranceError.message}`);
    }

    if (assurance.currentLevel === 'aal2' && assurance.nextLevel === 'aal2') {
      redirect('/');
    }

    if (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) {
        throw new Error(`Could not load MFA factors: ${factorsError.message}`);
      }
      const factor = factors.totp.find((item) => item.status === 'verified');
      if (!factor) {
        throw new Error('The account requires MFA but has no verified authenticator factor.');
      }
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });
      if (challengeError) {
        throw new Error(`Could not start MFA verification: ${challengeError.message}`);
      }
      initialChallenge = { factorId: factor.id, challengeId: challenge.id };
    }
  }

  return (
    <LoginForm
      accessError={params.error === 'access'}
      requiresMfa={Boolean(initialChallenge)}
      initialChallenge={initialChallenge}
      displayName={
        isOwner && typeof user?.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : process.env.NEXT_PUBLIC_DISPLAY_NAME || 'Matheus'
      }
    />
  );
}
