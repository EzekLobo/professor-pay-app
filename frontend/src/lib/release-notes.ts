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
  {
    version: 2026110603, date: "2026-11-06", title: "Créditos e aulas concluídas",
    description: "O modo Alunos carrega os saldos de aulas automaticamente. O percentual resolve a próxima aula pelo catálogo e conta somente as aulas anteriores ou confirmadas como concluídas; ausência de dados deixa de aparecer como zero.",
    href: "/classes", action: "Ver alunos",
  },
  {
    version: 2026110602, date: "2026-11-06", title: "Atualização ao abrir as páginas",
    description: "Tarefas, atividades dos alunos, presença e grade do Resumo consultam os dados ao abrir e voltam a conferir a cada minuto enquanto a página está visível. As respostas atualizam a tela automaticamente.",
    href: "/classes", action: "Abrir turmas",
  },
  {
    version: 2026110601, date: "2026-11-06", title: "Dropdown de filtros e cursos completos",
    description: "O filtro de Alunos e Presença permanece ancorado ao botão no celular, e cursos Roblox sem identificador compartilhado aparecem separados para preservar seus materiais.",
    href: "/classes", action: "Abrir turmas",
  },
  {
    version: 2026110505, date: "2026-11-05", title: "Atividades em ordem cronológica",
    description: "A grade abre nas atividades mais recentes à direita. Role para a esquerda para consultar módulos anteriores.",
    href: "/classes", action: "Ver turmas",
  },
  {
    version: 2026110504, date: "2026-11-05", title: "Atividades e módulos",
    description: "Módulos anteriores aparecem ao continuar a rolagem. Atividades sincronizadas distinguem entrega e correção quando a Kodland informa o estado.",
    href: "/classes", action: "Ver turmas",
  },
  {
    version: 2026110503, date: "2026-11-05", title: "Atividades organizadas por módulo",
    description: "A grade começa pelas aulas recentes, agrupa as atividades e permite carregar módulos anteriores. Tarefas de casa identificadas têm um símbolo próprio.",
    href: "/classes", action: "Ver turmas",
  },
  {
    version: 2026110502, date: "2026-11-05", title: "Atualização da grade visível",
    description: "A data e a hora da última atualização agora aparecem no cabeçalho da grade de horários.",
    href: "/dashboard", action: "Abrir resumo",
  },
  {
    version: 2026110501, date: "2026-11-05", title: "Pagamentos no Resumo",
    description: "As competências mensais voltaram à tela de Resumo, inclusive quando os dados da Kodland estão no navegador.",
    href: "/dashboard", action: "Abrir resumo",
  },
  {
    version: 2026110413, date: "2026-11-04", title: "Percentual do curso pela aula atual",
    description: "O indicador de cada turma agora compara a aula atual com o total de aulas do curso, sem depender da marcação de aula concluída.",
    href: "/classes", action: "Abrir alunos",
  },
  {
    version: 2026110412, date: "2026-11-04", title: "Dados de alunos minimizados",
    description: "Alunos agora mantêm somente nome e sobrenome, telefone e saldo de aulas para a operação. E-mail e dados de responsáveis não são exibidos nem persistidos nos registros de alunos.",
    href: "/classes", action: "Abrir alunos",
  },
  {
    version: 2026110411, date: "2026-11-04", title: "Navegação entre turmas mais simples",
    description: "Ao abrir uma turma na tela de Alunos, a turma que estava aberta é contraída automaticamente.",
    href: "/classes", action: "Abrir alunos",
  },
  {
    version: 2026110410, date: "2026-11-04", title: "Ações da turma em menu suspenso",
    description: "Renomeie ou oculte uma turma pelo menu de três pontos, sem abrir uma janela sobre a tela de Alunos.",
    href: "/classes", action: "Abrir alunos",
  },
  {
    version: 2026110409, date: "2026-11-04", title: "Três formas de acompanhar alunos",
    description: "Escolha Completo, Correções pendentes ou Alunos. Veja o progresso registrado por módulo, a conclusão das aulas sincronizadas e o saldo de aulas ao atualizar os perfis.",
    href: "/classes", action: "Abrir alunos",
  },
  {
    version: 2026110408, date: "2026-11-04", title: "Filtros favoritos",
    description: "Favorite filtros pela estrela para colocá-los no topo. Alunos também permite mostrar somente quem não tem correções pendentes.",
    href: "/classes", action: "Abrir alunos",
  },
  {
    version: 2026110407, date: "2026-11-04", title: "Campos vazios por turma",
    description: "O ícone de olho permite mostrar ou ocultar os campos vazios das atividades em cada turma, mantendo a escolha neste navegador.",
    href: "/classes", action: "Abrir alunos",
  },
  {
    version: 2026110406, date: "2026-11-04", title: "Indicadores compactos nas turmas",
    description: "Alunos e atividades sem corrigir aparecem em indicadores à direita de cada turma. A criação de cursos usa o botão compacto Curso.",
    href: "/classes", action: "Abrir alunos",
  },
  {
    version: 2026110405, date: "2026-11-04", title: "Alunos em uma única grade",
    description: "A aba Alunos reúne ranking, perfil e atividades por turma. Criar grupos e turmas permanece na mesma tela, sem alternar para outra lista.",
    href: "/classes", action: "Abrir alunos",
  },
  {
    version: 2026110404, date: "2026-11-04", title: "Alunos e atividades em uma só tela",
    description: "A tela de Turmas reúne ranking por pontuação e perfil dos alunos, atividades e ferramentas para criar e administrar grupos e turmas próprias e Kodland.",
    href: "/classes", action: "Abrir turmas",
  },
  {
    version: 2026110403, date: "2026-11-04", title: "Chamadas e atualizações mais consistentes",
    description: "A Agenda indica quando o link da chamada está disponível e permite abri-lo com dois cliques ou toques. A rotina verifica extras, presença e gravações por ocorrência, sem atualizar cadastro, disponibilidade ou materiais automaticamente.",
    href: "/dashboard", action: "Abrir Agenda",
  },
  {
    version: 2026110402, date: "2026-11-04", title: "Turmas em um só lugar",
    description: "Alunos, atividades e presença agora ficam juntos na tela de Turmas.",
    href: "/classes", action: "Abrir turmas",
  },
  {
    version: 2026110401, date: "2026-11-04", title: "Notificações mais simples",
    description: "Pendências, alertas anteriores e novidades aparecem em uma lista compacta no sino.",
    href: "/settings#notifications", action: "Configurar notificações",
  },
  {
    version: 2026110302, date: "2026-11-03", title: "Materiais na sincronização",
    description: "A sincronização completa também prepara os materiais das aulas para acesso nas telas.",
    href: "/lessons", action: "Ver aulas",
  },
  {
    version: 2026110301, date: "2026-11-03", title: "Alertas da última aula",
    description: "O sino identifica faltas e atividades não entregues da última aula de cada turma conforme suas regras. Registros desconhecidos aguardam confirmação, e uma turma pendente não bloqueia as demais.",
    href: "/settings#notifications", action: "Revisar alertas",
  },
  {
    version: 2026110101, date: "2026-11-01", title: "Navegação mais compacta",
    description: "No celular, arraste a barra inferior para acessar todas as áreas. Configurações fica no topo, e as novidades agora aparecem no sino de notificações e abrem ao tocar.",
    href: "/settings", action: "Abrir configurações",
  },
  {
    version: 2026103109, date: "2026-10-31", title: "Sincronização conforme a necessidade",
    description: "Presença é consultada após a aula, com até duas tentativas. Atividades atualizam a cada seis horas; turmas e grade, diariamente. As notificações reaproveitam os dados carregados, reduzindo consultas repetidas.",
    href: "/settings#data", action: "Abrir sincronização",
  },
  {
    version: 2026103108, date: "2026-10-31", title: "Menos regravações na sincronização",
    description: "Turmas, alunos, aulas, presença e atividades já atualizados deixam de ser regravados. O andamento mostra alterações confirmadas por lote, e a automática consulta os registros da turma em atualização.",
    href: "/settings#data", action: "Abrir sincronização",
  },
  {
    version: 2026103107, date: "2026-10-31", title: "Sincronização manual com prioridade",
    description: "Novas atualizações automáticas aguardam enquanto você usa a sincronização manual e não entram em uma fila ocupada. A primeira tentativa automática começa após 30 segundos; os intervalos de 5 e 15 minutos foram mantidos.",
    href: "/settings#data", action: "Abrir sincronização",
  },
  {
    version: 2026103106, date: "2026-10-31", title: "Atividades não feitas na mensagem",
    description: "Ao preparar uma mensagem para o responsável, consulte as não entregas confirmadas por módulo e insira a lista sem perder seu texto. O filtro começa no módulo da última aula realizada e também permite escolher todos os módulos.",
    href: "/corrections", action: "Abrir acompanhamento",
  },
  {
    version: 2026103105, date: "2026-10-31", title: "Competências com gesto no celular",
    description: "Arraste o cartão para trocar de competência no Resumo e em Pagamentos. Na grade, atualizar usa um ícone; a data de atualização e a legenda ficam no botão de informações.",
    href: "/dashboard", action: "Abrir resumo",
  },
  {
    version: 2026103104, date: "2026-10-31", title: "Barra compacta de acompanhamento",
    description: "Lista, grade, filtros, busca e atualização ficam na mesma linha. O filtro abre em um modal e a lupa revela o campo de busca quando precisar.",
    href: "/corrections", action: "Abrir acompanhamento",
  },
  {
    version: 2026103103, date: "2026-10-31", title: "Telas mais organizadas no celular",
    description: "Acompanhamento tem filtros alinhados e pendências agrupadas abaixo de cada aluno. Presença, turmas e competências têm itens mais compactos e botões com espaço adequado para toque.",
    href: "/corrections", action: "Abrir acompanhamento",
  },
  {
    version: 2026103102, date: "2026-10-31", title: "Recuperação de telas em caso de falha",
    description: "Se uma tela apresentar uma falha inesperada, você pode tentar novamente ou continuar pelo menu. Registros técnicos ajudam na investigação sem incluir senhas ou conteúdo das mensagens.",
    href: "/dashboard", action: "Abrir resumo",
  },
  {
    version: 2026103101, date: "2026-10-31", title: "Acompanhamento automático da Kodland",
    description: "Com o acesso salvo e a aplicação ativa, presença e atividades são atualizadas automaticamente. O sino reavalia os alertas conforme suas regras, e a mensagem de atividades tem variáveis e prévia.",
    href: "/settings#notifications", action: "Configurar alertas e mensagem",
  },
  {
    version: 2026102902, date: "2026-10-29", title: "Criação de cursos mais compacta",
    description: "Organize módulos e aulas em seções recolhíveis, edite uma aula por vez e mantenha as ações de salvar sempre acessíveis, inclusive no celular.",
    href: "/lessons", action: "Organizar meus cursos",
  },
  {
    version: 2026102901, date: "2026-10-29", title: "Notificações rápidas e contato com responsáveis",
    description: "Consulte alertas recentes em uma lista suspensa no sino. Em Atividades, use o WhatsApp ao lado do aluno para revisar a mensagem e o contato do responsável antes de enviar.",
    href: "/corrections", action: "Abrir atividades",
  },
  { version: 2026102801, date: "2026-10-28", title: "Alertas para acompanhar seus alunos", description: "Ative notificações de faltas e atividades com dados suficientes. O sino leva à pendência para revisar a mensagem ao responsável e registrar o contato.", href: "/settings#notifications", action: "Configurar notificações" },
  { version: 2026102606, date: "2026-10-26", title: "Dados e backup nas Configurações", description: "Encontre sincronização, cópias de segurança e planilhas na seção Dados e backup das Configurações.", href: "/settings#data", action: "Abrir dados e backup" },
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
