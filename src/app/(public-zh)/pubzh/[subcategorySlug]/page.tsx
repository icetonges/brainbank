import type { Metadata } from "next";
import { SubcategoryView } from "@/components/views/subcategory";
import { subcategorySlugs } from "@/lib/public-pages";

// Chinese twin of /pub/[subcategorySlug] (see src/lib/public-pages.ts).
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

export default async function PublicSubcategoryPageZh({
  params,
}: {
  params: Promise<{ subcategorySlug: string }>;
}) {
  const { subcategorySlug } = await params;
  return <SubcategoryView subcategorySlug={subcategorySlug} lang="zh" isOwner={false} />;
}
