import Link from "next/link";
import { Medal, Trophy } from "lucide-react";
import TaleCard from "../../components/TaleCard";
import StoryAvatar from "../../components/StoryAvatar";
import { fetchLeaderboard } from "../../lib/api";

export default async function LeaderboardPage() {
  const { storytellers, stories } = await fetchLeaderboard();
  const champion = storytellers[0];
  const bestStory = stories[0];

  return (
    <div className="space-y-7">
      <section className="press-hero p-6 sm:p-8">
        <div className="grid gap-7 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.18em] text-press-gold">
              Hall of type
            </p>
            <h1 className="mt-4 max-w-4xl font-display text-5xl leading-[0.94] text-press-paper sm:text-7xl">
              The sheets with heat, and the tellers who earned it.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-press-paper/74">
              The hall rewards crafted work: public hearts, approved tales, and
              storyteller cred gathered over time.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border border-white/12 bg-white/[0.06] p-5">
              <Trophy className="text-press-gold" size={24} />
              <p className="mt-4 font-display text-3xl text-press-paper">
                {champion?.displayName ?? "No crown yet"}
              </p>
              <p className="mt-2 text-sm leading-6 text-press-paper/64">
                {champion
                  ? `${champion.creditsTotal} cred`
                  : "First crafted tale wins the room."}
              </p>
            </div>
            <div className="border border-white/12 bg-white/[0.06] p-5">
              <Medal className="text-press-green" size={24} />
              <p className="mt-4 font-display text-3xl text-press-paper">
                {bestStory?.title ?? "Waiting for a sheet"}
              </p>
              <p className="mt-2 text-sm leading-6 text-press-paper/64">
                {bestStory
                  ? `${bestStory.upvotes} hearts`
                  : "No ranked story yet."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="press-panel p-5 sm:p-6">
          <p className="press-label">Storytellers</p>
          <div className="mt-5 space-y-3">
            {storytellers.length === 0 ? (
              <p className="text-sm leading-7 text-press-ink/68 dark:text-press-paper/68">
                The storyteller board is still empty.
              </p>
            ) : (
              storytellers.map((leader, index) => (
                <div
                  key={leader.userId}
                  className="flex items-center justify-between gap-4 border border-press-ink/10 bg-white/45 p-3 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="type-tile">#{index + 1}</span>
                    <StoryAvatar
                      name={leader.displayName}
                      src={leader.avatarUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-press-ink dark:text-press-paper">
                        {leader.displayName}
                      </p>
                      <p className="font-mono text-[0.66rem] uppercase tracking-[0.12em] text-press-ink/48 dark:text-press-paper/48">
                        {leader.storyCount} stories / {leader.totalHearts}{" "}
                        hearts
                      </p>
                    </div>
                  </div>
                  <span className="font-display text-2xl text-press-copper">
                    {leader.creditsTotal}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="press-label">Stories</p>
              <h2 className="mt-2 font-display text-4xl text-press-ink dark:text-press-paper">
                Best-loved sheets
              </h2>
            </div>
            <Link href="/compose" className="button-primary">
              Set a tale
            </Link>
          </div>
          {stories.length === 0 ? (
            <div className="press-panel p-7 text-sm leading-7 text-press-ink/68 dark:text-press-paper/68">
              No stories have been hearted yet.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {stories.map((story) => (
                <TaleCard key={story.id} tale={story} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
