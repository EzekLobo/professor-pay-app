import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManualCourse } from "./manual-courses";

const state = vi.hoisted(() => ({
  user: { uid: "teacher-one" } as { uid: string } | null,
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  getFirebaseAuth: () => ({ currentUser: state.user }),
  getFirebaseDb: () => ({}),
}));
vi.mock("firebase/firestore", async (original) => ({
  ...await original<typeof import("firebase/firestore")>(),
  collection: (_db: unknown, path: string) => path,
  doc: (path: string, id: string) => `${path}/${id}`,
  setDoc: state.setDoc,
  deleteDoc: state.deleteDoc,
  query: (value: unknown) => value,
  orderBy: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => course })),
  getDocs: vi.fn(async () => ({ docs: [] })),
}));
import { manualCoursesApi } from "./api";

const course: ManualCourse = {
  id: "course-one", name: " Redação ", created_at: "2026-10-01", updated_at: "2026-10-01",
  modules: [{ id: "module-one", title: "Argumentação", lessons: [] }],
};

beforeEach(() => { vi.clearAllMocks(); state.user = { uid: "teacher-one" }; });
describe("cursos próprios privados", () => {
  it("edita o mesmo documento na conta autenticada e preserva a criação", async () => {
    const result = await manualCoursesApi.save(course);
    expect(state.setDoc).toHaveBeenCalledWith("users/teacher-one/manual_courses/course-one", expect.objectContaining({ name: "Redação", created_at: course.created_at, modules: course.modules }));
    expect(result.id).toBe(course.id);
    state.user = { uid: "teacher-two" };
    await manualCoursesApi.delete(course.id);
    expect(state.deleteDoc).toHaveBeenCalledWith("users/teacher-two/manual_courses/course-one");
  });
  it("não grava cursos inválidos ou permite excluir sem autenticação", async () => {
    await expect(manualCoursesApi.save({ ...course, modules: [] })).rejects.toThrow("Adicione pelo menos um módulo");
    await expect(manualCoursesApi.save({ ...course, modules: [{ id: "module", title: "Módulo", lessons: [{ id: "lesson", title: "Aula", activities: "", guide: "", slides: "endereco-invalido", homework: "" }] }] })).rejects.toThrow("link http(s) válido");
    expect(state.setDoc).not.toHaveBeenCalled();
    state.user = null;
    await expect(manualCoursesApi.delete(course.id)).rejects.toThrow("Faça login");
    expect(state.deleteDoc).not.toHaveBeenCalled();
  });
});
