import { redirect } from "next/navigation";

// Keep saved links and notification focus while using a single destination.
export default async function LegacyCorrectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  redirect(`/classes${query.size ? `?${query}` : ""}`);
}
