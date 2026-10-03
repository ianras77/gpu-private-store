import Link from "next/link";
import Image from "next/image";
import { BookOpen, Clock3 } from "lucide-react";
import type { LearningModule } from "../../lib/learning/schema";
import { RassyMarkdown } from "../RassyMarkdown";
import { LearningProgress } from "./LearningProgress";

export function LearningReader({ module }: { module: LearningModule }) {
  const { metadata, sections } = module;
  return (
    <article
      className="learning-reader"
      key={`${metadata.slug}:v${metadata.version}`}
    >
      <div className="learning-reader-header">
        <Link href="/learn" className="learning-back-link">
          <span aria-hidden="true">←</span> All explorations
        </Link>
        <p className="learning-kicker">
          {metadata.topic}
          {metadata.level ? ` · ${metadata.level}` : ""}
        </p>
        <h1 id="learning-title" tabIndex={-1}>
          {metadata.title}
        </h1>
        <p className="learning-reader-summary">{metadata.summary}</p>
        <div className="learning-reader-meta">
          <span>
            <Clock3 size={15} aria-hidden="true" /> {metadata.minutes ?? 1} min
            {module.estimatedMinutes ? " · estimate" : ""}
          </span>
          <span>
            <BookOpen size={15} aria-hidden="true" /> {sections.length} sections
          </span>
          <span>v{metadata.version}</span>
        </div>
        {metadata.cover && metadata.cover_alt ? (
          <figure className="learning-cover">
            <div className="relative aspect-[16/9] overflow-hidden">
              <Image
                src={`/api/learn/assets/${metadata.slug}/${metadata.cover}`}
                alt={metadata.cover_alt}
                fill
                sizes="(max-width: 760px) 100vw, 720px"
                className="object-cover"
                unoptimized
              />
            </div>
            <figcaption>{metadata.cover_alt}</figcaption>
          </figure>
        ) : null}
        <section
          className="learning-objectives"
          aria-labelledby="learning-objectives-title"
        >
          <h2 id="learning-objectives-title">What you can take away</h2>
          <ul>
            {metadata.objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
        </section>
      </div>
      {module.intro ? (
        <div className="learning-intro">
          <RassyMarkdown
            markdown={module.intro}
            variant="learning"
            learningSlug={metadata.slug}
          />
        </div>
      ) : null}
      <nav className="learning-outline" aria-label="Sections in this module">
        <p>In this exploration</p>
        <ol>
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="learning-sections">
        {sections.map((section, index) => (
          <section key={section.id} className="learning-section">
            <RassyMarkdown
              markdown={section.markdown}
              variant="learning"
              learningSlug={metadata.slug}
            />
            <LearningProgress
              slug={metadata.slug}
              version={metadata.version}
              sectionId={section.id}
            />
            <nav
              className="learning-section-nav"
              aria-label={`Section ${index + 1} navigation`}
            >
              {sections[index - 1] ? (
                <a href={`#${sections[index - 1]!.id}`}>
                  ← {sections[index - 1]!.title}
                </a>
              ) : (
                <span />
              )}
              {sections[index + 1] ? (
                <a href={`#${sections[index + 1]!.id}`}>
                  {sections[index + 1]!.title} →
                </a>
              ) : (
                <Link href="/learn">Explore another module →</Link>
              )}
            </nav>
          </section>
        ))}
      </div>
      <footer className="learning-reader-footer">
        <p>
          These checks are for reflection and practice. Your answers and
          reflection notes are not sent anywhere.
        </p>
        <Link href="/learn">Back to all explorations</Link>
      </footer>
    </article>
  );
}
