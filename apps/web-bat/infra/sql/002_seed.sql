insert into voice_memory (memory_type, key, value, weight)
values
  ('system_setting', 'direct_publish', 'true', 1.0),
  ('system_setting', 'x_research_enabled', 'true', 1.0),
  ('system_setting', 'x_live_posting', 'false', 1.0),
  (
    'research_directive',
    'primary',
    $$Trump executive overreach latest
Trump legal collision latest
White House contradiction latest
federal judge blocks Trump administration action
cabinet official contradicts White House
Republican backlash Trump latest
Trump donor conflict latest
Trump immigration crackdown backlash
Trump tariff shock latest
White House Iran strike fallout$$,
    1.25
  ),
  (
    'analysis_directive',
    'primary',
    $$Lead with the contradiction between message and consequence.
Name the institutional stress point: court, agency, donor, cabinet, Congress, military, or market.
Prefer documents, filings, transcripts, official votes, sanctions, and direct quotes.
Surface who benefits, who absorbs the risk, and what makes this materially different from yesterday's outrage cycle.
Pull one clean why-now line, one sharper pattern line, and one social hook with screenshot legs.$$,
    1.3
  ),
  (
    'voice_blueprint',
    'primary',
    $$BAT personal-site voice. Make it feel like a real woman runs the room: polished, warm, expensive, and cutting. Current first, linked receipts, no filler, no generic throat-clearing, no cable-news sludge. Every piece should feel specific enough for a front page, sharp enough for a screenshot, and grounded enough to survive contact with the sources.$$,
    1.35
  ),
  (
    'live_vibe',
    'primary',
    $$Screenshot-ready dispatch voice: sharp, socially fluent, polished, anti-filler, and willing to sting once the receipts have earned it.$$,
    1.25
  ),
  ('motif', 'pearls', 'Use sparingly for contradiction framing.', 1.2),
  ('motif', 'boots', 'Use for bluster-vs-results contrast.', 1.1),
  ('style', 'cadence', 'Wry, southern-inflected, precise, never cartoonish.', 1.4)
on conflict (memory_type, key) do update set
  value = excluded.value,
  weight = excluded.weight,
  updated_at = now();

insert into themes (slug, name, description, active_score, first_seen_at, last_seen_at)
values
  ('legal-collision', 'Legal Collision', 'Courts and legal institutions colliding with executive moves.', 2.5, now(), now()),
  ('conservative-discomfort', 'Conservative Discomfort', 'Signals of unease from conservative voices and actors.', 2.0, now(), now())
on conflict (slug) do nothing;

insert into editorial_objects (object_type, status, title, slug, dek, body_md, summary, voice_profile, metadata)
values
  (
    'lead_story',
    'published',
    'A Fresh Coat of Bronzer on the Same Old Contradiction',
    'fresh-coat-of-bronzer-same-old-contradiction',
    'The Cat clocks a familiar gap between official claims and visible fallout.',
    'This is a seeded sample draft for local startup.\n\nSatire/commentary disclosure: This page contains AI-assisted satirical editorial analysis grounded in linked source reporting.',
    'Seeded lead story for local draft startup.',
    'cheshire-cat',
    '{"disclosure":"satire/commentary","seed":true}'::jsonb
  )
on conflict (slug) do nothing;

insert into homepage_snapshots (status, layout_json, rationale)
values
  (
    'published',
    '{
      "tagline": "Satire, commentary, and pattern-tracking from the Blonde Desk.",
      "edition": "Seeded startup edition",
      "satire_disclosure": "This site is satire/commentary.",
      "lead": {"title": "A Fresh Coat of Bronzer on the Same Old Contradiction", "slug": "fresh-coat-of-bronzer-same-old-contradiction"},
      "left_column": [{"title": "Quick Take: Boots, Spin, Repeat", "slug": "fresh-coat-of-bronzer-same-old-contradiction"}],
      "center_column": [{"title": "Pattern Watch: The Claim-Reality Gap", "slug": "fresh-coat-of-bronzer-same-old-contradiction"}],
      "right_column": [{"title": "What The Cat Is Watching: Legal Collision", "slug": "fresh-coat-of-bronzer-same-old-contradiction"}]
    }'::jsonb,
    'Seeded homepage snapshot so the public UI is populated on first run.'
  );
