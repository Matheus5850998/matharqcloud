import { NextResponse, type NextRequest } from 'next/server';
import { getApiOwner } from '@/lib/auth';
import { STORAGE_BUCKET } from '@/lib/files';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const requestHost =
    request.headers.get('x-forwarded-host')?.split(',')[0].trim() ||
    request.headers.get('host');
  const requestProtocol =
    request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
    request.nextUrl.protocol.replace(/:$/, '');
  if (!origin || !requestHost) return false;

  try {
    const parsedOrigin = new URL(origin);
    return (
      ['http:', 'https:'].includes(parsedOrigin.protocol) &&
      parsedOrigin.host.toLowerCase() === requestHost.toLowerCase() &&
      parsedOrigin.protocol === `${requestProtocol.toLowerCase()}:`
    );
  } catch {
    return false;
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Solicitação não autorizada.' }, { status: 403 });
  }

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
    .select('storage_path')
    .eq('id', id)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (fileError) {
    return NextResponse.json({ error: 'Não foi possível localizar o arquivo.' }, { status: 500 });
  }
  if (!file) {
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
  }

  const { error: storageError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([file.storage_path]);
  if (storageError) {
    return NextResponse.json({ error: 'Não foi possível remover o arquivo do armazenamento.' }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from('files')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id);
  if (deleteError) {
    return NextResponse.json({ error: 'O arquivo foi removido, mas os metadados não puderam ser atualizados.' }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
