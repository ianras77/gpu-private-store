import Link from "next/link";
import { BookMarked, Feather, Flame, Search, Trophy } from "lucide-react";
import FeedTabs from "../components/FeedTabs";
import FeedList from "../components/FeedList";
import SearchBar from "../components/SearchBar";
import StoryImage from "../components/StoryImage";
import {
  fetchFeatured,
  fetchLeaderboard,
  fetchTales,
  searchTales,
} from "../lib/api";

type HomeStoryteller = {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  storyCount: number;
  totalHearts: number;
  creditsTotal: number;
};

type HomeTale = {
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

type HomeLeaderboardData = {
  storytellers: HomeStoryteller[];
  stories: HomeTale[];
};

type SearchResultTale = HomeTale & { similarity?: number };

const pressSteps = [
  {
    icon: Feather,
    title: "Draft the spine",
    copy: "Premise, character, stakes, turn, and voice come before polish.",
  },
  {
    icon: BookMarked,
    title: "Set the pages",
    copy: "Write in scenes, revise with craft notes, then attach art if it serves the tale.",
  },
  {
    icon: Flame,
    title: "Publish with heat",
    copy: "Send it to moderation as a named storyteller or a masked legend.",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams?: { sort?: string; q?: string };
}) {
  const sort = searchParams?.sort ?? "hot";
  const query = searchParams?.q?.trim();
  const [tales, featured, leaderboard]: [
    SearchResultTale[],
    HomeTale[],
    HomeLeaderboardData,
  ] = await Promise.all([
    query ? searchTales(query) : fetchTales(sort),
    fetchFeatured(),
    fetchLeaderboard(),
  ]);

  const spotlight = featured[0] || leaderboard.stories[0] || tales[0];
  const champion = leaderboard.storytellers[0];

  return (
    <div className="space-y-8">
      <section className="press-hero overflow-hidden p-5 sm:p-7 lg:p-9">
        <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-stretch">
          <div className="flex min-h-[520px] flex-col justify-between border border-white/12 p-5 sm:p-7">
            <div>
              <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.18em] text-press-gold">
                Totally Righteous Tales 0.5
              </p>
              <h1 className="mt-5 max-w-4xl font-display text-5xl leading-[0.92] text-press-paper sm:text-7xl lg:text-[5.8rem]">
                The modern Gutenberg app for tall tales with a pulse.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-press-paper/76 sm:text-lg">
                Build medium-to-long stories like a living print shop: set the
                spine, draft by hand, invite careful notes, and publish when the
                pages have earned their ink.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Link href="/compose" className="button-primary">
                Start setting type
              </Link>
              <Link
                href="#press-feed"
                className="button-secondary border-white/20 bg-white/10 text-press-paper hover:text-press-paper"
              >
                Read the feed
              </Link>
              <Link
                href="/profile"
                className="button-secondary border-white/20 bg-white/10 text-press-paper hover:text-press-paper"
              >
                Open studio
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="border border-white/12 bg-white/[0.06] p-5">
              <div className="flex items-center justify-between gap-4">
                <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.18em] text-press-paper/54">
                  Live broadside
                </p>
                <span className="type-tile border-white/15 bg-white/10 text-press-paper/72">
                  {tales.length} tales
                </span>
              </div>
              <h2 className="mt-4 font-display text-4xl leading-tight text-press-paper">
                {spotlight?.title ?? "The first tale is waiting for the press."}
              </h2>
              <p className="mt-4 text-sm leading-7 text-press-paper/68">
                {spotlight
                  ? `${spotlight.excerpt}...`
                  : "Once the first approved story arrives, it becomes the front sheet of the room."}
              </p>
              {spotlight && (
                <Link
                  href={`/tales/${spotlight.id}`}
                  className="mt-5 inline-flex font-mono text-xs font-bold uppercase tracking-[0.18em] text-press-gold"
                >
                  Read the spotlight
                </Link>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="border border-white/12 bg-white/[0.06] p-5">
                <Trophy className="text-press-gold" size={22} />
                <p className="mt-4 font-display text-3xl text-press-paper">
                  {champion?.displayName ?? "No crown yet"}
                </p>
                <p className="mt-2 text-sm leading-6 text-press-paper/64">
                  {champion
                    ? `${champion.creditsTotal} cred and ${champion.totalHearts} hearts.`
                    : "The first crafted story can take the hall."}
                </p>
              </div>
              <div className="border border-white/12 bg-white/[0.06] p-5">
                <Search className="text-press-green" size={22} />
                <p className="mt-4 font-display text-3xl text-press-paper">
                  Search by image
                </p>
                <p className="mt-2 text-sm leading-6 text-press-paper/64">
                  Find lighthouse grief, carnival miracles, iron moons, or one
                  impossible detail.
                </p>
              </div>
            </div>

            {spotlight?.imageUrl ? (
              <div className="relative min-h-[230px] overflow-hidden border border-white/12">
                <StoryImage
                  src={spotlight.imageUrl}
                  alt={spotlight.title}
                  fill
                  priority
                  sizes="(min-width: 1024px) 42vw, 100vw"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="grid min-h-[230px] place-items-center border border-white/12 bg-[linear-gradient(135deg,rgba(216,162,63,0.20),rgba(49,95,141,0.18))] p-8">
                <div className="grid h-36 w-36 place-items-center border border-press-paper/30 font-display text-7xl text-press-paper">
                  TRT
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {pressSteps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="press-panel p-5">
              <div className="flex items-center justify-between gap-4">
                <Icon className="text-press-copper" size={22} />
                <span className="type-tile">0{index + 1}</span>
              </div>
              <h2 className="mt-5 font-display text-3xl text-press-ink dark:text-press-paper">
                {step.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-press-ink/68 dark:text-press-paper/68">
                {step.copy}
              </p>
            </div>
          );
        })}
      </section>

      <section className="press-panel p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="press-label">Search the stacks</p>
            <h2 className="mt-2 font-display text-4xl text-press-ink dark:text-press-paper">
              Search by mood, setting, object, or impossible claim.
            </h2>
          </div>
          <SearchBar initialQuery={query} />
        </div>
      </section>

      <section id="press-feed" className="space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="press-label">Public sheets</p>
            <h2 className="mt-2 font-display text-5xl text-press-ink dark:text-press-paper">
              {query ? `Results for "${query}"` : "Fresh from the press"}
            </h2>
          </div>
          {!query && <FeedTabs current={sort} />}
        </div>

        {tales.length === 0 ? (
          <div className="press-panel p-8 text-sm leading-7 text-press-ink/70 dark:text-press-paper/70">
            No stories yet. The forme is locked, the ink is ready, and the first
            page is waiting.
          </div>
        ) : (
          <FeedList initialTales={tales} sort={sort} query={query} />
        )}
      </section>
    </div>
  );
}
