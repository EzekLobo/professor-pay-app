import {
  manualCoursesApi,
  kodlandClassSettingsApi,
  manualOperationsApi,
  manualPedagogyApi,
  manualTeachingApi,
  teachingSettingsApi,
  tutorPreferencesApi,
} from "./api";
import type { ManualAdapters } from "./manual-adapters";

/** Firestore-backed implementation shared by manual-operation screens. */
export const manualAdapter: ManualAdapters = {
  teaching: manualTeachingApi,
  preferences: tutorPreferencesApi,
  courses: manualCoursesApi,
  operations: manualOperationsApi,
  settings: teachingSettingsApi,
  kodland: kodlandClassSettingsApi,
  pedagogy: manualPedagogyApi,
};
