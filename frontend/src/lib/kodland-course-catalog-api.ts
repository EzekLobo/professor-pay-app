import { getFirebaseAuth } from "./firebase";
import { readKodlandBrowser, updateKodlandBrowser, type BrowserRow } from "./kodland-browser-cache";
import { requestKodlandJson } from "./kodland-sync-client";
import { mergeCourseCatalog, type KodlandCatalogCourse } from "./kodland-course-catalog";
import type { KodlandLesson } from "./kodland-lessons";

const collection = "kodland_course_catalog";
function owner() {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Entre novamente para consultar os cursos.");
  return { user, active: () => getFirebaseAuth().currentUser?.uid === user.uid };
}

/** Auxiliary cache per account; it never creates groups, agenda rows or financial records. */
export const kodlandCourseCatalogApi = {
  get: async (): Promise<KodlandCatalogCourse[]> => {
    const account = owner();
    const cached = await readKodlandBrowser(account.user.uid);
    if (!account.active()) throw new Error("A conta conectada mudou.");
    return (cached?.collections[collection] ?? []) as unknown as KodlandCatalogCourse[];
  },
  refresh: async (username: string, password: string) => {
    const account = owner();
    const response = await requestKodlandJson<{ courses: KodlandCatalogCourse[] }>({ username, password, mode: "courses" }, () => account.user.getIdToken(), crypto.randomUUID());
    if (!Array.isArray(response.courses)) throw new Error("A Kodland não retornou o catálogo de cursos.");
    let courses: KodlandCatalogCourse[] = [];
    await updateKodlandBrowser(account.user.uid, state => {
      courses = mergeCourseCatalog(response.courses, (state.collections[collection] ?? []) as unknown as KodlandCatalogCourse[]);
      state.collections[collection] = courses as unknown as BrowserRow[];
    }, account.active);
    return courses;
  },
  materials: async (lesson: Pick<KodlandLesson, "id" | "external_class_id" | "source_lesson_id">, username: string, password: string): Promise<KodlandLesson> => {
    const account = owner();
    const cached = await readKodlandBrowser(account.user.uid);
    if (!account.active()) throw new Error("A conta conectada mudou.");
    const source = ((cached?.collections[collection] ?? []) as unknown as KodlandCatalogCourse[]).flatMap(course => course.lessons).find(item => item.id === lesson.id && item.external_class_id === lesson.external_class_id);
    if (!source) throw new Error("Atualize o catálogo antes de carregar os materiais deste curso.");
    const response = await requestKodlandJson<{ material: Partial<KodlandLesson> }>({ username, password, mode: "materials", group_id: lesson.external_class_id, source_lesson_id: lesson.source_lesson_id }, () => account.user.getIdToken(), crypto.randomUUID());
    if (!response.material || !["ready", "empty"].includes(response.material.materials_status ?? "")) throw new Error("Não foi possível carregar os materiais do curso.");
    const updated = { ...source, ...response.material, id: lesson.id, external_class_id: lesson.external_class_id };
    await updateKodlandBrowser(account.user.uid, state => {
      const courses = (state.collections[collection] ?? []) as unknown as KodlandCatalogCourse[];
      state.collections[collection] = courses.map(course => ({ ...course, lessons: course.lessons.map(item => item.id === lesson.id ? updated : item) })) as unknown as BrowserRow[];
    }, account.active);
    return updated;
  },
};
