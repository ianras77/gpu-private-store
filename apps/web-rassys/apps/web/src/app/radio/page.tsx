import type { Metadata } from "next";
import Link from "next/link";
import { RadioHeroPlayer } from "../../components/RadioHeroPlayer";
import { RadioTower } from "../../components/RadioTower";
import { Footer } from "../../components/Footer";
import { Button } from "../../components/ui/button";

export const metadata: Metadata = {
  title: "Mr Rassy Radio // Ian Rasmussen",
  description:
    "My live station, with booth notes, requests, and the set moving in real time."
};

export default function RadioPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="text-[11px] uppercase tracking-[0.4em] text-cloud/58">
          Ian Rasmussen // Mr Rassy Radio
        </div>
        <h1 className="section-title text-4xl">
          <span className="magical-text">Mr Rassy</span> Radio
        </h1>
        <p className="mt-3 max-w-3xl text-cloud/80">
          If you want the quickest read on where my head is, start here. The
          player comes first, the line stays open, and the notebook trails the
          music as it moves.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.24em] text-cloud/60">
          <span className="rave-chip rounded-full px-3 py-2">
            Live booth
          </span>
          <span className="rave-chip rounded-full px-3 py-2">
            Request line
          </span>
          <span className="rave-chip rounded-full px-3 py-2">
            Booth notes
          </span>
          <span className="rave-chip rounded-full px-3 py-2">
            Phone player
          </span>
        </div>
        <div className="mt-6">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" asChild>
              <Link href="/radio/notes">Notes from Mr Rassy</Link>
            </Button>
            <Button asChild>
              <Link href="/radio/app">Phone app view</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/listening-room">Local listening room</Link>
            </Button>
          </div>
        </div>
      </div>
      <RadioHeroPlayer />
      <RadioTower />
      <Footer />
    </main>
  );
}
