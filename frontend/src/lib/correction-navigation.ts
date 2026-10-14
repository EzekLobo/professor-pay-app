import type { KodlandReview } from "./api";

export type ReviewGrouping = "class" | "student" | "lesson";
export const lessonLabel = (review: KodlandReview) =>
  `Aula ${review.lesson_number || "–"}: ${review.lesson_title || "Sem título"}`;

export const groupReviews = <T,>(items: T[], keyFor: (item: T) => string) =>
  [...items.reduce((groups, item) => {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
    return groups;
  }, new Map<string, T[]>())].sort(([first], [second]) => first.localeCompare(second, "pt-BR"));

export function orderedReviews(reviews: KodlandReview[], grouping: ReviewGrouping) {
  return groupReviews(reviews, (review) => review.external_class_name || "Turma não informada")
    .flatMap(([, classReviews]) => grouping === "class" ? classReviews :
      groupReviews(classReviews, grouping === "student"
        ? (review) => review.student_name || "Aluno não informado"
        : lessonLabel).flatMap(([, items]) => items));
}

export function correctionUrl(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value, "https://bo.kodland.org");
    if (!["https://learn.kodland.org", "https://bo.kodland.org"].includes(url.origin)
      || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function authenticatedCorrectionUrl(value: string, tokens: { access_token: string; refresh_token: string }) {
  const safeUrl = correctionUrl(value);
  if (!safeUrl) return null;
  const url = new URL(safeUrl);
  if (url.origin !== "https://learn.kodland.org") return safeUrl;
  // Official Learn middleware consumes both query parameters to initialize its
  // own session. Passwords are never included. Keep this URL only in the iframe.
  url.searchParams.set("token", tokens.access_token);
  url.searchParams.set("refresh_token", tokens.refresh_token);
  return url.href;
}
