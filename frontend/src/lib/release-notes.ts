export type ReleaseNote = {
  version: number;
  date: string;
  title: string;
  description: string;
  href: string;
  action: string;
};

/** Published features only. Add new entries with a strictly increasing version. */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  { version: 2026102801, date: "2026-10-28", title: "Alertas para acompanhar seus alunos", description: "Ative notificações de faltas e atividades com dados suficientes. O sino leva à pendência para revisar a mensagem ao responsável e registrar o contato.", href: "/settings#notifications", action: "Configurar notificações" },
  { version: 2026102606, date: "2026-10-26", title: "Dados e backup nas Configurações", description: "Encontre sincronização, cópias de segurança e planilhas na seção Dados e backup das Configurações.", href: "/settings#data", action: "Abrir dados e backup" },
  {
    version: 2026102902, date: "2026-10-29", title: "Criação de cursos mais compacta",
    description: "Organize módulos e aulas em seções recolhíveis, edite uma aula por vez e mantenha as ações de salvar sempre acessíveis, inclusive no celular.",
    href: "/lessons", action: "Organizar meus cursos",
  },
  {
    version: 2026102901, date: "2026-10-29", title: "Notificações rápidas e contato com responsáveis",
    description: "Consulte novidades em uma lista suspensa no sino. Em Atividades, use o WhatsApp ao lado do aluno para revisar a mensagem e o contato do responsável antes de enviar.",
    href: "/corrections", action: "Abrir atividades",
  },
  {
    version: 2026102605, date: "2026-10-26", title: "Personalize as listas das suas tarefas",
    description: "Escolha os nomes e a quantidade de listas. Crie, reordene, arquive ou exclua listas; ao excluir, você decide o destino das tarefas.",
    href: "/tasks", action: "Organizar minhas listas",
  },
  {
    version: 2026102604, date: "2026-10-26", title: "Organize suas tarefas em um quadro",
    description: "Crie tarefas e problemas com prioridade, prazo e checklist. Mova entre etapas, arquive o que terminou e encontre Tarefas em Mais no celular.",
    href: "/tasks", action: "Abrir minhas tarefas",
  },
  {
    version: 2026102603, date: "2026-10-26", title: "Configurações separadas por assunto",
    description: "Use o menu interno para acessar conta, aulas e pagamentos, mensagens, integrações e disponibilidade. Cada seção tem suas próprias ações de salvar.",
    href: "/settings", action: "Abrir configurações",
  },
  {
    version: 2026102602, date: "2026-10-26", title: "Fique por dentro das novidades",
    description: "Ao entrar, você verá as melhorias que ainda não conhece. Use Novidades no cabeçalho para consultar o histórico.",
    href: "/dashboard", action: "Ir para o resumo",
  },
  {
    version: 2026102601, date: "2026-10-26", title: "Entre com um nick",
    description: "Defina um nick único nas Configurações e use no lugar do e-mail para fazer login.",
    href: "/settings", action: "Definir meu nick",
  },
  {
    version: 2026102503, date: "2026-10-25", title: "Folha oficial da Kodland nos pagamentos",
    description: "A sincronização importa a folha disponível da Kodland. O extrato distingue valores contabilizados, previstos e situações das aulas.",
    href: "/payments", action: "Ver pagamentos",
  },
  {
    version: 2026102502, date: "2026-10-25", title: "Foque nas atividades pendentes",
    description: "A visualização compacta de Acompanhamento mostra apenas alunos e atividades com pendências. Você pode alternar para todos os alunos.",
    href: "/corrections", action: "Abrir acompanhamento",
  },
  {
    version: 2026102501, date: "2026-10-25", title: "Dados e backup mais organizados",
    description: "Sincronização, backup completo e planilhas têm espaços próprios, com opções de importação e exportação mais fáceis de encontrar.",
    href: "/data", action: "Abrir dados e backup",
  },
];

export function releaseCursor(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function unreadReleaseNotes(seen: number, notes: readonly ReleaseNote[] = RELEASE_NOTES) {
  return notes.filter((note) => note.version > releaseCursor(seen)).sort((left, right) => right.version - left.version);
}

export function latestReleaseVersion(notes: readonly ReleaseNote[] = RELEASE_NOTES) {
  return notes.reduce((latest, note) => Math.max(latest, note.version), 0);
}

export type ReleaseNotesStore = {
  load(userId: string): Promise<number>;
  markSeen(userId: string, version: number): Promise<void>;
};
