import { NextResponse, type NextRequest } from 'next/server';
import { getApiOwner } from '@/lib/auth';
import { STORAGE_BUCKET } from '@/lib/files';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const owner = await getApiOwner();
  if (!owner) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const { supabase, user } = owner;

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
  }

  const { data: file, error: fileError } = await supabase
    .from('files')
    .select('storage_path, name')
    .eq('id', id)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (fileError) {
    return NextResponse.json({ error: 'Não foi possível localizar o arquivo.' }, { status: 500 });
  }
  if (!file) {
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
  }

  const download = request.nextUrl.searchParams.get('download') === '1' ? file.name : undefined;
  const { data, error: signedUrlError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(file.storage_path, 300, download ? { download } : undefined);

  if (signedUrlError) {
    return NextResponse.json({ error: 'Não foi possível abrir o arquivo.' }, { status: 500 });
  }

  return NextResponse.json(
    { url: data.signedUrl },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
