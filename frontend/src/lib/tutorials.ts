export type TutorialPlacement = "top" | "right" | "bottom" | "left" | "center";

export type TutorialStep = {
  id: string;
  title: string;
  description: string;
  items?: readonly { title: string; content: string }[];
  target?: string;
  placement?: TutorialPlacement;
  reveal?: "details" | "show-payments" | "show-all-payments";
};

export type TutorialDefinition = {
  id: string;
  pathname: string;
  version: number;
  steps: readonly TutorialStep[];
};

const tutorials: readonly TutorialDefinition[] = [
  {
    id: "dashboard",
    pathname: "/dashboard",
    version: 3,
    steps: [
      { id: "welcome", title: "Sua rotina", description: "Use o resumo para acompanhar o que acontece na semana.", placement: "center", items: [{ title: "Aulas", content: "Consulte a agenda e abra os detalhes de cada encontro." }, { title: "Competências", content: "Acompanhe os valores previstos, pagos e em atraso." }, { title: "Ajuda", content: "Abra “Como funciona?” novamente quando quiser revisar estas orientações." }] },
      { id: "schedule", title: "Agenda de aulas", description: "A grade reúne seus horários em uma visão semanal.", target: '[data-tour="dashboard-schedule"]', placement: "bottom", items: [{ title: "Navegação", content: "Use as setas para consultar as semanas anterior e seguinte." }, { title: "Semana atual", content: "Volte rapidamente ao período de hoje pelo botão central." }, { title: "Legenda", content: "As cores diferenciam aula, aula extra e horário disponível." }] },
      { id: "lesson-details", title: "Detalhes da aula", description: "Clique em um bloco da grade para abrir as informações correspondentes.", target: '[data-tour="dashboard-lesson-details"]', placement: "left", items: [{ title: "Materiais", content: "Consulte slides, roteiro, atividades e links da aula." }, { title: "Alunos", content: "Veja a lista e o desempenho da turma quando disponível." }, { title: "Anotações", content: "Registre lembretes particulares para retomar depois." }] },
      { id: "payments", title: "Competências mensais", description: "Este painel reúne os valores financeiros de cada competência.", target: '[data-tour="dashboard-payments"]', placement: "top", reveal: "show-payments", items: [{ title: "Previsto", content: "É o valor ainda esperado para o período." }, { title: "Pago", content: "Indica a competência já recebida." }, { title: "Em atraso", content: "Sinaliza um valor que precisa de acompanhamento." }, { title: "Extrato", content: "Clique em uma competência para conferir as aulas que formam o total." }] },
      { id: "payment-visibility", title: "Ocultar ou mostrar valores", description: "Use este controle quando precisar preservar a privacidade financeira na tela.", target: '[data-tour="dashboard-payment-visibility"]', placement: "left", items: [{ title: "Ocultar", content: "Esconde os valores sem apagar nenhuma informação." }, { title: "Mostrar", content: "Exibe novamente as competências financeiras." }, { title: "Preferência", content: "A escolha fica salva neste navegador." }] },
    ],
  },
  {
    id: "payments",
    pathname: "/payments",
    version: 3,
    steps: [
      { id: "welcome", title: "Pagamentos", description: "Nesta tela você confere e atualiza suas competências mensais.", placement: "center", items: [{ title: "Resumo", content: "Veja o total estimado e o total já recebido." }, { title: "Competências", content: "Abra cada período para conferir o extrato das aulas." }, { title: "Status", content: "Atualize uma competência prevista ou em atraso quando necessário." }] },
      { id: "summary", title: "Resumo do período", description: "Os indicadores mostram a situação financeira em poucos segundos.", target: '[data-tour="payments-summary"]', placement: "bottom", items: [{ title: "Estimativa", content: "Soma o que ainda pode ser recebido." }, { title: "Recebido", content: "Soma as competências já marcadas como pagas." }] },
      { id: "period", title: "Competência selecionada", description: "Use os cartões para encontrar e abrir o período que deseja consultar.", target: '[data-tour="payments-period"]', placement: "bottom", items: [{ title: "Abrir extrato", content: "Clique no cartão para listar as aulas e valores do mês." }, { title: "Navegar", content: "Use as setas ou arraste o carrossel para trocar de competência." }] },
      { id: "complete-list", title: "Lista completa das competências", description: "Esta visualização já foi aberta para a demonstração.", target: '[data-tour="payments-view-toggle"]', placement: "left", reveal: "show-all-payments", items: [{ title: "Uma linha por mês", content: "Cada linha representa uma competência e permite abrir seu extrato." }, { title: "Alternar a visualização", content: "O botão destacado volta ao carrossel; use-o novamente para retornar à lista completa." }, { title: "Localizar períodos", content: "A lista é a melhor opção para encontrar rapidamente um mês mais antigo." }] },
      { id: "status", title: "Atualizar o status", description: "Clique na etiqueta para registrar a situação da competência.", target: '[data-tour="payments-status"]', placement: "left", items: [{ title: "Pago", content: "Escolha após confirmar o recebimento." }, { title: "Em atraso", content: "Use quando o prazo passou e o valor segue pendente." }, { title: "Previsto", content: "Representa o valor aguardado antes do recebimento." }] },
    ],
  },
  {
    id: "classes",
    pathname: "/classes",
    version: 2,
    steps: [
      { id: "welcome", title: "Turmas", description: "Sincronize e acompanhe suas turmas e alunos.", placement: "center" },
      { id: "sync", title: "Sincronização", description: "Atualize as turmas importadas quando precisar.", target: '[data-tour="classes-sync"]', placement: "bottom" },
      { id: "list", title: "Lista de turmas", description: "A primeira turma foi expandida para mostrar os alunos e o andamento. Abra as demais turmas quando precisar.", target: '[data-tour="classes-list"]', placement: "top", reveal: "details" },
    ],
  },
  {
    id: "lessons",
    pathname: "/lessons",
    version: 2,
    steps: [
      { id: "welcome", title: "Aulas", description: "Encontre materiais e acompanhe os cursos disponíveis.", placement: "center" },
      { id: "import", title: "Importar curso", description: "Importe um curso para disponibilizar seus materiais.", target: '[data-tour="lessons-import"]', placement: "bottom" },
      { id: "courses", title: "Cursos disponíveis", description: "O primeiro curso foi expandido para você localizar os módulos e abrir os materiais de cada aula.", target: '[data-tour="lessons-courses"]', placement: "top", reveal: "details" },
    ],
  },
  {
    id: "corrections",
    pathname: "/corrections",
    version: 2,
    steps: [
      { id: "welcome", title: "Correções", description: "Organize as atividades que precisam de atenção.", placement: "center" },
      { id: "sync", title: "Sincronização", description: "Atualize as atividades importadas quando precisar.", target: '[data-tour="corrections-sync"]', placement: "bottom" },
      { id: "filters", title: "Filtros", description: "Filtre e agrupe as atividades para encontrar o que procura.", target: '[data-tour="corrections-filters"]', placement: "bottom" },
      { id: "cards", title: "Atividades", description: "A primeira turma foi expandida para mostrar as atividades pendentes. Abra uma atividade para conferir os detalhes e corrigir.", target: '[data-tour="corrections-cards"]', placement: "top", reveal: "details" },
    ],
  },
  {
    id: "data",
    pathname: "/data",
    version: 1,
    steps: [
      { id: "welcome", title: "Seus dados", description: "Mantenha uma cópia segura das suas informações.", placement: "center" },
      { id: "export", title: "Exportar backup", description: "Baixe uma cópia dos seus dados quando quiser.", target: '[data-tour="data-export"]', placement: "bottom" },
      { id: "import", title: "Importar dados", description: "Confira a prévia antes de confirmar uma importação.", target: '[data-tour="data-import"]', placement: "bottom" },
      { id: "delete", title: "Excluir dados", description: "Essa ação é permanente e exige atenção.", target: '[data-tour="data-delete"]', placement: "top" },
    ],
  },
];

export function getTutorialForPathname(pathname: string): TutorialDefinition | null {
  return tutorials.find((tutorial) => tutorial.pathname === pathname) ?? null;
}

export function getRenderableTutorialSteps(
  tutorial: TutorialDefinition,
  targetExists: (selector: string) => boolean,
): TutorialStep[] {
  return tutorial.steps.filter((step) => !step.target || targetExists(step.target));
}

export function tutorialSessionKey(userId: string, tutorial: TutorialDefinition): string {
  return `${userId}:${tutorial.id}:v${tutorial.version}`;
}

export { tutorials };
