import { z } from "zod";

export const BrandIdSchema = z.enum(["jupiterseek", "saturnseer", "saturnleo", "maleficme", "oracleveil"]);

const emailSchema = z.string().trim().email().transform((value) => value.toLowerCase());

export const GeoResolveInput = z.object({
  query: z.string().min(2),
  limit: z.number().int().min(1).max(10).optional(),
  locale: z.string().trim().min(2).max(16).optional()
});

export const GeoReverseInput = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  locale: z.string().trim().min(2).max(16).optional()
});

export const GeocodeCandidateSchema = z.object({
  label: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  countryCode: z.string().min(2).max(3).optional(),
  region: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  provider: z.string().min(1),
  timezone: z.string().min(1)
});

export const ReverseGeocodeResultSchema = z.object({
  label: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  timezone: z.string().min(1),
  provider: z.string().min(1),
  countryCode: z.string().min(2).max(3).optional(),
  region: z.string().min(1).optional(),
  city: z.string().min(1).optional()
});

export const GeoResolveResponseSchema = z.object({
  brandId: BrandIdSchema,
  query: z.string(),
  candidates: z.array(GeocodeCandidateSchema),
  results: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      lat: z.number(),
      lon: z.number(),
      timezone: z.string(),
      countryCode: z.string().optional()
    })
  ),
  meta: z.object({
    providerChain: z.array(z.string()),
    providerUsed: z.string(),
    cached: z.boolean(),
    requestId: z.string(),
    elapsedMs: z.number(),
    code: z.string().optional()
  })
});

export const GeoReverseResponseSchema = z.object({
  result: ReverseGeocodeResultSchema,
  meta: z.object({
    providerChain: z.array(z.string()),
    providerUsed: z.string(),
    cached: z.boolean(),
    requestId: z.string(),
    elapsedMs: z.number(),
    code: z.string().optional()
  })
});

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

export const ChartRequestInput = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthTime: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{2}:\d{2}$/).optional()
  ),
  timeUnknown: z.boolean().optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  timezone: z.string().optional(),
  houseSystem: z.enum(["placidus", "whole-sign"]).optional(),
  includePoints: z
    .object({ northNode: z.boolean().optional(), chiron: z.boolean().optional() })
    .optional()
});

export const LifeHandbookPlanRequestInput = z.object({
  chartJson: z.unknown(),
  context: z.array(z.object({ id: z.string().min(1), text: z.string().min(1).max(10_000), source: z.enum(["user-provided", "uploaded-document", "application-record"]), sensitivity: z.enum(["ordinary", "sensitive", "highly-sensitive"]).optional(), approvedForSynthesis: z.boolean().default(false) })).default([]),
  frameworks: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), status: z.enum(["astronomical", "symbolic-reflective", "user-supplied"]), version: z.string(), claims: z.array(z.string()).default([]) })).default([])
});

export const ReportRunCreateInput = z.object({
  chartJson: z.unknown().optional(), chartAJson: z.unknown().optional(), chartBJson: z.unknown().optional(), timingGraph: z.unknown().optional(), weekLabel: z.string().optional(), chartProfileId: z.string().optional(), brandId: BrandIdSchema,
  kind: z.enum(["natal", "compatibility", "weekly", "focused"]), depth: z.enum(["quick", "standard", "deep", "handbook"]),
  idempotencyKey: z.string().min(8).max(200), workflowVersion: z.string().min(1).max(80).default("life-handbook-v1"),
  context: LifeHandbookPlanRequestInput.shape.context.default([]), frameworks: LifeHandbookPlanRequestInput.shape.frameworks.default([])
}).superRefine((value, ctx) => {
  if (value.kind === "compatibility" && (value.chartAJson === undefined || value.chartBJson === undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Compatibility runs require chartAJson and chartBJson." });
  if (value.kind !== "compatibility" && value.chartJson === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "This report kind requires chartJson." });
  if (value.kind === "weekly" && (value.timingGraph === undefined || !value.weekLabel)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Weekly runs require timingGraph and weekLabel." });
});

export const ReadingRequestInput = z.object({
  chartJson: z.unknown(),
  brandId: BrandIdSchema,
  length: z.enum(["short", "standard", "deep"]),
  chartProfileId: z.string().uuid().optional(),
  saveToFeed: z.boolean().optional(),
  preferences: z
    .object({
      focus: z.string().optional()
    })
    .optional()
});

export const HumanGuideRequestInput = z
  .object({
    chartJson: z.unknown(),
    brandId: BrandIdSchema
  })
  .strict();

export const CompatibilityRequestInput = z.object({
  chartAJson: z.unknown(),
  chartBJson: z.unknown(),
  brandId: BrandIdSchema,
  length: z.enum(["short", "standard", "deep"]),
  preferences: z
    .object({
      focus: z.string().optional()
    })
    .optional()
});

export const ChartProfileCreateInput = z.object({
  label: z.string().max(80).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthTime: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{2}:\d{2}$/).optional()
  ),
  timeUnknown: z.boolean().optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  timezone: z.string().optional(),
  houseSystem: z.enum(["placidus", "whole-sign"]).optional(),
  locationLabel: z.string().max(120).optional(),
  chartJson: z.unknown().optional(),
  isPrimary: z.boolean().optional()
});

export const RegisterInput = z.object({
  email: emailSchema,
  password: z.string().min(10).max(128),
  displayName: z.string().trim().min(2).max(80).optional()
});

export const LoginInput = z.object({
  email: emailSchema,
  password: z.string().min(10).max(128)
});

export const InitialReportInput = z.object({
  chartProfileId: z.string().uuid(),
  brandId: BrandIdSchema,
  length: z.enum(["short", "standard", "deep"]).default("deep"),
  force: z.boolean().optional()
});

export const WeeklyContentInput = z.object({
  chartProfileId: z.string().uuid(),
  brandId: BrandIdSchema,
  force: z.boolean().optional()
});

export const ContentFeedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional()
});
