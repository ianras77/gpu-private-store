import { z } from "zod";

export const rassyChannelSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  aliases: z.array(z.string()),
  visibility: z.enum(["public", "authenticated", "family", "admin"]),
  allowedAgentIds: z.array(z.string()),
  allowedToolIds: z.array(z.string()),
  memoryPolicy: z.string(),
  artifactKinds: z.array(z.string()),
  rateLimitPolicy: z.string(),
});

export type RassyChannel = z.infer<typeof rassyChannelSchema>;

export const rassyRequestContextSchema = z.object({
  requestId: z.string().min(1),
  channelId: z.string().min(1),
  viewer: z.object({ kind: z.enum(["anonymous", "user", "family", "admin"]), id: z.string().min(1), roles: z.array(z.string()) }),
  sessionId: z.string().optional(), campaignId: z.string().optional(), characterId: z.string().optional(),
  noteId: z.string().optional(), storyId: z.string().optional(), trackId: z.string().optional(), minecraftWorldId: z.string().optional(),
  permissions: z.array(z.string()), locale: z.string(), timeZone: z.string(),
  modelPolicy: z.object({ allowedAliases: z.array(z.string()), maxCalls: z.number().int().positive(), deadlineMs: z.number().int().positive(), priority: z.enum(["listener", "interactive", "background"]) }),
});
export type RassyRequestContext = z.infer<typeof rassyRequestContextSchema>;

export const toolMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  channel: z.string(),
  risk: z.enum(["read", "propose", "write", "privileged"]),
  requiresAuth: z.boolean(),
  requiresApproval: z.boolean(),
  allowedAgents: z.array(z.string()),
  timeoutMs: z.number().int().positive(),
});

export type ToolMetadata = z.infer<typeof toolMetadataSchema>;

export const artifactSourceRefSchema = z.object({ type: z.string(), id: z.string() });
export const rassyArtifactSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  kind: z.string(),
  status: z.enum(["draft", "review", "published", "private", "archived"]),
  ownerResourceId: z.string().optional(),
  title: z.string(),
  summary: z.string().optional(),
  bodyMarkdown: z.string().optional(),
  bodyJson: z.unknown().optional(),
  sourceRefs: z.array(artifactSourceRefSchema),
  runId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().optional(),
});

export type RassyArtifact = z.infer<typeof rassyArtifactSchema>;
export const RASSY_ARTIFACT_KINDS = [
  "booth-note", "trackbook", "setbook", "dm-session-recap", "campaign-chronicle",
  "minecraft-chronicle", "story-draft", "story-transcript", "family-memory",
  "notebook-draft", "home-opening",
] as const;

export const RASSY_TOOLS: readonly ToolMetadata[] = [
  { id: "get-channel-registry", title: "Get channel registry", channel: "home", risk: "read", requiresAuth: false, requiresApproval: false, allowedAgents: ["mr-rassy-host", "site-curator"], timeoutMs: 1000 },
  { id: "get-now-playing", title: "Get now playing", channel: "mr-rassy", risk: "read", requiresAuth: false, requiresApproval: false, allowedAgents: ["radio-listener", "radio-dj"], timeoutMs: 3000 },
  { id: "search-music-library", title: "Search music library", channel: "mr-rassy", risk: "read", requiresAuth: false, requiresApproval: false, allowedAgents: ["radio-listener", "music-librarian"], timeoutMs: 5000 },
  { id: "submit-listener-request", title: "Submit listener request", channel: "mr-rassy", risk: "write", requiresAuth: false, requiresApproval: false, allowedAgents: ["radio-listener"], timeoutMs: 5000 },
  { id: "load-campaign-snapshot", title: "Load campaign snapshot", channel: "dungeon-master", risk: "read", requiresAuth: true, requiresApproval: false, allowedAgents: ["dungeon-master", "world-keeper"], timeoutMs: 5000 },
  { id: "search-compendium", title: "Search compendium", channel: "dungeon-master", risk: "read", requiresAuth: true, requiresApproval: false, allowedAgents: ["rules-scholar", "dungeon-master"], timeoutMs: 5000 },
  { id: "validate-dm-patch", title: "Validate DM patch", channel: "dungeon-master", risk: "propose", requiresAuth: true, requiresApproval: false, allowedAgents: ["dungeon-master"], timeoutMs: 3000 },
  { id: "get-minecraft-world-status", title: "Get Minecraft world status", channel: "minecraft", risk: "read", requiresAuth: false, requiresApproval: false, allowedAgents: ["minecraft-chronicler", "troupe-planner"], timeoutMs: 3000 },
  { id: "get-minecraft-events", title: "Get Minecraft events", channel: "minecraft", risk: "read", requiresAuth: false, requiresApproval: false, allowedAgents: ["minecraft-chronicler"], timeoutMs: 5000 },
  { id: "list-story-assets", title: "List story assets", channel: "stories", risk: "read", requiresAuth: false, requiresApproval: false, allowedAgents: ["story-archivist", "storyteller"], timeoutMs: 5000 },
  { id: "get-story-metadata", title: "Get story metadata", channel: "stories", risk: "read", requiresAuth: false, requiresApproval: false, allowedAgents: ["story-archivist"], timeoutMs: 3000 },
  { id: "list-family-albums", title: "List family albums", channel: "family", risk: "read", requiresAuth: true, requiresApproval: false, allowedAgents: ["family-archivist"], timeoutMs: 5000 },
  { id: "list-selected-media", title: "List selected media", channel: "family", risk: "read", requiresAuth: true, requiresApproval: false, allowedAgents: ["family-archivist"], timeoutMs: 5000 },
  { id: "search-notebook", title: "Search notebook", channel: "notebook", risk: "read", requiresAuth: true, requiresApproval: false, allowedAgents: ["notebook-editor"], timeoutMs: 5000 },
  { id: "create-notebook-draft", title: "Create notebook draft", channel: "notebook", risk: "write", requiresAuth: true, requiresApproval: false, allowedAgents: ["notebook-editor"], timeoutMs: 5000 },
  { id: "get-recent-artifacts", title: "Get recent public artifacts", channel: "home", risk: "read", requiresAuth: false, requiresApproval: false, allowedAgents: ["site-curator"], timeoutMs: 3000 },
  { id: "get-rassymind-capabilities", title: "Get RassyMind capabilities", channel: "admin", risk: "read", requiresAuth: true, requiresApproval: false, allowedAgents: ["operations"], timeoutMs: 3000 },
];

export const RASSY_CHANNELS: readonly RassyChannel[] = [
  { id: "mr-rassy", title: "Mr Rassy", description: "The shared host and radio room.", aliases: ["radio", "listening-room"], visibility: "public", allowedAgentIds: ["radio-listener", "mr-rassy-host"], allowedToolIds: ["get-channel-registry", "get-now-playing", "search-music-library", "submit-listener-request"], memoryPolicy: "thread-and-explicit-resource-preferences", artifactKinds: ["booth-note", "trackbook", "setbook"], rateLimitPolicy: "public-interactive" },
  { id: "dungeon-master", title: "Dungeon Master", description: "The persistent campaign room.", aliases: ["dm"], visibility: "authenticated", allowedAgentIds: ["dungeon-master", "rules-scholar", "world-keeper"], allowedToolIds: ["load-campaign-snapshot", "search-compendium", "validate-dm-patch"], memoryPolicy: "campaign-scoped", artifactKinds: ["dm-session-recap", "campaign-chronicle"], rateLimitPolicy: "authenticated-interactive" },
  { id: "minecraft", title: "Minecraft", description: "Observed world and troupe activity.", aliases: ["mc"], visibility: "public", allowedAgentIds: ["minecraft-chronicler", "troupe-planner"], allowedToolIds: ["get-minecraft-world-status", "get-minecraft-events"], memoryPolicy: "world-scoped", artifactKinds: ["minecraft-chronicle"], rateLimitPolicy: "public-interactive" },
  { id: "stories", title: "Stories", description: "Recorded and authored stories.", aliases: ["real-life-bedtime-stories"], visibility: "public", allowedAgentIds: ["storyteller", "story-archivist"], allowedToolIds: ["list-story-assets", "get-story-metadata"], memoryPolicy: "thread-scoped", artifactKinds: ["story-draft", "story-transcript"], rateLimitPolicy: "public-interactive" },
  { id: "family", title: "Family", description: "Private family archive.", aliases: ["photos"], visibility: "family", allowedAgentIds: ["family-archivist"], allowedToolIds: ["list-family-albums", "list-selected-media"], memoryPolicy: "private-thread", artifactKinds: ["family-memory"], rateLimitPolicy: "family-interactive" },
  { id: "notebook", title: "Notebook", description: "Ian's writing room.", aliases: ["thoughts"], visibility: "authenticated", allowedAgentIds: ["notebook-editor"], allowedToolIds: ["search-notebook", "create-notebook-draft"], memoryPolicy: "private-thread", artifactKinds: ["notebook-draft"], rateLimitPolicy: "authenticated-interactive" },
  { id: "home", title: "Home", description: "The personal constellation.", aliases: [], visibility: "public", allowedAgentIds: ["site-curator"], allowedToolIds: ["get-recent-artifacts"], memoryPolicy: "none", artifactKinds: ["home-opening"], rateLimitPolicy: "public-read" },
  { id: "admin", title: "Admin", description: "Protected operations view.", aliases: [], visibility: "admin", allowedAgentIds: ["operations"], allowedToolIds: ["get-rassymind-capabilities"], memoryPolicy: "admin-thread", artifactKinds: [], rateLimitPolicy: "admin" },
];

export function resolveRassyChannel(value: string): RassyChannel | undefined {
  const normalized = value.trim().toLowerCase();
  return RASSY_CHANNELS.find((channel) => channel.id === normalized || channel.aliases.includes(normalized));
}
