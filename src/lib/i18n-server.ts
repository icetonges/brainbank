import { cookies } from "next/headers";
import type { Lang } from "./i18n";

/**
 * Resolves the page language server-side: an explicit ?lang= param (set by
 * the header's LanguageToggle when it navigates) wins, otherwise the `lang`
 * cookie the toggle also sets, otherwise English. Server-only (next/headers)
 * — client components receive `lang` as a prop instead.
 */
export async function getLang(langParam?: string): Promise<Lang> {
  if (langParam === "zh") return "zh";
  if (langParam === "en") return "en";
  const cookieStore = await cookies();
  return cookieStore.get("lang")?.value === "zh" ? "zh" : "en";
}
