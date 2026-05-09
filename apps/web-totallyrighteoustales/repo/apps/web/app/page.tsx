import Link from "next/link";
import FeedTabs from "../components/FeedTabs";
import FeedList from "../components/FeedList";
import SearchBar from "../components/SearchBar";
import StoryAvatar from "../components/StoryAvatar";
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

function formatMarqueeValue(value: number | string) {
  return typeof value === "number" ? value.toString().padStart(2, "0") : value;
}

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

  const featuredMain = featured[0] || leaderboard.stories[0];
  const champion = leaderboard.storytellers[0];
  const storytellerConstellation = leaderboard.storytellers.slice(0, 6);
  const marqueeStats = [
    {
      label: query ? "Search hits" : "Stories in view",
      value: tales.length,
      note: query ? "matching your current search" : "ready to read right now",
    },
    {
      label: "Top story hearts",
      value: featuredMain?.upvotes ?? 0,
      note: featuredMain
        ? "on the spotlight tale"
        : "waiting for the first legend",
    },
    {
      label: "Named storytellers",
      value: leaderboard.storytellers.length,
      note: champion
        ? `${champion.displayName} currently holds the crown`
        : "waiting for the first crown",
    },
  ];

  return (
    <div className="space-y-10">
      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="ink-panel story-arch relative overflow-hidden rounded-[3rem] px-8 py-9 md:px-12 md:py-12">
          <div className="fairy-dust absolute inset-0" />
          <div className="pointer-events-none absolute -left-16 top-10 h-64 w-64 rounded-full bg-ember/30 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-gold/18 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-sky/12 blur-3xl" />

          <div className="relative">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.38em] text-parchment/58">
              Big stories deserve a lantern-lit room
            </p>
            <h1 className="mt-5 max-w-5xl font-display text-6xl leading-none text-parchment md:text-7xl xl:text-[5.6rem]">
              Stories should arrive like a fairy-tale door just swung open.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-parchment/78">
              Totally Righteous Tales is for strange premises, bold openings,
              moonlit images, named storytellers, anonymous legends, and the
              kind of public hearting that makes good work impossible to miss.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/compose" className="button-primary">
                Start a story
              </Link>
              <Link
                href="/profile"
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-parchment/86 transition hover:border-white/22 hover:text-parchment"
              >
                Claim your storyteller name
              </Link>
              <Link
                href="/leaderboard"
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-parchment/86 transition hover:border-white/22 hover:text-parchment"
              >
                Enter the hall of wonder
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              <span className="story-pill border-white/10 bg-white/5 text-parchment/82">
                Write by hand
              </span>
              <span className="story-pill border-white/10 bg-white/5 text-parchment/82">
                Spin a prompt
              </span>
              <span className="story-pill border-white/10 bg-white/5 text-parchment/82">
                Publish named or masked
              </span>
              <span className="story-pill border-white/10 bg-white/5 text-parchment/82">
                Hearts build cred
              </span>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {marqueeStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[1.9rem] border border-white/10 bg-white/5 p-5 shadow-soft"
                >
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-parchment/54">
                    {stat.label}
                  </p>
                  <p className="mt-3 font-display text-5xl text-parchment">
                    {formatMarqueeValue(stat.value)}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-parchment/68">
                    {stat.note}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <section className="card rounded-[2.6rem] p-7 md:p-8">
            <p className="eyebrow">Find the exact kind of weird you want</p>
            <h2 className="mt-3 font-display text-4xl text-ink dark:text-parchment">
              Search by mood, image, setting, or the impossible detail.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-ink/72 dark:text-parchment/72">
              Dig for moonlit porches, lighthouse ghosts, woodland spells, cozy
              dread, tiny miracles, or anything else your reading brain wants
              next.
            </p>
            <div className="mt-6">
              <SearchBar initialQuery={query} />
            </div>
            {query && (
              <p className="mt-4 text-sm text-ink/60 dark:text-parchment/60">
                Showing {tales.length} stories for &quot;{query}&quot;.
              </p>
            )}
          </section>

          <section className="card overflow-hidden rounded-[2.6rem]">
            <div className="relative h-56 bg-[linear-gradient(135deg,_rgba(28,16,20,0.98),_rgba(84,38,34,0.95))]">
              {featuredMain?.imageUrl ? (
                <>
                  <StoryImage
                    src={featuredMain.imageUrl}
                    alt={featuredMain.title}
                    fill
                    priority
                    sizes="(min-width: 1280px) 36vw, 100vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                </>
              ) : (
                <div className="flex h-full items-center justify-center bg-story text-ink">
                  <span className="font-display text-7xl">
                    {featuredMain?.title?.slice(0, 1) ?? "T"}
                  </span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 p-6">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-parchment/55">
                  Spotlight tale
                </p>
                <h2 className="mt-2 font-display text-4xl leading-tight text-parchment">
                  {featuredMain?.title ??
                    "The spotlight is waiting for its first legend."}
                </h2>
              </div>
            </div>

            <div className="space-y-4 p-7 md:p-8">
              {featuredMain ? (
                <>
                  <p className="text-sm uppercase tracking-[0.22em] text-ink/52 dark:text-parchment/52">
                    By {featuredMain.authorPseudonym} with{" "}
                    {featuredMain.upvotes} hearts
                  </p>
                  <p className="text-sm leading-7 text-ink/76 dark:text-parchment/76">
                    {featuredMain.excerpt}...
                  </p>
                  <Link
                    href={`/tales/${featuredMain.id}`}
                    className="text-sm font-semibold uppercase tracking-[0.18em] text-ember"
                  >
                    Read the spotlight
                  </Link>
                </>
              ) : (
                <p className="text-sm leading-7 text-ink/72 dark:text-parchment/72">
                  The homepage marquee is ready. It just needs the first story
                  that makes people stop.
                </p>
              )}
            </div>
          </section>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="card rounded-[2.6rem] p-8">
          <p className="eyebrow">Current crown</p>
          <h2 className="mt-3 font-display text-4xl text-ink dark:text-parchment">
            The storyteller everyone is watching.
          </h2>
          {champion ? (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-4">
                <StoryAvatar
                  name={champion.displayName}
                  src={champion.avatarUrl}
                  size="lg"
                />
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-ink/48 dark:text-parchment/50">
                    Leading the board
                  </p>
                  <h3 className="mt-2 font-display text-4xl text-ink dark:text-parchment">
                    {champion.displayName}
                  </h3>
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
              <Link href="/leaderboard" className="button-secondary">
                See the full ranking
              </Link>
            </div>
          ) : (
            <div className="story-note mt-6 rounded-[1.8rem] p-5 text-sm leading-7 text-ink/72 dark:text-parchment/72">
              Nobody has claimed the storyteller crown yet. The first complete
              profile with a story people love could take the room.
            </div>
          )}
        </div>

        <div className="card rounded-[2.6rem] p-8">
          <p className="eyebrow">How the room works</p>
          <h2 className="mt-3 max-w-3xl font-display text-4xl text-ink dark:text-parchment">
            Write loud. Choose your mask. Let hearts keep score.
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="stat-panel rounded-[1.8rem] p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-ink/48 dark:text-parchment/50">
                1. Dream it
              </p>
              <p className="mt-3 text-sm leading-7 text-ink/76 dark:text-parchment/76">
                Draft the whole thing yourself or feed the studio a premise,
                mood, setting, and one impossible detail.
              </p>
            </div>
            <div className="stat-panel rounded-[1.8rem] p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-ink/48 dark:text-parchment/50">
                2. Stage it
              </p>
              <p className="mt-3 text-sm leading-7 text-ink/76 dark:text-parchment/76">
                Publish under your storyteller profile when you want the public
                credit, or keep the tale masked and let the work speak first.
              </p>
            </div>
            <div className="stat-panel rounded-[1.8rem] p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-ink/48 dark:text-parchment/50">
                3. Watch it travel
              </p>
              <p className="mt-3 text-sm leading-7 text-ink/76 dark:text-parchment/76">
                Hearts raise the story itself and build storyteller cred behind
                the scenes, whether the author name is visible or not.
              </p>
            </div>
          </div>

          <div className="mt-8 border-t border-ink/10 pt-6 dark:border-white/10">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="eyebrow">Storyteller constellation</p>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-ink/72 dark:text-parchment/72">
                  Real profiles show up here. Anonymous stories can still win
                  the room, but named storytellers get their own visible climb.
                </p>
              </div>
              <Link href="/profile" className="button-secondary">
                Build your profile
              </Link>
            </div>

            {storytellerConstellation.length === 0 ? (
              <div className="story-note mt-5 rounded-[1.8rem] p-5 text-sm leading-7 text-ink/72 dark:text-parchment/72">
                The constellation is empty right now. The next storyteller
                profile will become the first bright point.
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap gap-4">
                {storytellerConstellation.map((storyteller: HomeStoryteller) => (
                  <div
                    key={storyteller.userId}
                    className="flex flex-col items-center gap-3"
                  >
                    <StoryAvatar
                      name={storyteller.displayName}
                      src={storyteller.avatarUrl}
                      size="md"
                    />
                    <p className="max-w-[104px] truncate text-center text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink/60 dark:text-parchment/60">
                      {storyteller.displayName}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.36em] text-parchment/58">
              Story feed
            </p>
            <h2 className="font-display text-5xl text-parchment">
              {query ? `Results for "${query}"` : "Freshly unfurled tales"}
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-parchment/70">
              {query
                ? `${tales.length} stories match your search right now.`
                : "Browse what is hot, new, and collecting real hearts. The cards are louder now on purpose."}
            </p>
          </div>
          {!query && <FeedTabs current={sort} />}
        </div>

        {tales.length === 0 ? (
          <div className="card rounded-[2rem] p-8 text-sm leading-7 text-ink/72 dark:text-parchment/72">
            No stories yet. The stage is lit; it just needs the first tale.
          </div>
        ) : (
          <FeedList initialTales={tales} sort={sort} query={query} />
        )}
      </section>
    </div>
  );
}
