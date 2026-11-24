import type { Metadata } from "next";
import { auth } from "@/auth";
import { getLang } from "@/lib/i18n-server";
import { SubcategoryView } from "@/components/views/subcategory";

export const dynamic = "force-dynamic";

/** Canonical, `?lang=`-free URL for this subcategory — see the matching
 * comment on classroom/[slug]/page.tsx's generateMetadata. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ subcategorySlug: string }>;
}): Promise<Metadata> {
  const { subcategorySlug } = await params;
  return { alternates: { canonical: `/${subcategorySlug}` } };
}

export default async function SubcategoryLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ subcategorySlug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { subcategorySlug } = await params;
  const { lang: langParam } = await searchParams;
  const session = await auth();
  const lang = await getLang(langParam);
  return <SubcategoryView subcategorySlug={subcategorySlug} lang={lang} isOwner={Boolean(session)} />;
}
