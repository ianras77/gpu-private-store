import { z } from 'zod';

const requiredSecret = z.string().min(32, 'must be a 32-character runtime secret');

export const config = z.object({
  port: z.coerce.number().default(8090),
  apiUrl: z.string().url().default('http://bat-api:8000'),
  apiToken: requiredSecret,
  serviceToken: requiredSecret,
  persistReports: z.coerce.boolean().default(false),
  rassyMindBaseUrl: z.string().url().default('http://host.docker.internal:8844'),
  rassyMindApiKey: z.string().min(1),
  rassyMindModel: z.string().default('rassy-fast'),
  scheduleEnabled: z.coerce.boolean().default(false),
  scheduleIntervalSeconds: z.coerce.number().int().min(300).default(21600),
  scheduleDirective: z.string().min(1).max(4000).default('Trump executive overreach latest 2026'),
}).parse({
  port: process.env.MASTRA_PORT,
  apiUrl: process.env.BAT_API_URL,
  apiToken: process.env.BAT_INTERNAL_SERVICE_TOKEN,
  serviceToken: process.env.BAT_INTERNAL_SERVICE_TOKEN,
  persistReports: process.env.MASTRA_PERSIST_REPORTS,
  rassyMindBaseUrl: process.env.RASSYMIND_BASE_URL,
  rassyMindApiKey: process.env.RASSYMIND_API_KEY,
  rassyMindModel: process.env.RASSYMIND_EDITORIAL_MODEL ?? process.env.RASSYMIND_MODEL ?? 'rassy-fast',
  scheduleEnabled: process.env.MASTRA_SCHEDULE_ENABLED,
  scheduleIntervalSeconds: process.env.MASTRA_SCHEDULE_INTERVAL_SECONDS,
  scheduleDirective: process.env.MASTRA_SCHEDULE_DIRECTIVE,
});
