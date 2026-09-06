import type { Metadata } from "next";
import { BedtimeStoriesHero } from "../../components/BedtimeStoriesHero";
import { Footer } from "../../components/Footer";
import { BedtimeStoriesPanel } from "../../components/BedtimeStoriesPanel";
import { RoomShell } from "../../components/RoomShell";

export const metadata: Metadata = {
  title: "Real Life Bedtime Stories // Ian Rasmussen",
  description:
    "Recorded bedtime stories, playable here and shared through a simple feed when they are ready.",
};

export default function RealLifeBedtimeStoriesPage() {
  return (
    <RoomShell theme="stories" channel="stories" agent="storyteller"><main className="min-h-screen pb-6">
      <BedtimeStoriesHero />
      <BedtimeStoriesPanel />
      <Footer />
    </main></RoomShell>
  );
}
