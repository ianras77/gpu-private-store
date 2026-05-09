import Link from "next/link";

const tabs = [
  { label: "Glowing", value: "hot" },
  { label: "Fresh", value: "new" },
  { label: "Most Loved", value: "top" },
];

export default function FeedTabs({ current }: { current: string }) {
  return (
    <div className="inline-flex flex-wrap gap-2 rounded-[1.5rem] border border-white/10 bg-black/20 p-2 text-sm shadow-soft backdrop-blur-sm">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={`/?sort=${tab.value}`}
          className={`rounded-full px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] transition ${
            current === tab.value
              ? "bg-gold text-ink shadow-soft"
              : "text-parchment/72 hover:text-parchment"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
