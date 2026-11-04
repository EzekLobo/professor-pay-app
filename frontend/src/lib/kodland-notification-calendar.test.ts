import { expect,it } from "vitest";
import { kodlandNotificationCalendar } from "./kodland-notification-calendar";
import type { KodlandGroup } from "./api";
import type { KodlandLesson } from "./kodland-lessons";
const group={external_id:"g",next_lesson_date:"2026-11-09",next_lesson_number:3} as KodlandGroup;
const past={id:"l2",external_class_id:"g",lesson_date:"",start_time:"",end_time:"",course_index:2} as KodlandLesson;
const anchor={...past,id:"l3",course_index:3,lesson_date:"2026-11-09",start_time:"18:00",end_time:"19:30"};
it("usa data curricular e horário semanal confirmado para presença sem horário próprio",()=>{
 expect(kodlandNotificationCalendar({lesson_date:""},past,[past,anchor],group,"America/Sao_Paulo")).toMatchObject({date:"2026-11-02",endedAt:"2026-11-02T22:30:00.000Z"});
});
it("não inventa duração quando não há horário confiável ou a grade é conflitante",()=>{
 expect(kodlandNotificationCalendar({lesson_date:""},past,[past],group,"America/Sao_Paulo").endedAt).toBeNull();
 expect(kodlandNotificationCalendar({lesson_date:""},past,[past,anchor,{...anchor,id:"other",start_time:"20:00",end_time:"21:30"}],group,"America/Sao_Paulo").endedAt).toBeNull();
});
it("considera término após meia-noite no dia seguinte",()=>{
 expect(kodlandNotificationCalendar({lesson_date:""},{...anchor,lesson_date:"2026-11-02",start_time:"23:00",end_time:"00:30"},[],group,"America/Sao_Paulo").endedAt).toBe("2026-11-03T03:30:00.000Z");
});
