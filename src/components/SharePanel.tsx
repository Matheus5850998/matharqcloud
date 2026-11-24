'use client';

import { addDoc, collection, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { Copy, Link2, LockKeyhole, X } from 'lucide-react';
import { useState } from 'react';
import { getFirebase } from '@/lib/firebase';

type Props = {
  open: boolean;
  ownerId: string;
  targetId: string;
  targetName: string;
  onClose: () => void;
};

export function SharePanel({ open, ownerId, targetId, targetName, onClose }: Props) {
  const { db } = getFirebase();
  const [account, setAccount] = useState('');
  const [permission, setPermission] = useState<'read' | 'edit'>('read');
  const [message, setMessage] = useState('');

  async function shareByAccount() {
    if (!account.trim()) return;
    await updateDoc(doc(db, 'folders', targetId), {
      sharedWithAccountIds: [account.trim()],
      updatedAt: serverTimestamp(),
    });
    setMessage(`Compartilhamento enviado para ${account.trim()}.`);
  }

  async function createLink() {
    const token = crypto.randomUUID();
    await addDoc(collection(db, 'shares'), {
      ownerId,
      targetId,
      targetName,
      token,
      permission,
      active: true,
      accountIds: [],
      createdAt: serverTimestamp(),
    });
    const url = `${window.location.origin}/share/${token}`;
    await navigator.clipboard?.writeText(url);
    setMessage(`Link criado e copiado: ${url}`);
  }

  if (!open) return null;
  return (
    <aside className="share-panel">
      <header><div><span className="eyebrow">COMPARTILHAR</span><strong>{targetName}</strong></div><button onClick={onClose} type="button" aria-label="Fechar"><X size={17} /></button></header>
      <label>Conta por e-mail ou username
        <input value={account} onChange={(event) => setAccount(event.target.value)} placeholder="pessoa@exemplo.com" />
      </label>
      <button className="share-action" onClick={shareByAccount} type="button"><LockKeyhole size={15} /> Compartilhar com conta</button>
      <hr />
      <label>Permissão do link
        <select value={permission} onChange={(event) => setPermission(event.target.value as 'read' | 'edit')}>
          <option value="read">Somente leitura</option>
          <option value="edit">Pode editar e enviar</option>
        </select>
      </label>
      <button className="share-action" onClick={createLink} type="button"><Link2 size={15} /><Copy size={15} /> Criar e copiar link</button>
      {message && <p role="status">{message}</p>}
    </aside>
  );
}
