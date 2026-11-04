import { describe, expect, it } from "vitest";
import type { KodlandAttendance, KodlandExtraLesson, KodlandGroup, KodlandStudent } from "./api";
import type { KodlandLesson } from "./kodland-lessons";
import { automaticTasks, attendanceConfirmed, type AutomaticTaskState } from "./kodland-sync-policy";

const group = { external_id: "g", archived: false } as KodlandGroup;
const student = { external_id: "s", external_class_id: "g", status: "active", hidden: false } as KodlandStudent;
// 18:00–19:30 São Paulo = 21:00–22:30 UTC.
const lesson = { id: "l", source_lesson_id: "source", external_class_id: "g", lesson_date: "2026-10-31", start_time: "18:00", end_time: "19:30", status: "scheduled", course_index: 4 } as KodlandLesson;
const extra = { id: "extra-1", external_student_id: "s", external_class_id: "g", lesson_date: "2026-10-31", start_time: "18:00", end_time: "19:00", status: "planned", completed: false, manual_status: "PENDING" } as KodlandExtraLesson;
const tasks = (time: string, states: Record<string, AutomaticTaskState> = {}, lessons = [lesson], groups = [group], extras: KodlandExtraLesson[] = [], agendaEntry = false, recordings = new Set<string>()) => automaticTasks(Date.parse(time), groups, lessons, [student], states, "2026-10-31T10:00:00Z", extras, agendaEntry, agendaEntry, recordings);
const presence = (time: string, states: Record<string, AutomaticTaskState> = {}) => tasks(time, states).filter(task => task.kind === "attendance");

describe("agenda econômica de sincronização", () => {
  it("consulta presença uma vez, só da turma e uma hora após o término real", () => {
    expect(presence("2026-10-31T23:29:59Z")).toEqual([]);
    expect(presence("2026-10-31T23:30:00Z")).toMatchObject([{ groupId: "g", students: ["s"] }]);
    expect(tasks("2026-10-31T23:30:00Z", {}, [lesson, { ...lesson, id: "other", external_class_id: "other" }]).filter(task => task.kind === "attendance")).toHaveLength(1);
  });

  it("não repete presença e deixa de recuperar ocorrências após 24 horas", () => {
    const id = presence("2026-10-31T23:30:00Z")[0].id;
    const state = { [id]: { attempts: 1, at: "2026-10-31T23:30:00Z", complete: false } };
    expect(presence("2026-11-01T00:00:00Z", state)).toEqual([]);
    expect(presence("2026-10-31T23:30:00Z", { [id]: { attempts: 0, at: "", complete: false } })).toHaveLength(1);
    expect(presence("2026-11-01T22:30:01Z")).toEqual([]);
  });

  it("não atualiza cadastro, disponibilidade ou materiais como tarefa periódica", () => {
    expect(tasks("2026-11-01T03:00:00Z").map(task => task.kind)).not.toContain("daily");
    expect(tasks("2026-11-01T03:00:00Z", {}, [{ ...lesson, materials_status: "pending" }]).map(task => task.kind)).not.toContain("materials");
  });

  it("descobre extras novas da semana atual ao entrar na Agenda e limita repetição", () => {
    const now = "2026-10-31T16:00:00Z";
    expect(tasks(now).filter(task => task.kind === "extras_discovery")).toEqual([]);
    const [discovery] = tasks(now, {}, [lesson], [group], [extra], true).filter(task => task.kind === "extras_discovery");
    expect(discovery).toMatchObject({ kind: "extras_discovery", weekDate: "2026-10-31", knownExtraIds: ["extra-1"] });
    expect(tasks("2026-10-31T16:04:59Z", { [discovery.id]: { attempts: 1, at: now, complete: true } }, [lesson], [group], [extra], true).filter(task => task.kind === "extras_discovery")).toEqual([]);
    expect(tasks("2026-10-31T16:05:00Z", { [discovery.id]: { attempts: 1, at: now, complete: true } }, [lesson], [group], [extra], true).filter(task => task.kind === "extras_discovery")).toHaveLength(1);
  });

  it("confere extra não ministrada no dia seguinte e encerra após uma resposta válida", () => {
    const beforeMidnight = tasks("2026-11-01T02:59:59Z", {}, [lesson], [group], [extra]);
    expect(beforeMidnight.filter(task => task.kind === "extra_final_check")).toEqual([]);
    const [check] = tasks("2026-11-01T03:00:00Z", {}, [lesson], [group], [extra]).filter(task => task.kind === "extra_final_check");
    expect(check).toMatchObject({ kind: "extra_final_check", occurrence: { kind: "extra", id: "extra-1" } });
    expect(tasks("2026-11-01T04:00:00Z", { [check.id]: { attempts: 1, at: "2026-11-01T03:00:00Z", complete: true } }, [lesson], [group], [extra]).filter(task => task.kind === "extra_final_check")).toEqual([]);
    expect(tasks("2026-11-01T04:00:00Z", {}, [lesson], [group], [{ ...extra, final_checked_at: "2026-11-01T03:00:00Z" }]).filter(task => task.kind === "extra_final_check")).toEqual([]);
    expect(tasks("2026-11-01T04:00:00Z", {}, [lesson], [group], [{ ...extra, manual_status: "DONE", completed: true }]).filter(task => task.kind === "extra_final_check")).toEqual([]);
    const oldExtra = { ...extra, lesson_date: "2026-10-01" };
    expect(tasks("2026-11-01T04:00:00Z", {}, [lesson], [group], [oldExtra]).filter(task => task.kind === "extra_final_check")).toEqual([]);
    expect(tasks("2026-11-01T04:00:00Z", { "extra_final_check:g:extra-1:2026-10-01:18:00:19:00": { attempts: 1, at: "2026-10-02T03:00:00Z", complete: false } }, [lesson], [group], [oldExtra]).filter(task => task.kind === "extra_final_check")).toHaveLength(1);
  });

  it("busca gravações depois da aula, só na Agenda, uma vez por visita e com intervalo de 30 minutos", () => {
    const [recording] = tasks("2026-10-31T22:30:00Z", {}, [lesson], [group], [], true).filter(task => task.kind === "recordings");
    expect(recording).toMatchObject({ kind: "recordings", occurrence: { kind: "lesson", id: "l" } });
    expect(tasks("2026-10-31T22:30:00Z").filter(task => task.kind === "recordings")).toEqual([]);
    expect(tasks("2026-10-31T22:30:00Z", {}, [lesson], [group], [], true, new Set([recording.id])).filter(task => task.kind === "recordings")).toEqual([]);
    expect(tasks("2026-10-31T22:59:59Z", { [recording.id]: { attempts: 1, at: "2026-10-31T22:30:00Z", complete: false } }, [lesson], [group], [], true).filter(task => task.kind === "recordings")).toEqual([]);
    expect(tasks("2026-10-31T23:00:00Z", { [recording.id]: { attempts: 1, at: "2026-10-31T22:30:00Z", complete: false } }, [lesson], [group], [], true).filter(task => task.kind === "recordings")).toHaveLength(1);
    expect(tasks("2026-10-31T23:00:00Z", { [recording.id]: { attempts: 1, at: "2026-10-31T22:30:00Z", complete: true } }, [lesson], [group], [], true).filter(task => task.kind === "recordings")).toEqual([]);
  });

  it("busca link 15 minutos antes e repete a cada cinco minutos até o fim da aula", () => {
    expect(tasks("2026-10-31T20:44:59Z").filter(task => task.kind === "classroom")).toEqual([]);
    const [call] = tasks("2026-10-31T20:45:00Z").filter(task => task.kind === "classroom");
    expect(call).toMatchObject({ kind: "classroom", occurrence: { id: "l", source_lesson_id: "source" } });
    expect(tasks("2026-10-31T20:49:59Z", { [call.id]: { attempts: 1, at: "2026-10-31T20:45:00Z", complete: false } }).filter(task => task.kind === "classroom")).toEqual([]);
    expect(tasks("2026-10-31T20:50:00Z", { [call.id]: { attempts: 1, at: "2026-10-31T20:45:00Z", complete: false } }).filter(task => task.kind === "classroom")).toHaveLength(1);
    expect(tasks("2026-10-31T21:00:00Z", { [call.id]: { attempts: 1, at: "2026-10-31T20:45:00Z", complete: true } }).filter(task => task.kind === "classroom")).toEqual([]);
    expect(tasks("2026-10-31T22:30:00Z", { [call.id]: { attempts: 20, at: "2026-10-31T22:25:00Z", complete: false } }).filter(task => task.kind === "classroom")).toEqual([]);
  });

  it("aceita aula atravessando meia-noite", () => {
    const overnight = { ...lesson, start_time: "23:00", end_time: "01:00" };
    expect(tasks("2026-11-01T04:59:59Z", {}, [overnight]).filter(task => task.kind === "attendance")).toEqual([]);
    expect(tasks("2026-11-01T05:00:00Z", {}, [overnight]).filter(task => task.kind === "attendance")).toHaveLength(1);
  });

  it("confirma presença somente com resposta conhecida para todos os alunos da aula", () => {
    const record = { external_class_id: "g", external_student_id: "s", lesson_id: "4", lesson_title: "", lesson_date: "", status: "ABSENT" } as KodlandAttendance;
    expect(attendanceConfirmed(lesson, ["s"], [record])).toBe(true);
    expect(attendanceConfirmed(lesson, ["s", "other"], [record])).toBe(false);
    expect(attendanceConfirmed(lesson, ["s"], [{ ...record, status: "UNKNOWN" }])).toBe(false);
    expect(attendanceConfirmed(lesson, ["s"], [{ ...record, lesson_id: "different" }])).toBe(false);
    expect(attendanceConfirmed(lesson, [], [record])).toBe(false);
  });
});
