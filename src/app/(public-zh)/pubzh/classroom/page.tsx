import { ClassroomIndexView } from "@/components/views/classroom-index";

// Chinese twin of /pub/classroom (see src/lib/public-pages.ts).
export const revalidate = 86400;

export default function PublicClassroomIndexZh() {
  return <ClassroomIndexView activeTab="all" lang="zh" isOwner={false} />;
}
