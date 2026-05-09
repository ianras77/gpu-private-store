export default function DiffView({
  original,
  suggested,
}: {
  original: string;
  suggested: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="story-note rounded-[1.7rem] p-5 text-sm">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-ink/55 dark:text-parchment/55">
          Original
        </p>
        <p className="mt-3 whitespace-pre-wrap leading-7 text-ink/80 dark:text-parchment/80">
          {original}
        </p>
      </div>
      <div className="rounded-[1.7rem] border border-moss/25 bg-moss/10 p-5 text-sm dark:border-moss/30 dark:bg-moss/15">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-moss dark:text-sky">
          Suggested
        </p>
        <p className="mt-3 whitespace-pre-wrap leading-7 text-ink/82 dark:text-parchment/82">
          {suggested}
        </p>
      </div>
    </div>
  );
}
