import type { Metadata, Viewport } from "next";
import AdminPanel from "./AdminPanel";

export const metadata: Metadata = { title: "Osoblje | Studio Princess", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#2C2A29" };

// Separate staff area: its own header and navigation, none of the public site chrome.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#F4F1EC]">
    <AdminPanel />
    {children}
  </div>;
}
