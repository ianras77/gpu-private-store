# Rassy AI application blueprint

Future Rassy apps should use `src/mastra/{agents,tools,workflows,skills,memory,config}`.
Define agents with semantic RassyMind lanes, tools with Zod schemas and authorization in
executors, and workflows from registered safe primitives. Pass `resourceId=user.id` and
`threadId=conversation.id` to memory. Keep secrets server-side and test every boundary with
two users. Runtipi topology remains Next.js, Postgres, Qdrant, and RassyMind unless measured
requirements justify a change.
