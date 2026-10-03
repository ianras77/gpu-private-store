"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LearningModuleMetadata } from "../../lib/learning/schema";

type CatalogItem = {
  metadata: LearningModuleMetadata;
  estimatedMinutes: boolean;
};
type Props = {
  modules: CatalogItem[];
  currentSlug?: string;
  unavailable?: boolean;
  children?: ReactNode;
};

const loadCatalog = async (url: string): Promise<CatalogItem[]> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("learning_catalog_unavailable");
  const payload = (await response.json()) as { modules?: CatalogItem[] };
  return Array.isArray(payload.modules) ? payload.modules : [];
};

export function LearningExperience({
  modules: initialModules,
  currentSlug,
  unavailable = false,
  children,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, error } = useSWR<CatalogItem[]>(
    "/api/learn/modules",
    loadCatalog,
    {
      fallbackData: initialModules,
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    },
  );
  const modules = data ?? initialModules;
  const showUnavailable = unavailable && Boolean(error);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("all");
  const topics = useMemo(
    () =>
      [...new Set(modules.map(({ metadata }) => metadata.topic))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [modules],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return modules.filter(({ metadata }) => {
      const matchesTopic = topic === "all" || metadata.topic === topic;
      const searchable = [
        metadata.title,
        metadata.summary,
        metadata.topic,
        ...(metadata.tags ?? []),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return matchesTopic && (!needle || searchable.includes(needle));
    });
  }, [modules, query, topic]);

  useEffect(() => {
    if (currentSlug)
      document.getElementById("learning-title")?.focus({ preventScroll: true });
  }, [currentSlug, pathname]);

  return (
    <main className="learning-page">
      <aside className="learning-rail" aria-label="Learning library">
        <div className="learning-rail-heading">
          <Link href="/learn" className="learning-brand">
            The Curiosity Room
          </Link>
          <p>Small explorations, with room to grow.</p>
        </div>
        <label className="learning-field-label" htmlFor="learning-search">
          Find a module
        </label>
        <input
          id="learning-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Title, topic, or idea"
          className="learning-search"
        />
        <label className="learning-field-label" htmlFor="learning-topic">
          Explore a topic
        </label>
        <select
          id="learning-topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          className="learning-topic-select"
        >
          <option value="all">All topics</option>
          {topics.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        {currentSlug ? (
          <div className="learning-mobile-picker">
            <label htmlFor="learning-module-picker">
              Choose another module
            </label>
            <select
              id="learning-module-picker"
              value={currentSlug}
              onChange={(event) =>
                router.push(`/learn/${encodeURIComponent(event.target.value)}`)
              }
            >
              {modules.map(({ metadata }) => (
                <option key={metadata.slug} value={metadata.slug}>
                  {metadata.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <nav className="learning-module-list" aria-label="Published modules">
          <p className="learning-list-label">Published modules</p>
          {filtered.map(({ metadata, estimatedMinutes }) => (
            <Link
              key={metadata.slug}
              href={`/learn/${metadata.slug}`}
              aria-current={currentSlug === metadata.slug ? "page" : undefined}
              className={`learning-module-link ${currentSlug === metadata.slug ? "is-current" : ""}`}
            >
              <span className="learning-module-link-topic">
                {metadata.topic}
              </span>
              <span className="learning-module-link-title">
                {metadata.title}
              </span>
              <span className="learning-module-link-time">
                {metadata.minutes} min{estimatedMinutes ? " · estimate" : ""}
              </span>
            </Link>
          ))}
          {!filtered.length ? (
            <p className="learning-empty-filter">
              No modules match those filters.
            </p>
          ) : null}
        </nav>
        <p className="learning-rail-footnote">
          Your progress stays on this device.
        </p>
      </aside>
      <div className="learning-workspace">
        {showUnavailable ? (
          <section className="learning-unavailable" role="status">
            <p className="learning-kicker">The shelves are out of reach</p>
            <h1>The learning folder is unavailable.</h1>
            <p>
              The reader is ready, but its content folder could not be read.
              Check the mounted learning folder and try again.
            </p>
            <Link href="/" className="learning-back-link">
              Back to Rassys
            </Link>
          </section>
        ) : (
          (children ?? (
            <section className="learning-catalog">
              <p className="learning-kicker">A small room for big questions</p>
              <h1 id="learning-title" tabIndex={-1}>
                What are you curious about?
              </h1>
              <p className="learning-catalog-intro">
                Choose a short exploration, take what is useful, and follow the
                questions that stay with you.
              </p>
              {filtered.length ? (
                <div className="learning-card-grid">
                  {filtered.map(({ metadata, estimatedMinutes }) => (
                    <Link
                      key={metadata.slug}
                      href={`/learn/${metadata.slug}`}
                      className="learning-card"
                    >
                      <div className="learning-card-topline">
                        <span>{metadata.topic}</span>
                        <span>
                          {metadata.minutes} min
                          {estimatedMinutes ? " · estimate" : ""}
                        </span>
                      </div>
                      <h2>{metadata.title}</h2>
                      <p>{metadata.summary}</p>
                      {metadata.objectives?.length ? (
                        <span className="learning-card-link">
                          Open this exploration{" "}
                          <span aria-hidden="true">↗</span>
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="learning-empty">
                  No published modules are available yet. New published folders
                  appear here as the catalog refreshes.
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </main>
  );
}
