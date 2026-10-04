import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { PhotosGalleryPage } from "../../components/PhotosGalleryPage";
import { RoomShell } from "../../components/RoomShell";

export const metadata: Metadata = {
  title: "Family Photos // Rassys",
  description:
    "A shared family photo and video library, organized by album and date.",
  robots: { index: false, follow: false },
};

export default function PhotosPage() {
  return (
    <RoomShell theme="archive" channel="family" agent="family-archivist">
      <main className="min-h-screen">
        <PhotosGalleryPage />
        <Footer />
      </main>
    </RoomShell>
  );
}
