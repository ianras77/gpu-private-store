import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { PhotosGalleryPage } from "../../components/PhotosGalleryPage";
import { RoomShell } from "../../components/RoomShell";

export const metadata: Metadata = {
  title: "Family Photos // Ian Rasmussen",
  description:
    "Family photos and short videos from home, gathered into a living gallery on my site."
};

export default function PhotosPage() {
  return (
    <RoomShell theme="archive" channel="family" agent="family-archivist"><main className="min-h-screen">
      <PhotosGalleryPage />
      <Footer />
    </main></RoomShell>
  );
}
