export type NameSuggestion = {
  name: string;
  icon: string;
  color: string;
  label: string;
};

export type SmartAlert = {
  id: string;
  title: string;
  detail: string;
  action: string;
  tone: 'amber' | 'critical' | 'neutral';
};

export function getLocalSuggestions(context: string): NameSuggestion[] {
  const suggestions: Record<string, NameSuggestion[]> = {
    Matéria: [
      { name: 'Laboratório de Estudos', icon: '🧪', color: '#6D9BFF', label: 'Azul acadêmico' },
      { name: 'Plano de Aprendizagem', icon: '📚', color: '#8E78F0', label: 'Violeta suave' },
      { name: 'Caderno de Projetos', icon: '✦', color: '#4FAF8D', label: 'Verde intelectual' },
    ],
    Pasta: [
      { name: 'Arquivos Essenciais', icon: '📁', color: '#5F9EA0', label: 'Azul petróleo' },
      { name: 'Trabalho Organizado', icon: '🗂️', color: '#D39A57', label: 'Âmbar sóbrio' },
      { name: 'Revisão Atual', icon: '✓', color: '#7A93AC', label: 'Cinza azulado' },
    ],
  };
  return suggestions[context] || suggestions.Pasta;
}

export function getLocalAlerts(input: {
  storageUsedBytes: number;
  looseFiles: number;
  pendingSubmissions: number;
  upcomingDeadlines: number;
}): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  const percent = input.storageUsedBytes / (1024 * 1024 * 1024);
  if (percent >= 0.9) {
    alerts.push({ id: 'storage-critical', title: 'Armazenamento quase cheio', detail: 'O espaço está acima de 90%.', action: 'Liberar espaço', tone: 'critical' });
  } else if (percent >= 0.75) {
    alerts.push({ id: 'storage-warning', title: 'Armazenamento em 75%', detail: 'Considere organizar ou remover arquivos antigos.', action: 'Organizar arquivos', tone: 'amber' });
  }
  if (input.looseFiles > 0) {
    alerts.push({ id: 'loose-files', title: `${input.looseFiles} arquivo(s) fora de pastas`, detail: 'Organize-os antes de perder o contexto.', action: 'Organizar agora', tone: 'neutral' });
  }
  if (input.pendingSubmissions > 0) {
    alerts.push({ id: 'review', title: `${input.pendingSubmissions} entrega(s) para revisar`, detail: 'Há trabalhos aguardando sua avaliação.', action: 'Abrir fila', tone: 'neutral' });
  }
  if (input.upcomingDeadlines > 0) {
    alerts.push({ id: 'deadline', title: `${input.upcomingDeadlines} prazo(s) próximo(s)`, detail: 'Confira os trabalhos com vencimento breve.', action: 'Ver prazos', tone: 'amber' });
  }
  return alerts;
}

export function saveGeminiKey(uid: string, key: string) {
  if (!key.trim()) throw new Error('Informe uma chave válida.');
  localStorage.setItem(`gemini-key:${uid}`, key.trim());
}

export function getGeminiKey(uid: string) {
  return localStorage.getItem(`gemini-key:${uid}`) || '';
}
