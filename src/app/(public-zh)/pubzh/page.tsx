import { HomeView } from "@/components/views/home";

// Chinese twin of /pub (see src/lib/public-pages.ts).
export const revalidate = 86400;

export default function PublicHomeZh() {
  return <HomeView lang="zh" isOwner={false} />;
}
