import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { PhotosGalleryPage } from "../../components/PhotosGalleryPage";
import { RoomShell } from "../../components/RoomShell";
import { requireAdmin } from "../../lib/admin-auth";

export const metadata: Metadata = {
  title: "Family Photos // Ian Rasmussen",
  description:
    "Family photos and short videos from home, gathered into a living gallery on my site."
};

export default async function PhotosPage() {
  const authorized = await requireAdmin();
  return (
    <RoomShell theme="archive" channel="family" agent="family-archivist"><main className="min-h-screen">
      {authorized ? <PhotosGalleryPage /> : <section className="mx-auto max-w-2xl px-6 py-24"><p className="eyebrow">Family archive</p><h1 className="section-title mt-4">This shelf is private.</h1><p className="mt-4 text-cloud/75">Sign in through the admin deck to view family media.</p></section>}
      <Footer />
    </main></RoomShell>
  );
}
