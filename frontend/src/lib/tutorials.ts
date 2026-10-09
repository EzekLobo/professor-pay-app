export type TutorialPlacement = "top" | "right" | "bottom" | "left" | "center";

export type TutorialStep = {
  id: string;
  title: string;
  description: string;
  target?: string;
  placement?: TutorialPlacement;
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
    version: 1,
    steps: [
      { id: "welcome", title: "Sua rotina", description: "Acompanhe suas aulas e seus recebimentos em um só lugar.", placement: "center" },
      { id: "schedule", title: "Agenda de aulas", description: "Veja as aulas organizadas para a semana.", target: '[data-tour="dashboard-schedule"]', placement: "bottom" },
      { id: "lesson-details", title: "Detalhes da aula", description: "Abra uma aula para consultar suas informações.", target: '[data-tour="dashboard-lesson-details"]', placement: "left" },
      { id: "payments", title: "Competências", description: "Confira os valores previstos, recebidos e em atraso.", target: '[data-tour="dashboard-payments"]', placement: "top" },
    ],
  },
  {
    id: "payments",
    pathname: "/payments",
    version: 1,
    steps: [
      { id: "welcome", title: "Pagamentos", description: "Acompanhe suas competências mensais.", placement: "center" },
      { id: "summary", title: "Resumo do período", description: "Veja rapidamente os valores previstos e recebidos.", target: '[data-tour="payments-summary"]', placement: "bottom" },
      { id: "period", title: "Competência selecionada", description: "Consulte as aulas que formam cada competência.", target: '[data-tour="payments-period"]', placement: "bottom" },
      { id: "status", title: "Status do pagamento", description: "Altere o status quando receber ou identificar um atraso.", target: '[data-tour="payments-status"]', placement: "left" },
    ],
  },
  {
    id: "classes",
    pathname: "/classes",
    version: 1,
    steps: [
      { id: "welcome", title: "Turmas", description: "Sincronize e acompanhe suas turmas e alunos.", placement: "center" },
      { id: "sync", title: "Sincronização", description: "Atualize as turmas importadas quando precisar.", target: '[data-tour="classes-sync"]', placement: "bottom" },
      { id: "list", title: "Lista de turmas", description: "Abra uma turma para consultar os alunos e o andamento.", target: '[data-tour="classes-list"]', placement: "top" },
    ],
  },
  {
    id: "lessons",
    pathname: "/lessons",
    version: 1,
    steps: [
      { id: "welcome", title: "Aulas", description: "Encontre materiais e acompanhe os cursos disponíveis.", placement: "center" },
      { id: "import", title: "Importar curso", description: "Importe um curso para disponibilizar seus materiais.", target: '[data-tour="lessons-import"]', placement: "bottom" },
      { id: "courses", title: "Cursos disponíveis", description: "Abra um curso para consultar seus materiais.", target: '[data-tour="lessons-courses"]', placement: "top" },
    ],
  },
  {
    id: "corrections",
    pathname: "/corrections",
    version: 1,
    steps: [
      { id: "welcome", title: "Correções", description: "Organize as atividades que precisam de atenção.", placement: "center" },
      { id: "sync", title: "Sincronização", description: "Atualize as atividades importadas quando precisar.", target: '[data-tour="corrections-sync"]', placement: "bottom" },
      { id: "filters", title: "Filtros", description: "Filtre e agrupe as atividades para encontrar o que procura.", target: '[data-tour="corrections-filters"]', placement: "bottom" },
      { id: "cards", title: "Atividades", description: "Abra uma atividade para conferir os detalhes.", target: '[data-tour="corrections-cards"]', placement: "top" },
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
