import { calculateDashboard, type DashboardLesson, type DashboardPayment, type DashboardResponse, type KodlandAvailability, type KodlandExtraLesson, type KodlandGroup, type KodlandLesson, type KodlandReview, type KodlandStudent } from "./api";
import type { CustomHoliday } from "./holidays";
import type { ManualActivity, ManualLessonContent } from "./manual-pedagogy";
import type { KodlandClassSettings, ManualClass, ManualStudent } from "./manual-teaching";
import type { RatePeriod } from "./teaching-finance";

/** Public, synthetic snapshot. Never reads a teacher account or the Kodland API. */
export type DemoSnapshot = {
  today: string;
  groups: KodlandGroup[];
  students: KodlandStudent[];
  lessons: KodlandLesson[];
  extras: KodlandExtraLesson[];
  reviews: KodlandReview[];
  availability: KodlandAvailability[];
  paymentStatus: Record<string, "RECEIVED" | "OVERDUE">;
  financialStatus: Record<string, string>;
  additionalExtras: DashboardLesson[];
  manualClasses: ManualClass[];
  manualStudents: ManualStudent[];
  manualLessons: ManualLessonContent[];
  manualActivities: ManualActivity[];
  defaultRateHistory: RatePeriod[];
  kodlandSettings: KodlandClassSettings[];
  paymentSnapshots: Record<string, DashboardPayment>;
};
const iso = (date: Date) => date.toISOString().slice(0, 10);
export function demoToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function createDemoSnapshot(): DemoSnapshot {
  const today = demoToday();
  const reference = new Date(`${today}T12:00:00Z`);
  const monday = new Date(reference);
  monday.setUTCDate(reference.getUTCDate() - (reference.getUTCDay() + 6) % 7);
  const day = (offset: number) => { const value = new Date(monday); value.setUTCDate(value.getUTCDate() + offset); return iso(value); };
  const courses = ["Programação com Python [8 L] [90 min]", "Desenvolvimento de jogos [8 L] [90 min]", "Design digital [8 L] [90 min]"];
  const names = ["Luna Ribeiro", "Caio Monteiro", "Sofia Almeida", "Theo Martins", "Ana Costa", "Miguel Souza", "Bia Ferreira", "Pedro Lima", "Clara Dias", "Davi Rocha", "Alice Santos", "Leo Oliveira"];
  const groups: KodlandGroup[] = courses.map((course, index) => ({ id: `demo-group-${index}`, external_id: `demo-group-${index}`, title: ["DEMO_PY_SEG-19", "DEMO_GAME_TER-20", "DEMO_DESIGN_QUI-19"][index], course_id: `demo-course-${index}`, course_name: course, student_count: 4, start_date: `${day([0, 1, 3][index] - 28)}T${index === 1 ? "20:00" : "19:00"}:00`, next_lesson_date: `${day([0, 1, 3][index])}T${index === 1 ? "20:00" : "19:00"}:00`, next_lesson_number: 5, next_lesson_id: `demo-lesson-${index}-4`, archived: false, local_class_id: null, created_at: today }));
  const students: KodlandStudent[] = names.map((name, index) => ({ id: `demo-student-${index}`, external_id: `demo-student-${index}`, name, email: `aluno${index + 1}@example.test`, phone: "", status: "Admitted", progress_summary: `${940 - index * 37} / 1200`, profile_url: "", external_class_id: groups[Math.floor(index / 4)].external_id, external_class_name: groups[Math.floor(index / 4)].title, local_note: "", guardian_name: `Responsável de ${name.split(" ")[0]}`, guardian_relationship: "Responsável", guardian_phone: "", guardian_email: `responsavel${index + 1}@example.test`, guardian_note: "Perfil fictício da demonstração", hidden: false, created_at: today }));
  const themes = [["Conhecendo o Python", "Variáveis e valores", "Condições", "Laços de repetição", "Criando um jogo", "Funções", "Listas", "Projeto final"], ["Primeiro cenário", "Personagens", "Movimento", "Colisões", "Contador de pontos", "Novas fases", "Sons", "Publicando o jogo"], ["Formas e cores", "Composição", "Tipografia", "Ilustração", "Criando um personagem", "Animação", "Apresentação", "Portfólio criativo"]];
  const lessons: KodlandLesson[] = groups.flatMap((group, groupIndex) => themes[groupIndex].map((theme, index) => ({ id: `demo-lesson-${groupIndex}-${index}`, source_lesson_id: `demo-catalog-${groupIndex}-${index}`, materials_status: "ready", external_class_id: group.external_id, external_class_name: group.title, module_number: index < 4 ? "1" : "2", lesson_number: index % 4 + 1, course_index: index + 1, title: `M${index < 4 ? 1 : 2}.L${index % 4 + 1} ${theme}`, theme, lesson_date: day([0, 1, 3][groupIndex] + (index - 4) * 7), start_time: groupIndex === 1 ? "20:00" : "19:00", end_time: groupIndex === 1 ? "21:30" : "20:30", status: "Scheduled", lesson_passed: day([0, 1, 3][groupIndex] + (index - 4) * 7) < today, external_url: "#demo-material-lesson", slides_url: "#demo-material-slides", guide_url: "#demo-material-guide", homework_url: "#demo-material-homework", homework_title: `Praticando: ${theme}`, classroom_tasks: [{ title: `Desafio: ${theme}`, url: "#demo-material-task" }], created_at: today })));
  const extras: KodlandExtraLesson[] = [-1, 0, 1].map((week, index) => ({ id: `demo-extra-${index}`, external_student_id: students[index].external_id, student_name: students[index].name, external_class_id: groups[0].external_id, external_class_name: groups[0].title, lesson_date: day(2 + week * 7), start_time: "20:00", end_time: "21:00", status: index === 0 ? "Completed" : "Pending", completed: index === 0, manual_status: index === 0 ? "DONE" : "PENDING", created_at: today }));
  const reviews: KodlandReview[] = [0, 0, 1, 4, 5, 8].map((studentIndex, index) => { const student = students[studentIndex]; const lesson = lessons.find((item) => item.external_class_id === student.external_class_id && item.course_index === (index % 2 ? 4 : 3))!; return { id: `demo-review-${index}`, external_class_id: student.external_class_id, external_class_name: student.external_class_name, external_student_id: student.external_id, student_name: student.name, lesson_id: lesson.id, lesson_number: lesson.course_index!, lesson_title: lesson.title, module_number: lesson.module_number!, task_id: `demo-task-${index}`, task_number: index % 3 + 1, task_title: ["Meu primeiro projeto", "Desafio criativo", "Praticando o conteúdo"][index % 3], status_key: "submitted", status_label: index % 2 ? "Entregue com atraso" : "Entregue sem atraso", correction_url: "", created_at: today }; });
  return { today, groups, students, lessons, extras, reviews, availability: [0, 1, 2, 3, 4].map((weekday) => ({ id: `demo-availability-${weekday}`, weekday, start_time: "19:00", end_time: "22:00", created_at: today })), paymentStatus: {}, financialStatus: {}, additionalExtras: [], manualClasses: [], manualStudents: [], manualLessons: [], manualActivities: [], defaultRateHistory: [], kodlandSettings: [], paymentSnapshots: {} };
}

export const demoFinancialLessonId = (lesson: Pick<KodlandLesson, "external_class_id" | "id">) => `kodland-${lesson.external_class_id}-${lesson.id}`;

/** Adapter only: the private domain engine owns dates, payment states and totals. */
export function demoFinancialInputs(snapshot: DemoSnapshot, customHolidays: CustomHoliday[] = []): Parameters<typeof calculateDashboard> {
  const financialOverrides = Object.entries(snapshot.financialStatus).map(([id, status]) => {
    const legacyLesson = snapshot.lessons.find((lesson) => lesson.id === id);
    const lessonId = legacyLesson ? demoFinancialLessonId(legacyLesson) : id;
    return { id: `demo-override-${lessonId}`, financial_lesson_id: lessonId, financial_status: status };
  });
  const confirmations = Object.entries(snapshot.paymentStatus).map(([date, status]) => ({ id: date, payment_date: date, status, received_at: status === "RECEIVED" ? `${snapshot.today}T12:00:00Z` : null, payment_snapshot: status === "RECEIVED" ? snapshot.paymentSnapshots[date] : undefined }));
  const lessonRows = snapshot.additionalExtras.map((lesson) => ({ ...lesson, active: true, canceled: false, financial_status: snapshot.financialStatus[lesson.id] ?? lesson.financial_status ?? "" }));
  return [snapshot.manualClasses.map((item) => ({ ...item })), lessonRows, confirmations, snapshot.groups.map((group) => ({ ...group })), snapshot.lessons.map((lesson) => ({ ...lesson })), snapshot.today, snapshot.extras.map((extra) => ({ ...extra })), financialOverrides, customHolidays, snapshot.defaultRateHistory, snapshot.kodlandSettings.map((item) => ({ ...item }))];
}

export function demoDashboard(snapshot: DemoSnapshot, customHolidays: CustomHoliday[] = []): DashboardResponse {
  return calculateDashboard(...demoFinancialInputs(snapshot, customHolidays));
}
