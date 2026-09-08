import Link from "next/link";

import { safeDate } from "@/lib/api";
import { PublicHeader } from "@/components/PublicHeader";
import { cleanCopy, getPublicSiteData, storySummary, themeName } from "@/lib/public-site";

export default async function HomePage() {
  const siteData = await getPublicSiteData();
  const { publishedStories, activeThemes, leadStory, latestCycle } = siteData;
  const stories = publishedStories.filter((story) => story.slug && story.id);
  const lead = leadStory?.slug ? leadStory : stories[0];
  const otherStories = stories.filter((story) => story.id !== lead?.id).slice(0, 8);
  const leadHref = lead ? `/story/${lead.slug}` : "/archive";

  return (
    <>
      <PublicHeader data={siteData} />
      <main className="shell clean-home">
        <div className="home-location"><span>Latest</span><span>{stories.length} stories</span></div>
        {lead ? (
          <section className="lead-story-card">
            <div className="lead-story-copy">
              <p className="section-kicker">The latest story</p>
              <h1><Link href={leadHref}>{cleanCopy(lead.title)}</Link></h1>
              <p className="lead-story-dek">{storySummary(lead)}</p>
              <div className="story-meta"><span>{lead.object_type === "lead_story" ? "Essay" : "Dispatch"}</span><span>{safeDate(lead.published_at || lead.created_at)}</span></div>
              <Link href={leadHref} className="read-link">Read the story <span aria-hidden="true">→</span></Link>
            </div>
          </section>
        ) : (
          <section className="empty-lead"><h1>The first story is coming.</h1><Link href="/archive" className="read-link">Open the archive →</Link></section>
        )}
        <section className="latest-section" aria-labelledby="latest-heading">
          <div className="section-heading clean-section-heading"><p className="section-kicker">Keep reading</p><h2 id="latest-heading">Latest stories</h2></div>
          <div className="clean-story-list">
            {otherStories.length ? otherStories.map((story, index) => (
              <Link href={`/story/${story.slug}`} key={story.id} className="clean-story-row">
                <span className="story-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="clean-story-main"><strong>{cleanCopy(story.title)}</strong><span>{storySummary(story)}</span></span>
                <span className="clean-story-date">{safeDate(story.published_at || story.created_at)}</span>
              </Link>
            )) : <p className="stack-empty">There are no other published stories yet.</p>}
          </div>
          <Link href="/archive" className="archive-link">View the full archive <span aria-hidden="true">→</span></Link>
        </section>
        <section className="home-bottom-row">
          <div><p className="section-kicker">Follow the threads</p><h2>Channels</h2><div className="channel-pills">{activeThemes.slice(0, 6).map((theme) => <Link href={`/themes/${theme.slug}`} key={theme.slug}>{themeName(theme)}</Link>)}</div></div>
          <div className="quiet-status"><span>Desk status</span><strong>{latestCycle?.completed_at ? `Updated ${safeDate(latestCycle.completed_at)}` : "Publishing"}</strong></div>
        </section>
      </main>
    </>
  );
}
