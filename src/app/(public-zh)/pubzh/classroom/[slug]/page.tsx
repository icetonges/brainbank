import type { Metadata } from "next";
import { ClassroomArticleView } from "@/components/views/classroom-article";
import { publishedArticleSlugs } from "@/lib/public-pages";

// Chinese twin of /pub/classroom/[slug] (see src/lib/public-pages.ts).
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

export default async function PublicClassroomArticlePageZh({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ClassroomArticleView slug={slug} lang="zh" isOwner={false} />;
}
