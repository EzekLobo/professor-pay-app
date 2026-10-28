import type { DemoSnapshot } from "./demo-snapshot";
import type { ManualAdapters } from "./manual-adapters";
import { isHttpUrl, manualActivityNotificationFields } from "./manual-pedagogy";
import { occurrenceHorizon, planManualOccurrences } from "./manual-operations";
import {
  reconcileWeeklySlots,
  tomorrowCivilDate,
  validateManualClassInput,
  type KodlandClassSettings,
  type ManualClass,
  type ManualClassGroup,
} from "./manual-teaching";
import { generateRecurringOccurrences, saoPauloLocalTimestamp, type RatePeriod } from "./teaching-finance";

type Read = () => DemoSnapshot;
type Change = (update: (current: DemoSnapshot) => DemoSnapshot) => void;
const id = () => `demo-manual-${crypto.randomUUID()}`;
const now = () => new Date().toISOString();
const ratePeriod = (hourly_rate_cents: number | null): RatePeriod => {
  const local = saoPauloLocalTimestamp();
  return { effective_from: local.slice(0, 10), effective_from_local: local, hourly_rate_cents };
};
const validRate = (rate: number) => {
  if (!Number.isInteger(rate) || rate <= 0) throw new RangeError("Informe um valor por hora válido.");
};
const validDay = (day: number) => {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new RangeError("O dia de recebimento deve estar entre 1 e 31.");
};
const validOccurrence = (classroom: ManualClass, occurrenceId: string) => {
  const date = occurrenceId.split(":").at(-1) ?? "";
  try { return generateRecurringOccurrences(classroom, date, date).some((item) => item.id === occurrenceId); }
  catch { return false; }
};

/** Browser-only implementation of the private manual-management contract. */
export function createDemoManualAdapter(read: Read, change: Change): ManualAdapters {
  const teaching: ManualAdapters["teaching"] = {
    groups: async () => [...read().manualClassGroups]
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)),
    classes: async () => read().manualClasses,
    students: async () => read().manualStudents,
    saveStudent: async (input) => {
      if (!input.name.trim()) throw new RangeError("Informe o nome do aluno.");
      const previous = input.id ? read().manualStudents.find((item) => item.id === input.id) : undefined;
      if (input.id && !previous) throw new Error("Aluno não encontrado.");
      const record = { id: input.id ?? id(), name: input.name.trim(), email: input.email?.trim() ?? "", phone: input.phone?.trim() ?? "", guardian_name: input.guardian_name?.trim() ?? previous?.guardian_name ?? "", guardian_phone: input.guardian_phone?.trim() ?? previous?.guardian_phone ?? "", notes: input.notes?.trim() ?? previous?.notes ?? "", active: input.active ?? previous?.active ?? true, created_at: previous?.created_at ?? now(), updated_at: now() };
      change((current) => ({ ...current, manualStudents: [...current.manualStudents.filter((item) => item.id !== record.id), record] }));
      return record;
    },
    deactivateStudent: async (studentId) => {
      if (!read().manualStudents.some((item) => item.id === studentId)) throw new Error("Aluno não encontrado.");
      change((current) => ({ ...current, manualStudents: current.manualStudents.map((item) => item.id === studentId ? { ...item, active: false, updated_at: now() } : item) }));
    },
    saveGroup: async (input) => {
      if (!input.name.trim()) throw new RangeError("Informe o nome do grupo.");
      if (input.order != null && (!Number.isInteger(input.order) || input.order < 0)) {
        throw new RangeError("Informe uma ordem de grupo válida.");
      }
      const previous = input.id ? read().manualClassGroups.find((item) => item.id === input.id) : undefined;
      if (input.id && !previous) throw new Error("Grupo não encontrado.");
      const record: ManualClassGroup = {
        id: input.id ?? id(),
        name: input.name.trim(),
        order: input.order ?? previous?.order ?? read().manualClassGroups.length,
        active: input.active ?? previous?.active ?? true,
        created_at: previous?.created_at ?? now(),
        updated_at: now(),
      };
      change((current) => ({
        ...current,
        manualClassGroups: [...current.manualClassGroups.filter((item) => item.id !== record.id), record],
      }));
      return record;
    },
    deleteGroup: async (groupId) => {
      if (!read().manualClassGroups.some((item) => item.id === groupId)) throw new Error("Grupo não encontrado.");
      if (read().manualClasses.some((item) => item.group_id === groupId)) {
        throw new RangeError("Mova as turmas deste grupo antes de excluí-lo.");
      }
      change((current) => ({
        ...current,
        manualClassGroups: current.manualClassGroups.filter((item) => item.id !== groupId),
      }));
    },
    saveClass: async (input) => {
      const current = read();
      const previous = input.id ? current.manualClasses.find((item) => item.id === input.id) : undefined;
      if (input.id && !previous) throw new Error("Turma não encontrada.");
      validateManualClassInput(input, current.defaultRateHistory.at(-1)?.hourly_rate_cents != null);
      const groupId = input.group_id ?? previous?.group_id ?? null;
      const courseId = input.course_id ?? previous?.course_id ?? null;
      if (courseId && !current.manualCourses.some((course) => course.id === courseId && !course.archived)) throw new RangeError("O curso selecionado não existe ou está arquivado.");
      if (!previous && !groupId) throw new RangeError("Selecione ou crie um grupo para a nova turma.");
      if (groupId) {
        const group = current.manualClassGroups.find((item) => item.id === groupId);
        if (!group) throw new RangeError("O grupo selecionado não existe.");
        if (!group.active && previous?.group_id !== groupId) {
          throw new RangeError("Não é possível adicionar uma turma a um grupo desativado.");
        }
      }
      const activeStudents = new Set(current.manualStudents.filter((item) => item.active).map((item) => item.id));
      if (input.student_ids.some((studentId) => !activeStudents.has(studentId))) throw new RangeError("Selecione alunos próprios ativos.");
      const today = current.today;
      const slots = previous
        ? reconcileWeeklySlots(previous.schedule_slots, input.schedule_slots, today)
        : input.schedule_slots.map((slot) => ({ ...slot, effective_from: input.first_lesson_date }));
      const previousRate = previous?.rate_history?.at(-1)?.hourly_rate_cents ?? null;
      const history = previous
        ? [...(previous.rate_history ?? []), ...(previousRate === input.hourly_rate_cents ? [] : [ratePeriod(input.hourly_rate_cents)])]
        : input.hourly_rate_cents == null ? [] : [{ effective_from: input.first_lesson_date, hourly_rate_cents: input.hourly_rate_cents }];
      const active = input.active ?? previous?.active ?? true;
      const submittedEndDate = input.end_date || null;
      const record: ManualClass = {
        id: input.id ?? id(), source: "manual", name: input.name.trim(),
        group_id: groupId, course_id: courseId,
        first_lesson_date: previous?.first_lesson_date ?? input.first_lesson_date,
        end_date: active
          ? (previous?.active === false && submittedEndDate === previous.end_date ? null : submittedEndDate)
          : submittedEndDate ?? today,
        schedule_slots: slots, hourly_rate_cents: null, rate_history: history,
        initial_default_rate_cents: previous?.initial_default_rate_cents ?? current.defaultRateHistory.at(-1)?.hourly_rate_cents ?? null,
        payment_day: input.payment_day,
        payment_day_history: previous
          ? [...(previous.payment_day_history ?? [{ effective_from: previous.first_lesson_date, payment_day: previous.payment_day ?? 15 }]), ...(previous.payment_day === input.payment_day ? [] : [{ effective_from: tomorrowCivilDate(today), payment_day: input.payment_day }])]
          : [{ effective_from: input.first_lesson_date, payment_day: input.payment_day }],
        student_ids: [...new Set(input.student_ids)], active,
        created_at: previous?.created_at ?? now(), updated_at: now(),
      };
      change((state) => ({ ...state, manualClasses: [...state.manualClasses.filter((item) => item.id !== record.id), record] }));
      return record;
    },
    deactivateClass: async (classId) => {
      if (!read().manualClasses.some((item) => item.id === classId)) throw new Error("Turma não encontrada.");
      change((current) => ({ ...current, manualClasses: current.manualClasses.map((item) => item.id === classId ? {
        ...item, active: false, end_date: current.today, updated_at: now(),
        schedule_slots: item.schedule_slots.map((slot) => slot.effective_until && slot.effective_until < current.today ? slot : { ...slot, effective_until: current.today }),
      } : item) }));
    },
    deleteClass: async (classId) => {
      if (!read().manualClasses.some((item) => item.id === classId)) throw new Error("Turma não encontrada.");
      if (read().manualLessons.some((item) => item.class_id === classId) || read().manualActivities.some((item) => item.class_id === classId) || read().manualAttendance.some((item) => item.class_id === classId) || read().manualOccurrences.some((item) => item.class_id === classId && (item.lesson_date <= read().today || item.status !== "planned"))) throw new RangeError("Arquive a turma: ela possui histórico financeiro ou pedagógico.");
      change((current) => ({
        ...current,
        manualClasses: current.manualClasses.filter((item) => item.id !== classId),
        manualOccurrences: current.manualOccurrences.filter((item) => item.class_id !== classId),
      }));
    },
  };
  const pedagogy: ManualAdapters["pedagogy"] = {
    lessons: async () => read().manualLessons,
    activities: async () => read().manualActivities,
    saveLesson: async (input) => {
      const current = read();
      const classroom = current.manualClasses.find((item) => item.id === input.class_id);
      if (!classroom) throw new Error("Turma própria não encontrada.");
      if (!input.title.trim()) throw new RangeError("Informe o título da aula.");
      if (input.occurrence_id && !validOccurrence(classroom, input.occurrence_id)) throw new RangeError("Ocorrência incompatível com a turma.");
      const links = (input.links ?? []).map((item) => ({ label: item.label.trim(), url: item.url.trim() }));
      if (links.some((item) => !item.label || !isHttpUrl(item.url))) throw new RangeError("Informe nome e endereço http(s) válido para cada link.");
      const previous = input.id ? current.manualLessons.find((item) => item.id === input.id && item.class_id === input.class_id) : undefined;
      if (input.id && !previous) throw new Error("Aula própria não encontrada.");
      const record = { id: input.id ?? id(), class_id: input.class_id, occurrence_id: input.occurrence_id || null, title: input.title.trim(), content: input.content?.trim() ?? "", guide: input.guide?.trim() ?? "", links, created_at: previous?.created_at ?? now(), updated_at: now() };
      change((state) => ({ ...state, manualLessons: [...state.manualLessons.filter((item) => item.id !== record.id), record] }));
      return record;
    },
    saveActivity: async (input) => {
      const current = read();
      const classroom = current.manualClasses.find((item) => item.id === input.class_id);
      if (!classroom) throw new Error("Turma própria não encontrada.");
      if (!classroom.student_ids.includes(input.student_id) || !current.manualStudents.some((item) => item.id === input.student_id)) throw new RangeError("Selecione um aluno desta turma.");
      if (!validOccurrence(classroom, input.occurrence_id)) throw new RangeError("Selecione uma ocorrência desta turma.");
      if (!input.title.trim()) throw new RangeError("Informe a atividade.");
      if (input.submission_url?.trim() && !isHttpUrl(input.submission_url.trim())) throw new RangeError("Informe um link de entrega http(s) válido.");
      const previous = input.id ? current.manualActivities.find((item) => item.id === input.id && item.class_id === input.class_id) : undefined;
      if (input.id && !previous) throw new Error("Atividade própria não encontrada.");
      const record = { ...manualActivityNotificationFields(input, previous), id: input.id ?? id(), class_id: input.class_id, student_id: input.student_id, occurrence_id: input.occurrence_id, title: input.title.trim(), description: input.description?.trim() ?? "", submission_text: input.submission_text?.trim() ?? "", submission_url: input.submission_url?.trim() ?? "", feedback: input.feedback?.trim() ?? "", status: input.status ?? (input.submission_text?.trim() || input.submission_url?.trim() ? "submitted" : "assigned"), created_at: previous?.created_at ?? now(), updated_at: now() };
      change((state) => ({ ...state, manualActivities: [...state.manualActivities.filter((item) => item.id !== record.id), record] }));
      return record;
    },
  };
  return {
    teaching, pedagogy,
    preferences: {
      get: async () => read().tutorPreferences,
      save: async (input) => {
        const current = read().tutorPreferences;
        const record = { ...current, ...input, id: "preferences" as const, updated_at: now() };
        if (!Number.isInteger(record.default_duration_minutes) || record.default_duration_minutes < 15 || record.default_duration_minutes > 480) throw new RangeError("A duração padrão deve ficar entre 15 e 480 minutos.");
        validDay(record.default_payment_day);
        if (!record.absence_message_template.trim()) throw new RangeError("Informe o modelo da mensagem de ausência.");
        change((state) => ({ ...state, tutorPreferences: record }));
        return record;
      },
    },
    courses: {
      list: async () => read().manualCourses,
      save: async (course) => {
        if (!course.name.trim() || !course.modules.length) throw new RangeError("Informe o nome e ao menos um módulo.");
        const record = { ...course, name: course.name.trim(), updated_at: now() };
        change((state) => ({ ...state, manualCourses: [...state.manualCourses.filter((item) => item.id !== record.id), record] }));
        return record;
      },
      delete: async (courseId) => {
        if (read().manualClasses.some((item) => item.course_id === courseId)) throw new RangeError("Arquive o curso: ele possui turmas vinculadas.");
        change((state) => ({ ...state, manualCourses: state.manualCourses.filter((item) => item.id !== courseId) }));
      },
    },
    operations: {
      occurrences: async (classId) => read().manualOccurrences.filter((item) => !classId || item.class_id === classId),
      ensureOccurrences: async (classId) => {
        const state = read();
        const classroom = state.manualClasses.find((item) => item.id === classId);
        if (!classroom) throw new Error("Turma própria não encontrada.");
        const planned = planManualOccurrences({ classroom, course: state.manualCourses.find((item) => item.id === classroom.course_id), existing: state.manualOccurrences.filter((item) => item.class_id === classId), from: classroom.first_lesson_date, to: occurrenceHorizon(state.today, classroom.end_date), defaultRateHistory: state.defaultRateHistory, timestamp: now() });
        change((current) => ({ ...current, manualOccurrences: [...current.manualOccurrences.filter((item) => item.class_id !== classId), ...planned] }));
        return planned;
      },
      saveOccurrence: async (input) => {
        const record = { ...input, updated_at: now() };
        change((state) => ({ ...state, manualOccurrences: [...state.manualOccurrences.filter((item) => item.id !== record.id), record] }));
        return record;
      },
      attendance: async (classId) => read().manualAttendance.filter((item) => !classId || item.class_id === classId),
      saveAttendance: async (input) => {
        const previous = input.id ? read().manualAttendance.find((item) => item.id === input.id) : undefined;
        const record = { ...input, id: input.id || `${input.occurrence_id}:${input.student_id}`, note: input.note.trim(), created_at: previous?.created_at ?? now(), updated_at: now() };
        change((state) => ({ ...state, manualAttendance: [...state.manualAttendance.filter((item) => item.id !== record.id), record] }));
        return record;
      },
      availability: async () => read().manualAvailability,
      saveAvailability: async (input) => {
        if (input.end_time <= input.start_time) throw new RangeError("Confira o intervalo de disponibilidade.");
        const previous = input.id ? read().manualAvailability.find((item) => item.id === input.id) : undefined;
        const record = { ...input, id: input.id || id(), created_at: previous?.created_at ?? now(), updated_at: now() };
        change((state) => ({ ...state, manualAvailability: [...state.manualAvailability.filter((item) => item.id !== record.id), record] }));
        return record;
      },
      deleteAvailability: async (availabilityId) => change((state) => ({ ...state, manualAvailability: state.manualAvailability.filter((item) => item.id !== availabilityId) })),
    },
    settings: {
      get: async () => ({ rate_history: read().defaultRateHistory, default_hourly_rate_cents: read().defaultRateHistory.at(-1)?.hourly_rate_cents ?? null }),
      setDefaultRate: async (rate) => { validRate(rate); change((current) => ({ ...current, defaultRateHistory: [...current.defaultRateHistory, ratePeriod(rate)] })); },
    },
    kodland: {
      list: async () => read().kodlandSettings,
      save: async (groupId, input) => {
        if (!read().groups.some((group) => group.external_id === groupId)) throw new Error("Turma Kodland não encontrada.");
        validDay(input.payment_day);
        if (input.hourly_rate_cents != null) validRate(input.hourly_rate_cents);
        const previous = read().kodlandSettings.find((item) => item.id === groupId);
        const latest = previous?.rate_history.at(-1)?.hourly_rate_cents ?? null;
        const record: KodlandClassSettings = {
          id: groupId,
          rate_history: latest === input.hourly_rate_cents ? previous?.rate_history ?? [] : [...(previous?.rate_history ?? []), ratePeriod(input.hourly_rate_cents)],
          payment_day: input.payment_day,
          payment_day_history: [...(previous?.payment_day_history ?? []), ...(previous?.payment_day === input.payment_day ? [] : [{ effective_from: tomorrowCivilDate(read().today), payment_day: input.payment_day }])],
          created_at: previous?.created_at ?? now(), updated_at: now(),
        };
        change((current) => ({ ...current, kodlandSettings: [...current.kodlandSettings.filter((item) => item.id !== groupId), record] }));
        return record;
      },
    },
  };
}
