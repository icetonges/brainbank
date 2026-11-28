import { ClassroomIndexView } from "@/components/views/classroom-index";

// Cached classroom index for anonymous English visitors (see
// src/lib/public-pages.ts). Writes revalidate on demand; daily is a backstop.
export const revalidate = 86400;

export default function PublicClassroomIndex() {
  return <ClassroomIndexView activeTab="all" lang="en" isOwner={false} />;
}
