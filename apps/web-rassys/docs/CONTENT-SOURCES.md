# Notes, Learn, and Reports sources

The public readers share the `RassyMarkdown` renderer while each reads from a
separate persistent source directory:

| Reader | Host source | Container path | Access |
| --- | --- | --- | --- |
| Notes (`/thoughts`, `/notebook`) | `media/data/web-rassys/notes` | `/media/notes` | Read/write for the site editor |
| Learn (`/learn`) | `media/data/web-rassys/learning` | `/media/learning` | Read-only |
| Reports (`/reports`) | `media/data/web-rassys/reports` | `/media/reports` | Read-only in the site; OpenFang writes selected reports |

Set `HOST_NOTES_PATH`, `HOST_LEARNING_PATH`, and `HOST_REPORTS_PATH` only when
the folders live somewhere other than the defaults. The corresponding
container paths can be changed with `NOTES_STORAGE_PATH`,
`LEARNING_STORAGE_PATH`, and `RASSY_REPORTS_STORAGE_PATH`.

OpenFang's analyst and system integration report jobs keep their original
archive under `OPENFANG_REPORTS_HOST_PATH`. Each job also writes its report to
`reports/analyst/YYYY/MM/` or `reports/system/YYYY/MM/` under the Rassys Reports
source. The site indexes reports privately for administrators. Analyst reports
remain private until an administrator approves the exact file hash; system
reports remain administrator-only.
