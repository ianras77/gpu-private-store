import Link from "next/link";
import TaleCard from "../../components/TaleCard";
import StoryAvatar from "../../components/StoryAvatar";
import { fetchLeaderboard } from "../../lib/api";

type LeaderboardStoryteller = {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  storyCount: number;
  totalHearts: number;
  creditsTotal: number;
};

type LeaderboardStory = {
  id: string;
  title: string;
  excerpt: string;
  authorPseudonym: string;
  authorAvatarUrl?: string | null;
  createdAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_EDITS";
  assistMode: "HANDMADE" | "STUDIO";
  storyPrompt?: string | null;
  isAnonymous: boolean;
  hotScore: number;
  topScore: number;
  imageUrl?: string | null;
  upvotes: number;
  downvotes: number;
};

export default async function LeaderboardPage() {
  const {
    storytellers,
    stories,
  }: {
    storytellers: LeaderboardStoryteller[];
    stories: LeaderboardStory[];
  } = await fetchLeaderboard();
  const champion = storytellers[0];
  const bestStory = stories[0];

  return (
    <div className="space-y-8">
      <section className="ink-panel relative overflow-hidden rounded-[3rem] px-8 py-10 md:px-10 md:py-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,_rgba(244,201,93,0.34),_transparent_68%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-ember/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 top-14 h-56 w-56 rounded-full bg-sky/15 blur-3xl" />

        <div className="relative grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.42em] text-parchment/55">
              Hall of wonder
            </p>
            <h1 className="mt-4 max-w-4xl font-display text-5xl leading-[0.95] text-parchment md:text-7xl">
              The scoreboard should feel like a marquee, not a spreadsheet.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-parchment/78">
              Named storytellers rise on public cred. Stories rise on hearts,
              whether they wear a name or arrive masked. This page now treats
              both like headline acts.
            </p>
            <div className="mt-7 flex flex-wrap gap-2 text-[0.68rem] uppercase tracking-[0.22em] text-parchment/72">
              <span className="rounded-full border border-parchment/20 bg-white/5 px-4 py-2">
                Storyteller board
              </span>
              <span className="rounded-full border border-parchment/20 bg-white/5 px-4 py-2">
                Best-loved stories
              </span>
              <span className="rounded-full border border-parchment/20 bg-white/5 px-4 py-2">
                Hearts decide
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-[2rem] border border-parchment/15 bg-white/10 p-6 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-parchment/52">
                Storytellers ranked
              </p>
              <p className="mt-3 font-display text-5xl text-parchment">
                {storytellers.length}
              </p>
            </div>
            <div className="rounded-[2rem] border border-gold/20 bg-gold/10 p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-gold/80">
                Stories with heat
              </p>
              <p className="mt-3 font-display text-5xl text-parchment">
                {stories.length}
              </p>
            </div>
            <div className="rounded-[2rem] border border-sky/20 bg-sky/10 p-6 sm:col-span-3 xl:col-span-1">
              <p className="text-xs uppercase tracking-[0.28em] text-sky/90">
                Current crown
              </p>
              <p className="mt-3 text-sm leading-7 text-parchment/76">
                {champion
                  ? `${champion.displayName} leads right now.`
                  : "The first storyteller to complete a profile and earn hearts can take the crown."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card rounded-[2.4rem] p-8">
          <p className="eyebrow">Top storyteller</p>
          {champion ? (
            <div className="mt-5 space-y-5">
              <div className="flex items-center gap-5">
                <StoryAvatar
                  name={champion.displayName}
                  src={champion.avatarUrl}
                  size="lg"
                />
                <div>
                  <h2 className="font-display text-4xl text-ink dark:text-parchment">
                    {champion.displayName}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-ink/72 dark:text-parchment/72">
                    {champion.creditsTotal} storyteller cred,{" "}
                    {champion.totalHearts} hearts, and {champion.storyCount}{" "}
                    approved stories.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="stat-panel rounded-[1.8rem] p-5">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-ink/48 dark:text-parchment/50">
                    Storyteller cred
                  </p>
                  <p className="mt-3 font-display text-5xl text-ink dark:text-parchment">
                    {champion.creditsTotal}
                  </p>
                </div>
                <div className="stat-panel rounded-[1.8rem] p-5">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-ink/48 dark:text-parchment/50">
                    Hearts gathered
                  </p>
                  <p className="mt-3 font-display text-5xl text-ink dark:text-parchment">
                    {champion.totalHearts}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="story-note mt-5 rounded-[1.8rem] p-5 text-sm leading-7 text-ink/72 dark:text-parchment/72">
              No storyteller rankings yet. The first finished profile with a
              story people love can take the room.
            </div>
          )}
        </div>

        <div className="card rounded-[2.4rem] p-8">
          <p className="eyebrow">Best story right now</p>
          {bestStory ? (
            <div className="mt-5 space-y-4">
              <h2 className="font-display text-4xl text-ink dark:text-parchment">
                {bestStory.title}
              </h2>
              <p className="text-sm uppercase tracking-[0.22em] text-ink/52 dark:text-parchment/52">
                By {bestStory.authorPseudonym} with {bestStory.upvotes} hearts
              </p>
              <p className="text-sm leading-7 text-ink/76 dark:text-parchment/76">
                {bestStory.excerpt}...
              </p>
              <Link
                href={`/tales/${bestStory.id}`}
                className="inline-flex text-sm font-semibold uppercase tracking-[0.18em] text-ember"
              >
                Read the leading tale
              </Link>
            </div>
          ) : (
            <div className="story-note mt-5 rounded-[1.8rem] p-5 text-sm leading-7 text-ink/72 dark:text-parchment/72">
              No story rankings yet. The first tale with enough hearts gets the
              marquee.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="card rounded-[2.4rem] p-6 md:p-8">
          <p className="eyebrow">Best storytellers</p>
          <div className="mt-6 space-y-4">
            {storytellers.length === 0 ? (
              <p className="text-sm leading-7 text-ink/72 dark:text-parchment/72">
                The storyteller board is still empty.
              </p>
            ) : (
              storytellers.map((leader: LeaderboardStoryteller, index: number) => (
                <div
                  key={leader.userId}
                  className="stat-panel flex items-center justify-between rounded-[1.8rem] px-4 py-4"
                >
                  <div className="flex items-center gap-4">
                    <span className="w-8 text-sm text-ink/45 dark:text-parchment/50">
                      #{index + 1}
                    </span>
                    <StoryAvatar
                      name={leader.displayName}
                      src={leader.avatarUrl}
                      size="sm"
                    />
                    <div>
                      <p className="font-medium text-ink dark:text-parchment">
                        {leader.displayName}
                      </p>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45 dark:text-parchment/50">
                        {leader.storyCount} stories • {leader.totalHearts}{" "}
                        hearts
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-moss/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-moss">
                    {leader.creditsTotal} cred
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="eyebrow">Best stories</p>
            <h2 className="mt-2 font-display text-4xl text-parchment">
              The stories drawing the most hearts.
            </h2>
          </div>
          {stories.length === 0 ? (
            <div className="card rounded-[2.3rem] p-8 text-sm leading-7 text-ink/72 dark:text-parchment/72">
              No stories have been hearted yet.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {stories.map((story: LeaderboardStory) => (
                <TaleCard key={story.id} tale={story} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
