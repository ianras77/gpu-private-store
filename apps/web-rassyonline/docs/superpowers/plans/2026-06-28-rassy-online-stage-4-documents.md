# Stage 4 Plan - User Document Memory

## Goal

Add the first full user-scoped vector memory loop: registered users can upload text documents, enable or disable them, and have chat retrieve only their active knowledge through RassyCodex embeddings and app-local Qdrant.

## Scope

- Signed-in users only for durable uploads.
- Text, Markdown, JSON, CSV, and log-like text files in this stage.
- Store uploaded originals outside the web root.
- Store document metadata in Postgres.
- Store vectors in a per-user Qdrant collection.
- Retrieve chunks for signed-in chat when active documents are selected.
- Keep anonymous chat unchanged and non-persistent.

## Implementation Loop

1. Add tests for document chunking, Qdrant collection naming/request payloads, and retrieval context formatting.
2. Add document schema bootstrap and store helpers.
3. Add RassyCodex embedding support.
4. Add Qdrant REST helpers for ensure-collection, upsert, search, and delete-by-document.
5. Add `/api/documents` list/upload and `/api/documents/[id]` update/delete routes.
6. Update `/api/chat` to retrieve active document chunks and prepend a bounded system context.
7. Add a document tray to the chat workbench with upload and active toggles.
8. Verify with unit tests, TypeScript, production build, compose, a live upload, Qdrant-backed retrieval, screenshots, and Runtipi validators.

## Acceptance

- Anonymous `/api/documents` is rejected.
- A signed-in upload creates a Postgres document row and Qdrant vectors.
- Document toggles persist per user.
- Chat with active documents receives retrieved context and still streams from RassyCodex.
- Qdrant payload filters always include the signed-in user id.
- Runtipi compose and appstore validators still pass.
