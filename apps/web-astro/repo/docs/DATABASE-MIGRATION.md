# Database migration

Report runs, sections, artifacts, conversations, and feedback are additive Prisma models. The checked-in migration creates only new tables, indexes, and foreign keys. It does not alter or delete existing account, chart, reading, content, or job data. Production startup must use `prisma migrate deploy`; `db push --accept-data-loss` is prohibited.
