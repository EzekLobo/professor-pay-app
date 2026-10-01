import { redirect } from "next/navigation";

type LegacyPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Compatibility route for bookmarks and previously shared links.
 * Pedagogical data now lives inside Turmas, so keep the old URL working
 * without rendering a duplicate screen.
 */
export default async function KodlandPage({ searchParams }: LegacyPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }

  redirect(`/classes${query.size > 0 ? `?${query.toString()}` : ""}`);
}
