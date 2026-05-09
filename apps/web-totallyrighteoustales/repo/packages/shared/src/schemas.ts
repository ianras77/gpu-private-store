import { z } from "zod";

const AssistModeSchema = z.enum(["HANDMADE", "STUDIO"]);
const ImagePurposeSchema = z.enum(["STORY", "AVATAR"]);
const StorytellerDisplayNameSchema = z.object({
  displayName: z.string().min(2).max(40).optional().nullable(),
});

export const TaleCreateSchema = z.object({
  title: z.string().min(3).max(140),
  body: z.string().min(200).max(6000),
  imageId: z.string().uuid().optional().nullable(),
  assistMode: AssistModeSchema.optional(),
  isAnonymous: z.boolean().optional(),
  storyPrompt: z.string().min(10).max(500).optional().nullable(),
});

export const TaleUpdateSchema = z.object({
  title: z.string().min(3).max(140),
  body: z.string().min(200).max(6000),
  imageId: z.string().uuid().optional().nullable(),
  assistMode: AssistModeSchema.optional(),
  isAnonymous: z.boolean().optional(),
  storyPrompt: z.string().min(10).max(500).optional().nullable(),
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
  premise: z.string().min(3).max(160),
  mood: z.string().min(2).max(80).optional().nullable(),
  setting: z.string().min(2).max(80).optional().nullable(),
  wonder: z.string().min(2).max(80).optional().nullable(),
});
