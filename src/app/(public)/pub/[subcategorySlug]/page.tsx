import type { Metadata } from "next";
import { SubcategoryView } from "@/components/views/subcategory";
import { subcategorySlugs } from "@/lib/public-pages";

// Cached copy for anonymous English visitors (see src/lib/public-pages.ts).
// Writes revalidate on demand; the weekly value is only a backstop.
export const revalidate = 604800;

export const generateStaticParams = subcategorySlugs;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subcategorySlug: string }>;
}): Promise<Metadata> {
  const { subcategorySlug } = await params;
  return { alternates: { canonical: `/${subcategorySlug}` } };
}

export default async function PublicSubcategoryPage({
  params,
}: {
  params: Promise<{ subcategorySlug: string }>;
}) {
  const { subcategorySlug } = await params;
  return <SubcategoryView subcategorySlug={subcategorySlug} lang="en" isOwner={false} />;
}
