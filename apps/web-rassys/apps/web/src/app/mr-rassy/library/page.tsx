import Link from "next/link";
import { ArrowDownRight, BookOpen, Disc3, Headphones, Radio, Sparkles } from "lucide-react";
import { ListeningRoomPanel } from "../../../components/ListeningRoomPanel";
import { MrRassyStationIntelligence } from "../../../components/MrRassyStationIntelligence";

const doors = [
  { href: "/mr-rassy#what-he-keeps", label: "This dial", body: "What the station is choosing and why.", Icon: Radio },
  { href: "/mr-rassy/notes", label: "A thought", body: "The latest thing Mr Rassy has been working out.", Icon: BookOpen },
  { href: "/mr-rassy/hi-res", label: "Good headphones", body: "The records that reward a closer listen.", Icon: Headphones },
  { href: "/mr-rassy/notes", label: "A band", body: "Follow an artist thread through the set notes.", Icon: Sparkles },
];

export default function MrRassyLibraryPage() {
  return <main className="relative mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-6">
    <section className="glass-panel overflow-hidden rounded-[30px] p-5 md:p-8">
      <div className="eyebrow"><Disc3 size={13} className="mr-2 inline text-glow" /> MR RASSY // THE STACKS</div>
      <div className="mt-3 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><h1 className="section-title text-4xl sm:text-6xl">Wander around.</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-cloud/72">This is not a spreadsheet of music. It is the part of Mr Rassy’s mind where records, memories, questions, and strange little connections are left within reach.</p></div><Link href="/mr-rassy" className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-glow">Back to the room <ArrowDownRight size={14} /></Link></div>
      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{doors.map(({ href, label, body, Icon }) => <Link key={label} href={href} className="group rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:-translate-y-1 hover:border-glow/50"><Icon size={17} className="text-glow" /><div className="mt-4 text-sm font-semibold text-white group-hover:text-glow">{label}</div><p className="mt-1 text-xs leading-5 text-cloud/58">{body}</p><div className="mt-4 text-[10px] uppercase tracking-[0.18em] text-cloud/42">Open the door ↗</div></Link>)}</div>
    </section>
    <section className="mt-7"><div className="mb-4"><div className="eyebrow">The mind map</div><h2 className="section-title mt-2 text-3xl sm:text-4xl">Start with what he is thinking.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-cloud/65">The notes, recommendations, listener pull, and shelves are one living trail. Follow whichever signal catches you first.</p></div><MrRassyStationIntelligence /></section>
    <section className="mt-8"><div className="mb-4"><div className="eyebrow">The shelves, opened up</div><h2 className="section-title mt-2 text-3xl sm:text-4xl">Find a record. Keep following.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-cloud/65">Search, filter, and play from the library that feeds the station. The useful details stay attached to every record.</p></div><ListeningRoomPanel /></section>
  </main>;
}
