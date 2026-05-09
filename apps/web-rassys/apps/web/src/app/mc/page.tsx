import type { Metadata } from "next";
import { MinecraftObservatory } from "../../components/MinecraftObservatory";
import { Footer } from "../../components/Footer";

export const metadata: Metadata = {
  title: "Minecraft World // Ian Rasmussen",
  description:
    "A live window into the Minecraft world I keep building, revisiting, and watching over.",
};

export default function MinecraftPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="section-title text-4xl">
          <span className="magical-text">mc_troupe</span> Observatory
        </h1>
        <p className="mt-3 max-w-3xl text-cloud/80">
          This is the part of the site where I keep an eye on the world I have
          been building, revisiting, and leaving running in the background.
        </p>
      </div>
      <MinecraftObservatory mode="page" />
      <Footer />
    </main>
  );
}
