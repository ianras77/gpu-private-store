import { CloudParticles } from "../components/CloudParticles";
import { Hero } from "../components/Hero";
import { RadioHeroPlayer } from "../components/RadioHeroPlayer";
import { MrRassyNotesPanel } from "../components/MrRassyNotesPanel";
import { PhotosShowcase } from "../components/PhotosShowcase";
import { BedtimeStoriesTeaser } from "../components/BedtimeStoriesTeaser";
import { MinecraftHomeCallout } from "../components/MinecraftHomeCallout";
import { ThoughtsPanel } from "../components/ThoughtsPanel";
import { Footer } from "../components/Footer";

export default function HomePage() {
  return (
    <main className="relative overflow-hidden pb-12">
      <div className="absolute inset-0 -z-10 h-full w-full">
        <CloudParticles />
        <div className="absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(circle_at_top,rgba(255,230,109,0.18),transparent_22%),radial-gradient(circle_at_20%_22%,rgba(66,245,255,0.16),transparent_30%),radial-gradient(circle_at_78%_16%,rgba(255,79,216,0.18),transparent_30%)]" />
        <div className="absolute left-1/2 top-56 hidden h-[72%] w-px -translate-x-1/2 bg-gradient-to-b from-white/14 via-white/0 to-transparent lg:block" />
      </div>
      <Hero />
      <ThoughtsPanel />
      <RadioHeroPlayer />
      <MrRassyNotesPanel />
      <PhotosShowcase />
      <BedtimeStoriesTeaser />
      <MinecraftHomeCallout />
      <Footer />
    </main>
  );
}
