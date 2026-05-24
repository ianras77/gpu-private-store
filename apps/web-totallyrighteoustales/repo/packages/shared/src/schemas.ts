import { z } from "zod";

const AssistModeSchema = z.enum(["HANDMADE", "STUDIO"]);
const ImagePurposeSchema = z.enum(["STORY", "AVATAR"]);
const StorytellerDisplayNameSchema = z.object({
  displayName: z.string().min(2).max(40).optional().nullable(),
});

const PersonaSchema = z.object({
  personaName: z.string().min(2).max(60).optional().nullable(),
  personaVoice: z.string().min(4).max(180).optional().nullable(),
  personaSignature: z.string().min(4).max(180).optional().nullable(),
});

export const TaleCreateSchema = PersonaSchema.extend({
  title: z.string().min(3).max(140),
  body: z.string().min(600).max(18000),
  imageId: z.string().uuid().optional().nullable(),
  assistMode: AssistModeSchema.optional(),
  isAnonymous: z.boolean().optional(),
  storyPrompt: z.string().min(10).max(1200).optional().nullable(),
});

export const TaleUpdateSchema = PersonaSchema.extend({
  title: z.string().min(3).max(140),
  body: z.string().min(600).max(18000),
  imageId: z.string().uuid().optional().nullable(),
  assistMode: AssistModeSchema.optional(),
  isAnonymous: z.boolean().optional(),
  storyPrompt: z.string().min(10).max(1200).optional().nullable(),
});

export const ModerationDecisionSchema = z.object({
  reason: z.string().min(3).max(500).optional(),
});

export const ImageCreateSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(3),
  purpose: ImagePurposeSchema.optional(),
});

export const StorytellerProfileUpdateSchema =
  StorytellerDisplayNameSchema.extend({
    bio: z.string().min(8).max(220).optional().nullable(),
    avatarImageId: z.string().uuid().optional().nullable(),
  });

export const StorySparkSchema = z.object({
  premise: z.string().min(3).max(180),
  mood: z.string().min(2).max(80).optional().nullable(),
  setting: z.string().min(2).max(120).optional().nullable(),
  wonder: z.string().min(2).max(120).optional().nullable(),
  character: z.string().min(2).max(120).optional().nullable(),
  stakes: z.string().min(2).max(140).optional().nullable(),
  turn: z.string().min(2).max(140).optional().nullable(),
  voice: z.string().min(2).max(120).optional().nullable(),
});

export const CraftNotesSchema = z.object({
  title: z.string().min(0).max(140).optional().default(""),
  body: z.string().min(0).max(18000).optional().default(""),
  premise: z.string().min(0).max(180).optional().nullable(),
  character: z.string().min(0).max(120).optional().nullable(),
  stakes: z.string().min(0).max(140).optional().nullable(),
  turn: z.string().min(0).max(140).optional().nullable(),
  voice: z.string().min(0).max(120).optional().nullable(),
});
