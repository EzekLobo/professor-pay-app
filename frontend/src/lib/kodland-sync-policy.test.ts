import { describe, expect, it } from "vitest";
import type { KodlandAttendance, KodlandGroup, KodlandStudent } from "./api";
import type { KodlandLesson } from "./kodland-lessons";
import { automaticTasks, attendanceConfirmed, type AutomaticTaskState } from "./kodland-sync-policy";
const group = { external_id: "g", archived: false } as KodlandGroup;
const student = { external_id: "s", external_class_id: "g", status: "active", hidden: false } as KodlandStudent;
// 18:00–19:30 São Paulo = 21:00–22:30 UTC.
const lesson = { id: "l", source_lesson_id: "source", external_class_id: "g", lesson_date: "2026-10-31", start_time: "18:00", end_time: "19:30", status: "scheduled", course_index: 4 } as KodlandLesson;
const tasks = (time: string, states: Record<string, AutomaticTaskState> = {}, lessons = [lesson], groups = [group]) => automaticTasks(Date.parse(time), groups, lessons, [student], states, "2026-10-31T10:00:00Z");
const presence = (time: string, states: Record<string, AutomaticTaskState> = {}) => tasks(time, states).filter(task => task.kind === "attendance");
describe("agenda econômica de sincronização", () => {
 it("consulta presença só da turma após 30 minutos do término real", () => {
  expect(presence("2026-10-31T22:59:59Z")).toEqual([]);
  expect(presence("2026-10-31T23:00:00Z")).toMatchObject([{groupId:"g",students:["s"]}]);
  expect(tasks("2026-10-31T23:00:00Z", {}, [lesson, {...lesson,id:"other",external_class_id:"other"}]).filter(task=>task.kind==="attendance")).toHaveLength(1);
 });
 it("repete só após uma hora, com pelo menos 30 minutos entre as duas tentativas", () => {
  const id=presence("2026-10-31T23:00:00Z")[0].id;
  const state={ [id]:{attempts:1,at:"2026-10-31T23:00:00Z",complete:false} };
  expect(presence("2026-10-31T23:29:59Z",state)).toEqual([]);
  expect(presence("2026-10-31T23:30:00Z",state)).toHaveLength(1);
  state[id].at="2026-10-31T23:20:00Z";
  expect(presence("2026-10-31T23:30:00Z",state)).toEqual([]);
 });
 it("para após confirmação ou duas tentativas e expira ocorrências antigas", () => {
  const id=presence("2026-10-31T23:00:00Z")[0].id;
  expect(presence("2026-11-01T00:00:00Z",{[id]:{attempts:1,at:"2026-10-31T23:00:00Z",complete:true}})).toEqual([]);
  expect(presence("2026-11-01T00:00:00Z",{[id]:{attempts:2,at:"2026-10-31T23:00:00Z",complete:false}})).toEqual([]);
  expect(presence("2026-11-02T00:00:00Z")).toEqual([]);
 });
 it("não agenda aulas canceladas, turmas arquivadas ou horários inválidos", () => {
  expect(tasks("2026-10-31T23:00:00Z",{},[{...lesson,status:"cancelled"}])).toEqual([]);
  expect(tasks("2026-10-31T23:00:00Z",{},[{...lesson,end_time:""}])).toEqual([]);
  expect(tasks("2026-10-31T23:00:00Z",{},[lesson],[{...group,archived:true}])).toEqual([]);
 });
 it("consulta link uma vez na janela de 15 minutos antes da aula", () => {
  expect(tasks("2026-10-31T20:44:59Z")).toEqual([]);
  expect(tasks("2026-10-31T20:45:00Z",{},[{...lesson,end_time:""}])).toMatchObject([{kind:"classroom"}]);
  const pre=tasks("2026-10-31T20:45:00Z");expect(pre).toMatchObject([{kind:"classroom"}]);
  expect(tasks("2026-10-31T20:50:00Z",{[pre[0].id]:{attempts:1,at:"2026-10-31T20:45:00Z",complete:true}})).toEqual([]);
  expect(tasks("2026-10-31T21:00:00Z")).toEqual([]);
 });
 it("turmas e grade usam dia civil de São Paulo, sem atualizar financeiro", () => {
  expect(tasks("2026-11-01T02:59:00Z").filter(task=>task.kind==="daily")).toEqual([]);
  expect(tasks("2026-11-01T03:00:00Z").filter(task=>task.kind==="daily")).toHaveLength(1);
 });
 it("aceita aula atravessando meia noite",()=>{
  expect(tasks("2026-11-01T04:30:00Z",{},[{...lesson,start_time:"23:00",end_time:"01:00"}]).filter(task=>task.kind==="attendance")).toHaveLength(1);
 });
 it("confirma presença somente com resposta conhecida para todos os alunos da aula",()=>{
  const record={external_class_id:"g",external_student_id:"s",lesson_id:"4",lesson_title:"",lesson_date:"",status:"ABSENT"} as KodlandAttendance;
  expect(attendanceConfirmed(lesson,["s"],[record])).toBe(true);
  expect(attendanceConfirmed(lesson,["s","other"],[record])).toBe(false);
  expect(attendanceConfirmed(lesson,["s"],[{...record,status:"UNKNOWN"}])).toBe(false);
  expect(attendanceConfirmed(lesson,["s"],[{...record,lesson_id:"different"}])).toBe(false);
  expect(attendanceConfirmed(lesson,[],[record])).toBe(false);
 });
});
