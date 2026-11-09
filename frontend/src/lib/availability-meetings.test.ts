import { expect, it } from "vitest";
import { availabilityMeetings } from "./availability-meetings";
import type { ManualClass } from "./manual-teaching";
import type { ManualOccurrence } from "./manual-operations";
const classroom: ManualClass = {id:"c",name:"Programação",source:"manual",student_ids:[],created_at:"2026-11-09",updated_at:"2026-11-09",active:true,first_lesson_date:"2026-11-09",end_date:"2026-11-23",hourly_rate_cents:4500,payment_day:15,schedule_slots:[{id:"slot",effective_from:"2026-11-09",week_day:0,start_time:"18:00",duration_minutes:60}]};
it("projects recurring occupancy without writing and honors saved cancellations",()=>{
 const saved=[{id:"manual:c:slot:2026-11-09",class_id:"c",slot_id:"slot",lesson_date:"2026-11-09",start_time:"18:00",duration_minutes:60,status:"cancelled"}] as ManualOccurrence[];
 const meetings=availabilityMeetings([classroom],saved,"2026-11-09");
 expect(meetings.map(row=>[row.lesson_date,row.status])).toEqual([["2026-11-09","cancelled"],["2026-11-16","planned"],["2026-11-23","planned"]]);
 expect(saved).toHaveLength(1);expect(availabilityMeetings([{...classroom,active:false}],saved,"2026-11-09")).toEqual([]);
 expect(availabilityMeetings([classroom],[],"2026-12-01")).toEqual([]);
});
