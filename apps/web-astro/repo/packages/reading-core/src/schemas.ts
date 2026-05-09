import { z } from "zod";

export const ReadingOutputSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  excerpt: z.string(),
  overview: z.array(z.string()).min(5).max(8),
  narrative: z.array(z.string()).min(2).max(10),
  characterSheet: z.object({
    title: z.string(),
    archetypes: z.array(z.string()).min(2).max(5),
    strengths: z.array(z.string()).min(2).max(5),
    shadows: z.array(z.string()).min(2).max(5),
    path: z.array(z.string()).min(2).max(5),
    motto: z.string()
  }),
  bigThree: z.object({
    sun: z.string(),
    moon: z.string(),
    rising: z.string().optional(),
    presentation: z.string().optional()
  }),
  planets: z
    .array(
      z.object({
        planet: z.string(),
        text: z.string()
      })
    )
    .min(5),
  houses: z
    .array(
      z.object({
        house: z.number().int().min(1).max(12),
        text: z.string()
      })
    )
    .optional(),
  aspects: z
    .array(
      z.object({
        aspect: z.string(),
        text: z.string()
      })
    )
    .min(3),
  brandLens: z
    .array(
      z.object({
        title: z.string(),
        text: z.string()
      })
    )
    .min(1),
  ritualCalendar: z
    .array(
      z.object({
        date: z.string(),
        title: z.string(),
        focus: z.string(),
        ritual: z.string(),
        transit: z.string().optional()
      })
    )
    .min(5)
    .max(14),
  actionables: z.array(z.string()).min(3).max(5),
  disclaimer: z.string()
});

export type ReadingOutput = z.infer<typeof ReadingOutputSchema>;

export const WeeklyContentOutputSchema = z.object({
  title: z.string(),
  excerpt: z.string(),
  weekOf: z.string(),
  opening: z.string(),
  atmosphere: z.array(z.string()).min(3).max(5),
  sections: z
    .array(
      z.object({
        title: z.string(),
        body: z.string()
      })
    )
    .min(3)
    .max(5),
  rituals: z.array(z.string()).min(3).max(5),
  moments: z
    .array(
      z.object({
        day: z.string(),
        title: z.string(),
        guidance: z.string()
      })
    )
    .min(3)
    .max(7),
  closing: z.string(),
  disclaimer: z.string()
});

export type WeeklyContentOutput = z.infer<typeof WeeklyContentOutputSchema>;

export const CompatibilityOutputSchema = z.object({
  overview: z.array(z.string()).min(4).max(7),
  narrative: z.array(z.string()).min(2).max(8),
  pairing: z.object({
    personA: z.object({
      sun: z.string(),
      moon: z.string(),
      rising: z.string().optional(),
      presentation: z.string().optional()
    }),
    personB: z.object({
      sun: z.string(),
      moon: z.string(),
      rising: z.string().optional(),
      presentation: z.string().optional()
    })
  }),
  harmony: z
    .array(
      z.object({
        title: z.string(),
        text: z.string()
      })
    )
    .min(2),
  friction: z
    .array(
      z.object({
        title: z.string(),
        text: z.string()
      })
    )
    .min(2),
  growth: z.array(z.string()).min(2).max(5),
  aspects: z
    .array(
      z.object({
        aspect: z.string(),
        text: z.string()
      })
    )
    .min(3),
  rituals: z.array(z.string()).min(3).max(6),
  disclaimer: z.string()
});

export type CompatibilityOutput = z.infer<typeof CompatibilityOutputSchema>;
