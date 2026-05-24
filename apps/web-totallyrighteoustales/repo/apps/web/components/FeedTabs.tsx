import Link from "next/link";

const tabs = [
  { label: "Hot", value: "hot" },
  { label: "New", value: "new" },
  { label: "Top", value: "top" },
];

export default function FeedTabs({ current }: { current: string }) {
  return (
    <div className="inline-flex flex-wrap gap-2 border border-press-ink/15 bg-white/35 p-1.5 text-sm shadow-soft backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={`/?sort=${tab.value}`}
          className={`rounded-md px-4 py-2 font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em] transition ${
            current === tab.value
              ? "bg-press-ink text-press-paper dark:bg-press-paper dark:text-press-ink"
              : "text-press-ink/66 hover:text-press-copper dark:text-press-paper/66"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
