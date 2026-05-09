import type { Metadata } from "next";
import { Footer } from "../../components/Footer";
import { ListeningRoomPanel } from "../../components/ListeningRoomPanel";

export const metadata: Metadata = {
  title: "Listening Room // Ian Rasmussen",
  description:
    "A quieter room for the shelves behind the station, with direct playback from the music I keep at home.",
};

export default function ListeningRoomPage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.4em] text-cloud/58">
            Listening Room
          </div>
          <h1 className="section-title mt-3 text-4xl md:text-5xl">
            A quieter way through the shelves.
          </h1>
          <p className="mt-4 text-base leading-8 text-cloud/80">
            When I do not want the station making the turns for me, this is
            where I go to stay with an album, a voice, or a mood a little
            longer.
          </p>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-6 pb-12">
        <ListeningRoomPanel />
      </div>
      <Footer />
    </main>
  );
}
