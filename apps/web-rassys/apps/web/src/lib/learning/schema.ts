import { z } from "zod";

export const moduleSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const moduleIdPattern = moduleSlugPattern;

const uniqueStrings = (values: string[]) =>
  new Set(values).size === values.length;

export const learningModuleMetadataSchema = z
  .object({
    schema: z.literal("rassy-module/v1"),
    slug: z.string().regex(moduleSlugPattern).max(80),
    version: z.number().int().min(1),
    status: z.enum(["draft", "published"]),
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(280),
    topic: z.string().trim().min(1).max(60),
    objectives: z
      .array(z.string().trim().min(1).max(240))
      .min(1)
      .max(6)
      .refine(uniqueStrings),
    tags: z
      .array(z.string().trim().min(1).max(40))
      .max(8)
      .refine(uniqueStrings)
      .optional(),
    minutes: z.number().int().min(1).max(180).optional(),
    level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
    author: z.string().trim().min(1).max(120).optional(),
    updated: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    cover: z
      .string()
      .regex(
        /^assets\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:png|jpe?g|webp|avif|gif)$/,
      )
      .max(240)
      .optional(),
    cover_alt: z.string().trim().min(1).max(400).optional(),
    related: z
      .array(z.string().regex(moduleSlugPattern).max(80))
      .max(8)
      .refine(uniqueStrings)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.cover) !== Boolean(value.cover_alt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [value.cover ? "cover_alt" : "cover"],
        message: "cover and cover_alt must be supplied together",
      });
    }
    if (value.updated) {
      const [year, month, day] = value.updated.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["updated"],
          message: "updated must be a real calendar date",
        });
      }
    }
  });

const optionSchema = z
  .object({
    id: z.string().regex(moduleIdPattern).max(80),
    text: z.string().trim().min(1).max(400),
    feedback: z.string().trim().min(1).max(1000),
  })
  .strict();

export const learningCheckSchema = z
  .object({
    id: z.string().regex(moduleIdPattern).max(80),
    question: z.string().trim().min(1).max(500),
    options: z.array(optionSchema).min(2).max(5),
    answer: z.string().regex(moduleIdPattern).max(80),
  })
  .strict()
  .superRefine((value, context) => {
    const optionIds = value.options.map((option) => option.id);
    if (!uniqueStrings(optionIds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "option IDs must be unique",
      });
    }
    if (optionIds.filter((id) => id === value.answer).length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answer"],
        message: "answer must match exactly one option ID",
      });
    }
  });

export type LearningModuleMetadata = z.infer<
  typeof learningModuleMetadataSchema
>;
export type LearningCheck = z.infer<typeof learningCheckSchema>;
export type LearningSection = { id: string; title: string; markdown: string };
export type LearningModule = {
  metadata: LearningModuleMetadata;
  intro: string;
  sections: LearningSection[];
  estimatedMinutes: boolean;
  checks: Record<string, LearningCheck>;
};
