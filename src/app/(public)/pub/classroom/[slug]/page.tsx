import type { Metadata } from "next";
import { ClassroomArticleView } from "@/components/views/classroom-article";
import { publishedArticleSlugs } from "@/lib/public-pages";

// Cached copy for anonymous English visitors (see src/lib/public-pages.ts).
// Writes revalidate on demand; the weekly value is only a backstop.
export const revalidate = 604800;

export const generateStaticParams = publishedArticleSlugs;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { alternates: { canonical: `/classroom/${slug}` } };
}

export default async function PublicClassroomArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ClassroomArticleView slug={slug} lang="en" isOwner={false} />;
}
