# The Curiosity Room

`/learn` reads a folder of Markdown modules at request time. It does not need
Postgres, Redis, an LLM, or the radio controller. A valid published folder is
picked up by the next catalog refresh (at most 30 seconds) without rebuilding
or restarting the website. Direct module, status, and image requests reread the
module so changing it to `draft` or removing it takes effect immediately.

The page is part of the normal Next.js app layout. Client navigation leaves
the global radio player mounted. `/notebook` uses the same safe CommonMark/GFM
renderer as learning modules, with its existing relative media links and
notebook styling. Learning teaching blocks are enabled only for validated
learning content.

## Storage

Set `HOST_LEARNING_PATH` to an **absolute host path** containing module
subfolders. The web container receives it read-only at
`LEARNING_STORAGE_PATH` (default `/media/learning`). The Compose default uses
`$ROOT_FOLDER_HOST/media/data/web-rassys/learning` when that host variable is
not set; choose and record the actual path used by your server in its managed
app environment. The application never creates files in the mount.

For example, if your operator-selected folder is `/srv/rassys/learning`,
configure:

```dotenv
HOST_LEARNING_PATH=/srv/rassys/learning
LEARNING_STORAGE_PATH=/media/learning
```

Back up the module folders and assets with your existing host backup workflow.
Container recreation does not remove their contents because the mount is
outside the image. If the mount is absent or unreadable, `/learn` shows an
unavailable message and the module API returns 503; it does not pretend the
library is empty. An empty but readable directory is a valid empty catalog.

In development, the reader defaults to `apps/web/examples/learning`. Production
requires `LEARNING_STORAGE_PATH`; it will not publish the checked-in examples
as an implicit fallback.

## Author, validate, publish

Start from `apps/web/examples/learning/module-template/module.md` and keep its
status as `draft` while editing. The checked-in `reading-family-story` module
is an original demonstration, not a claim about a real family story.

Validate the development examples or the chosen host folder with the same
parser used by the website:

```sh
pnpm --filter web validate:learning examples/learning
pnpm --filter web validate:learning /absolute/path/to/rassy-learning
```

The validator exits nonzero and prints a relative module path for invalid
front matter, unsupported Markdown or blocks, missing assets, duplicate IDs,
bad checks, and broken module references. Drafts are validated too, but omitted
from all public catalog, detail, and asset responses.

To publish, first change `status: draft` to `status: published`, increment
`version` when revising a published module, run validation, and review the
rendered result. Copy a new module to a uniquely named staging folder on the
same filesystem as the live learning folder, then rename that completed folder
into place. For an existing module, add newly named assets first and atomically
replace `module.md` last; retain old referenced assets until readers have
refreshed. Do not copy a partially written module into the public folder.

Example promotion (replace paths and slug with the ones you chose):

```sh
pnpm --filter web validate:learning /srv/rassys/learning-staging
mv /srv/rassys/learning-staging/reading-family-story /srv/rassys/learning/reading-family-story
```

The rename is the publication step. There is no upload endpoint or ZIP
extractor. Draft creation by an assistant does not publish content.

## Format and privacy

The complete v1 format is in [FORMAT_V1.txt](FORMAT_V1.txt); JSON Schema
fixtures are in [schemas](schemas), and the authoring prompt is
[MODULE_AUTHORING_PROMPT.txt](MODULE_AUTHORING_PROMPT.txt). Runtime Zod checks
mirror those schemas and additionally validate Markdown structure, cross-file
IDs, references, module links, and actual image bytes.

Reflections remain in page memory for the current visit. Knowledge-check
answers are informal self-study and are visible to the browser. Completion is
only recorded after a button press, in browser storage keyed by module slug,
version, and section ID. No reflection text or answer is sent to analytics,
the notebook, or RassyMind.

## Verification

```sh
pnpm --filter web smoke:learning-parser
pnpm --filter web lint
pnpm --filter web exec tsc --noEmit
pnpm --filter web build
pnpm --filter web smoke:learning-runtime
```

The runtime smoke expects a production build first. It starts one Next process
with a temporary read-only module root, confirms drafts and unsafe assets are
private, adds/edits/unpublishes/removes content while the process stays up, and
checks that discovery follows the 30-second server cache. See the command
output and release notes for which gates were actually run.
