import { HomeView } from "@/components/views/home";

// Cached copy of the homepage for anonymous English visitors (see
// src/lib/public-pages.ts). Classroom writes revalidate it immediately; the
// daily backstop picks up counts changed by other flows (notes, edges, tags).
export const revalidate = 86400;

export default function PublicHome() {
  return <HomeView lang="en" isOwner={false} />;
}
