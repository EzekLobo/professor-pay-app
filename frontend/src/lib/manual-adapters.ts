import type { ManualActivity, ManualLessonContent } from "./manual-pedagogy";
import type {
  KodlandClassSettings,
  ManualClass,
  ManualClassGroup,
  ManualClassGroupInput,
  ManualClassInput,
  ManualStudent,
} from "./manual-teaching";
import type { RatePeriod } from "./teaching-finance";

/** The same forms can target private Firestore or the visitor's local scenario. */
export type ManualAdapters = {
  teaching: {
    groups(): Promise<ManualClassGroup[]>;
    classes(): Promise<ManualClass[]>;
    students(): Promise<ManualStudent[]>;
    saveClass(input: ManualClassInput & { id?: string }): Promise<ManualClass>;
    saveStudent(input: { id?: string; name: string; email?: string; phone?: string; active?: boolean }): Promise<ManualStudent>;
    deactivateClass(id: string): Promise<void>;
    deactivateStudent(id: string): Promise<void>;
    saveGroup(input: ManualClassGroupInput): Promise<ManualClassGroup>;
    deleteGroup(id: string): Promise<void>;
  };
  settings: {
    get(): Promise<{ rate_history: RatePeriod[]; default_hourly_rate_cents: number | null }>;
    setDefaultRate(rate: number): Promise<unknown>;
  };
  kodland: {
    list(): Promise<KodlandClassSettings[]>;
    save(id: string, input: { hourly_rate_cents: number | null; payment_day: number }): Promise<unknown>;
  };
  pedagogy: {
    lessons(): Promise<ManualLessonContent[]>;
    activities(): Promise<ManualActivity[]>;
    saveLesson(input: { id?: string; class_id: string; occurrence_id?: string | null; title: string; content?: string; guide?: string; links?: { label: string; url: string }[] }): Promise<ManualLessonContent>;
    saveActivity(input: { id?: string; class_id: string; student_id: string; occurrence_id: string; title: string; description?: string; submission_text?: string; submission_url?: string; feedback?: string; status?: "pending" | "completed" }): Promise<ManualActivity>;
  };
};
