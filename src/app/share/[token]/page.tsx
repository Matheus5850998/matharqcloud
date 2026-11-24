'use client';

import { collection, getDocs, query, where } from 'firebase/firestore';
import { LockKeyhole } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getFirebase } from '@/lib/firebase';
import { useFirebaseAuth } from '@/lib/auth-context';

export default function SharedLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { db } = getFirebase();
  const { loading, user } = useFirebaseAuth();
  const [token, setToken] = useState('');
  const [shareName, setShareName] = useState('');
  const [permission, setPermission] = useState<'read' | 'edit'>('read');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    params.then(({ token: routeToken }) => setToken(routeToken));
  }, [params]);

  useEffect(() => {
    if (!token || loading) return;
    getDocs(query(collection(db, 'shares'), where('token', '==', token), where('active', '==', true)))
      .then((snapshot) => {
        if (snapshot.empty) {
          setNotFound(true);
          return;
        }
        const share = snapshot.docs[0].data();
        setShareName(String(share.targetName || 'Conteúdo compartilhado'));
        setPermission(share.permission === 'edit' ? 'edit' : 'read');
      })
      .catch(() => setNotFound(true));
  }, [db, loading, token]);

  return (
    <main className="shared-link-page">
      <div className="share-card">
        <LockKeyhole size={24} />
        {notFound ? (
          <>
            <h1>Link indisponível.</h1>
            <p>Este link foi desativado ou não existe.</p>
          </>
        ) : (
          <>
            <h1>{shareName || 'Abrindo compartilhamento…'}</h1>
            <p>{permission === 'read' ? 'Somente leitura' : 'Pode editar e enviar arquivos'} · {user ? 'Conta autenticada' : 'Faça login para continuar'}</p>
            {shareName && !user && <a className="share-login" href="/login">Entrar</a>}
          </>
        )}
      </div>
    </main>
  );
}
