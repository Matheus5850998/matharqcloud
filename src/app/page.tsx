import { redirect } from 'next/navigation';
import { Dashboard } from '@/components/Dashboard';
import { requireOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { supabase, user } = await requireOwner();
  const { data: files, error } = await supabase
    .from('files')
    .select('id, name, mime_type, size_bytes, storage_path, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Could not load the file library: ${error.message}`);
  }

  if (!files) {
    redirect('/login');
  }

  const { data: settings, error: settingsError } = await supabase
    .from('app_settings')
    .select('display_name, accent_color')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (settingsError) {
    throw new Error(`Could not load personal settings: ${settingsError.message}`);
  }

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) {
    throw new Error(`Could not load MFA factors: ${factorsError.message}`);
  }
  const hasMfa = factors.totp.some((factor) => factor.status === 'verified');

  const displayName =
    settings?.display_name ||
    (typeof user.user_metadata.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    process.env.NEXT_PUBLIC_DISPLAY_NAME ||
    'Matheus';
  const accentColor = settings?.accent_color || '#65d8aa';

  return (
    <Dashboard
      files={files}
      userId={user.id}
      displayName={displayName}
      accentColor={accentColor}
      hasMfa={hasMfa}
    />
  );
}
