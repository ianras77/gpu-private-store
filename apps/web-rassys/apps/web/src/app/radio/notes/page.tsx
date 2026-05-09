import Link from "next/link";
import { Search } from "lucide-react";
import { Footer } from "../../../components/Footer";
import { Button } from "../../../components/ui/button";
import {
  buildRadioNotesCatalog,
  formatRadioMood,
  formatRadioNoteDate,
  formatRadioNoteTime,
  formatRadioNoteType,
  listRadioNotes,
  type IndexedRadioNote,
  type RadioNoteBoothSection
} from "../../../lib/radio-notes";

export const dynamic = "force-dynamic";

type SearchParamsInput = {
  artist?: string | string[];
  genre?: string | string[];
  noteType?: string | string[];
  q?: string | string[];
  tag?: string | string[];
  special?: string | string[];
};

const firstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const trackMeta = (
  track?: {
    album?: string;
    year?: number;
    genres?: string[];
    duration?: number;
  } | null
) =>
  [
    track?.album,
    track?.year,
    track?.genres?.slice(0, 2).join(" / "),
    typeof track?.duration === "number" ? `${Math.round(track.duration / 60)} min` : null
  ]
    .filter(Boolean)
    .join(" · ");

const formatSpecialLabel = (value?: string | null) => {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  return cleaned.replace(/[_-]+/g, " ");
};

const buildHref = (
  current: {
    artist?: string;
    genre?: string;
    noteType?: string;
    q?: string;
    tag?: string;
    special?: string;
  },
  patch: Partial<{
    artist?: string;
    genre?: string;
    noteType?: string;
    q?: string;
    tag?: string;
    special?: string;
  }>
) => {
  const params = new URLSearchParams();
  const next = { ...current, ...patch };

  for (const [key, value] of Object.entries(next)) {
    if (value?.trim()) {
      params.set(key, value.trim());
    }
  }

  const query = params.toString();
  return query ? `/radio/notes?${query}` : "/radio/notes";
};

const filterNotes = (
  notes: IndexedRadioNote[],
  filters: {
    artist?: string;
    genre?: string;
    noteType?: string;
    q?: string;
    tag?: string;
    special?: string;
  }
) => {
  const q = filters.q?.trim().toLowerCase();
  const artist = filters.artist?.trim().toLowerCase();
  const genre = filters.genre?.trim().toLowerCase();
  const tag = filters.tag?.trim().toLowerCase();
  const noteType = filters.noteType?.trim().toLowerCase();
  const special = filters.special?.trim().toLowerCase();

  return notes.filter((note) => {
    if (artist && !note.artists.some((value) => value.toLowerCase() === artist)) return false;
    if (genre && !note.genres.some((value) => value.toLowerCase() === genre)) return false;
    if (tag && !note.tags.some((value) => value.toLowerCase() === tag)) return false;
    if (special && (note.specialType ?? "").toLowerCase() !== special) return false;
    if (noteType && formatRadioNoteType(note.eventType).toLowerCase() !== noteType) return false;
    if (q && !note.searchText.includes(q)) return false;
    return true;
  });
};

const FilterChip = ({
  label,
  href,
  active
}: {
  label: string;
  href: string;
  active?: boolean;
}) => (
  <Link
    href={href}
    className={`rave-chip inline-flex rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em] transition ${
      active ? "border-glow/40 text-white" : "text-cloud/70 hover:text-white"
    }`}
  >
    {label}
  </Link>
);

const SectionCard = ({
  label,
  section
}: {
  label: string;
  section: RadioNoteBoothSection;
}) => (
  <div className="rounded-[24px] border border-white/10 bg-black/18 p-4 md:grid md:grid-cols-[170px_minmax(0,1fr)] md:gap-5">
    <div>
      <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/48">{label}</div>
      <div className="mt-3 text-lg font-semibold text-white">{section.title}</div>
    </div>
    <p className="mt-3 text-sm leading-7 text-cloud/80 md:mt-0">{section.body}</p>
  </div>
);

const NoteCard = ({ note }: { note: IndexedRadioNote }) => {
  const leadTrack = note.leadTrack ?? null;
  const sections = note.boothDossier?.sections ?? {};
  const lineup = sections.lineup ?? {
    title: note.boothDossier?.headline ?? note.title,
    body: note.reason ?? note.excerpt
  };
  const contextSection = sections.context ?? {
    title: leadTrack?.album ? `${leadTrack.album}${leadTrack.year ? ` · ${leadTrack.year}` : ""}` : "Inside the record",
    body: note.boothDossier?.deepCut ?? note.excerpt
  };
  const listenFor = sections.listenFor ?? {
    title: "What to catch",
    body: note.boothDossier?.nextMove ?? note.reason ?? "The next turn stayed in the air a little longer."
  };
  const sessionTracks = note.boothDossier?.sessionTracks ?? [];
  const playback = note.boothDossier?.programming?.playback ?? [];

  return (
    <article
      id={note.id}
      className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.12),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(66,245,255,0.12),transparent_30%),linear-gradient(152deg,rgba(8,12,28,0.96),rgba(33,9,47,0.9))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.3)] md:p-6"
    >
      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/58">
        <span className="rave-chip rounded-full px-3 py-2">{formatRadioMood(note.mood)}</span>
        <span className="rave-chip rounded-full px-3 py-2">{formatRadioNoteType(note.eventType)}</span>
        <span className="rave-chip rounded-full px-3 py-2">{formatRadioNoteDate(note.createdAt)}</span>
        <span className="rave-chip rounded-full px-3 py-2">{formatRadioNoteTime(note.createdAt)}</span>
        {note.programmingLabel && (
          <span className="rave-chip rounded-full px-3 py-2">{note.programmingLabel}</span>
        )}
        {note.specialType && (
          <span className="rave-chip rounded-full px-3 py-2">{formatSpecialLabel(note.specialType)}</span>
        )}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <h2 className="text-2xl font-semibold text-white md:text-3xl">
            {note.boothDossier?.headline ?? note.title}
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-8 text-cloud/84">
            {note.boothDossier?.intro ?? note.excerpt}
          </p>

          <div className="mt-5 rounded-[24px] border border-white/10 bg-black/18 p-4">
            <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/50">Record in focus</div>
            <div className="mt-3 text-lg font-semibold text-white">
              {leadTrack?.title ?? "Open room"}
            </div>
            <div className="mt-1 text-sm text-cloud/72">{leadTrack?.artist ?? "Mr Rassy"}</div>
            <div className="mt-2 text-xs leading-6 text-cloud/58">
              {trackMeta(leadTrack) || note.energyLabel || "Live booth turn"}
            </div>
          </div>

          {note.boothDossier?.programming && (
            <div className="mt-4 rounded-[24px] border border-white/10 bg-[linear-gradient(160deg,rgba(9,21,33,0.92),rgba(24,11,44,0.82))] p-4">
              <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/50">Programming</div>
              <div className="mt-3 text-lg font-semibold text-white">
                {note.boothDossier.programming.label}
              </div>
              <p className="mt-2 text-sm leading-7 text-cloud/80">
                {note.boothDossier.programming.description}
              </p>
              {playback.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em] text-cloud/64">
                  {playback.slice(0, 4).map((item, index) => (
                    <span key={`${note.id}-playback-${index}`} className="rave-chip rounded-full px-3 py-2">
                      {item.title ?? item.trackId ?? `Track ${index + 1}`} · {item.mode}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-4">
          <SectionCard label="Lineup note" section={lineup} />
          <SectionCard label="Track context" section={contextSection} />
          <SectionCard label="Listen for" section={listenFor} />
        </div>
      </div>

      {(note.artists.length > 0 || note.genres.length > 0 || note.tags.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em] text-cloud/64">
          {note.artists.slice(0, 3).map((artist) => (
            <span key={`${note.id}-${artist}`} className="rave-chip rounded-full px-3 py-2">
              {artist}
            </span>
          ))}
          {note.genres.slice(0, 3).map((genre) => (
            <span key={`${note.id}-${genre}`} className="rave-chip rounded-full px-3 py-2">
              {genre}
            </span>
          ))}
          {note.tags
            .filter((tag) => tag !== note.eventType)
            .slice(0, 4)
            .map((tag) => (
              <span key={`${note.id}-${tag}`} className="rave-chip rounded-full px-3 py-2">
                {tag}
              </span>
            ))}
        </div>
      )}

      {sessionTracks.length > 0 ? (
        <div className="mt-5 rounded-[24px] border border-white/10 bg-[linear-gradient(160deg,rgba(10,15,31,0.95),rgba(20,8,42,0.84))] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">Session map</div>
            <div className="text-xs text-cloud/55">{sessionTracks.length} stored song note{sessionTracks.length === 1 ? "" : "s"}</div>
          </div>
          <div className="mt-4 grid gap-3">
            {sessionTracks.map((track) => (
              <div
                key={`${note.id}-${track.trackId ?? `${track.artist}-${track.title}`}-${track.slot}`}
                className="rounded-[20px] border border-white/10 bg-black/18 p-4 lg:grid lg:grid-cols-[82px_minmax(0,220px)_minmax(0,1fr)] lg:gap-4"
              >
                <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.22em] text-cloud/46 lg:block">
                  <span>{String(track.slot).padStart(2, "0")}</span>
                  <span className="lg:mt-2 lg:block">{track.role ?? "set"}</span>
                </div>
                <div className="mt-3 lg:mt-0">
                  <div className="text-base font-semibold text-white">{track.title}</div>
                  <div className="mt-1 text-sm text-cloud/70">{track.artist}</div>
                  {track.playbackMode && (
                    <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-cloud/48">
                      {track.playbackMode === "clip" ? "Excerpted play" : "Full play"}
                    </div>
                  )}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3 lg:mt-0">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cloud/48">Why it fits</div>
                    <p className="mt-2 text-sm leading-7 text-cloud/80">{track.whyItFits}</p>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cloud/48">Track context</div>
                    <p className="mt-2 text-sm leading-7 text-cloud/80">{track.context}</p>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cloud/48">Listen for</div>
                    <p className="mt-2 text-sm leading-7 text-cloud/80">{track.listenFor}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : note.setlist.length > 0 ? (
        <div className="mt-5 rounded-[24px] border border-white/10 bg-[linear-gradient(160deg,rgba(10,15,31,0.95),rgba(20,8,42,0.84))] p-4">
          <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">Set path</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {note.setlist.slice(0, 6).map((track, index) => (
              <div
                key={`${note.id}-${track.id ?? `${track.title}-${index}`}`}
                className="rounded-[18px] border border-white/10 bg-black/18 p-4"
              >
                <div className="text-[10px] uppercase tracking-[0.22em] text-cloud/45">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="mt-2 text-sm font-semibold text-white">{track.title}</div>
                <div className="mt-1 text-xs text-cloud/70">{track.artist}</div>
                <div className="mt-2 text-xs leading-6 text-cloud/58">{trackMeta(track)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <details className="mt-5 rounded-[24px] border border-white/10 bg-black/18 p-4">
        <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.24em] text-cloud/64">
          Open saved booth copy
        </summary>
        <div className="mt-4 space-y-3 text-sm leading-7 text-cloud/84">
          {note.script.split(/\n{2,}/).map((paragraph, index) => (
            <p key={`${note.id}-paragraph-${index}`}>{paragraph}</p>
          ))}
        </div>
      </details>
    </article>
  );
};

export default async function RadioNotesPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsInput>;
}) {
  const params = (await searchParams) ?? {};
  const filters = {
    q: firstValue(params.q)?.trim(),
    artist: firstValue(params.artist)?.trim(),
    genre: firstValue(params.genre)?.trim(),
    tag: firstValue(params.tag)?.trim(),
    noteType: firstValue(params.noteType)?.trim(),
    special: firstValue(params.special)?.trim()
  };

  const notes = await listRadioNotes(120);
  const catalog = buildRadioNotesCatalog(notes);
  const filteredNotes = filterNotes(catalog.notes, filters);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="relative overflow-hidden rounded-[38px] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.16),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(66,245,255,0.18),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(255,79,216,0.2),transparent_40%),linear-gradient(145deg,rgba(7,11,28,0.96),rgba(32,8,49,0.9))] px-6 py-9 shadow-[0_28px_90px_rgba(0,0,0,0.38)] md:px-10">
          <div className="absolute inset-0 noise opacity-50" aria-hidden="true" />
          <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.12fr)_320px] xl:items-end">
            <div>
              <div className="text-[11px] uppercase tracking-[0.42em] text-cloud/58">Booth notebook</div>
              <h1 className="section-title mt-4 text-4xl md:text-5xl">Session notes from the booth.</h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-cloud/82">
                The lineup logic, the song notes, and the things I want you to hear, saved one session at a time.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/radio">Back to the station</Link>
                </Button>
                <Button variant="secondary" asChild>
                  <Link href="/radio/notes">Clear the filters</Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">Stored notes</div>
                <div className="mt-2 text-3xl font-semibold text-white">{catalog.notes.length}</div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">Artists</div>
                <div className="mt-2 text-3xl font-semibold text-white">{catalog.facets.artists.length}</div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">Genres</div>
                <div className="mt-2 text-3xl font-semibold text-white">{catalog.facets.genres.length}</div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">Special turns</div>
                <div className="mt-2 text-3xl font-semibold text-white">{catalog.facets.specialTypes.length}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="self-start xl:sticky xl:top-28">
            <div className="space-y-4 rounded-[30px] border border-white/10 bg-[linear-gradient(150deg,rgba(10,14,30,0.94),rgba(21,8,38,0.84))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
              <form action="/radio/notes" className="space-y-3">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cloud/50"
                  />
                  <input
                    type="text"
                    name="q"
                    defaultValue={filters.q}
                    placeholder="Search the notebook"
                    className="rave-input h-12 w-full rounded-[18px] pl-11 pr-4 text-sm"
                  />
                  {filters.artist && <input type="hidden" name="artist" value={filters.artist} />}
                  {filters.genre && <input type="hidden" name="genre" value={filters.genre} />}
                  {filters.tag && <input type="hidden" name="tag" value={filters.tag} />}
                  {filters.noteType && <input type="hidden" name="noteType" value={filters.noteType} />}
                  {filters.special && <input type="hidden" name="special" value={filters.special} />}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit">Search</Button>
                  <Button variant="secondary" asChild>
                    <Link href="/radio/notes">Reset</Link>
                  </Button>
                </div>
              </form>

              {hasFilters && (
                <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/64">
                  {filters.artist && <span className="rave-chip rounded-full px-3 py-2">Artist: {filters.artist}</span>}
                  {filters.genre && <span className="rave-chip rounded-full px-3 py-2">Genre: {filters.genre}</span>}
                  {filters.tag && <span className="rave-chip rounded-full px-3 py-2">Tag: {filters.tag}</span>}
                  {filters.noteType && (
                    <span className="rave-chip rounded-full px-3 py-2">Type: {filters.noteType}</span>
                  )}
                  {filters.special && (
                    <span className="rave-chip rounded-full px-3 py-2">Special: {filters.special}</span>
                  )}
                  {filters.q && <span className="rave-chip rounded-full px-3 py-2">Search: {filters.q}</span>}
                </div>
              )}

              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">Artists</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {catalog.facets.artists.slice(0, 10).map((facet) => (
                    <FilterChip
                      key={facet.value}
                      label={`${facet.value} · ${facet.count}`}
                      href={buildHref(filters, {
                        artist: filters.artist === facet.value ? undefined : facet.value
                      })}
                      active={filters.artist === facet.value}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">Genres</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {catalog.facets.genres.slice(0, 10).map((facet) => (
                    <FilterChip
                      key={facet.value}
                      label={`${facet.value} · ${facet.count}`}
                      href={buildHref(filters, {
                        genre: filters.genre === facet.value ? undefined : facet.value
                      })}
                      active={filters.genre === facet.value}
                    />
                  ))}
                </div>
              </div>

              {catalog.facets.specialTypes.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">Specials</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {catalog.facets.specialTypes.slice(0, 8).map((facet) => (
                      <FilterChip
                        key={facet.value}
                        label={`${formatSpecialLabel(facet.value)} · ${facet.count}`}
                        href={buildHref(filters, {
                          special: filters.special === facet.value ? undefined : facet.value
                        })}
                        active={filters.special === facet.value}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">Note shape</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {catalog.facets.noteTypes.map((facet) => (
                    <FilterChip
                      key={facet.value}
                      label={`${facet.value} · ${facet.count}`}
                      href={buildHref(filters, {
                        noteType: filters.noteType === facet.value ? undefined : facet.value
                      })}
                      active={filters.noteType === facet.value}
                    />
                  ))}
                  {catalog.facets.tags.slice(0, 8).map((facet) => (
                    <FilterChip
                      key={facet.value}
                      label={facet.value}
                      href={buildHref(filters, {
                        tag: filters.tag === facet.value ? undefined : facet.value
                      })}
                      active={filters.tag === facet.value}
                    />
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] uppercase tracking-[0.32em] text-cloud/58">
                {filteredNotes.length} saved turn{filteredNotes.length === 1 ? "" : "s"}
              </div>
              <div className="text-sm text-cloud/68">Lineup logic first. Song notes right behind it.</div>
            </div>

            {filteredNotes.length > 0 ? (
              filteredNotes.map((note) => <NoteCard key={note.id} note={note} />)
            ) : (
              <div className="rounded-[30px] border border-white/10 bg-black/20 p-6 text-sm text-cloud/72">
                Nothing in the notebook matches that filter yet.
              </div>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
