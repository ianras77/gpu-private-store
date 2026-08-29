import { RadioTower } from "../../components/RadioTower";
import { MrRassyRadioApp } from "../../components/MrRassyRadioApp";

export default function MrRassyPage() {
  return <main className="relative mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-6"><section className="mr-rassy-command glass-panel mb-5 rounded-[30px] p-5 md:p-7"><div className="eyebrow">MR RASSY // SIGNAL DECK</div><div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="section-title text-4xl sm:text-6xl">The booth is thinking.</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-cloud/70">One station, one live thread, and a room that changes when you ask it to.</p></div><div className="hud-readout"><span className="glow-dot h-2 w-2 rounded-full" /> LIVE / LISTEN / RESPOND</div></div></section><MrRassyRadioApp /><RadioTower /></main>;
}
