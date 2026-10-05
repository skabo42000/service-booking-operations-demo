import { notFound } from "next/navigation";
import { ADMIN_SECTIONS } from "../sections";

// The staff app lives in the admin layout so it keeps its state between sections; this page only validates the URL.
export default async function AdminSectionPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  if (section && (section.length > 1 || !ADMIN_SECTIONS.some((item) => item.slug === section[0]))) notFound();
  return null;
}
