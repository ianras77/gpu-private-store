export type TaleStatus = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_EDITS";
export type TaleAssistMode = "HANDMADE" | "STUDIO";
export type ImagePurpose = "STORY" | "AVATAR";

export type UserRole = "USER" | "MOD" | "ADMIN";

export interface TaleSummary {
  id: string;
  title: string;
  excerpt: string;
  authorPseudonym: string;
  authorAvatarUrl?: string | null;
  createdAt: string;
  status: TaleStatus;
  assistMode: TaleAssistMode;
  storyPrompt?: string | null;
  isAnonymous: boolean;
  personaName?: string | null;
  personaVoice?: string | null;
  personaSignature?: string | null;
  hotScore: number;
  topScore: number;
  imageUrl?: string | null;
  upvotes: number;
  downvotes: number;
}

export interface TaleDetail extends TaleSummary {
  body: string;
  rejectionReason?: string | null;
}

export interface CraftNotesResponse {
  notes: string[];
  focus: "structure" | "voice" | "stakes" | "line-edit";
}

export interface StorytellerProfile {
  id: string;
  email: string;
  pseudonym: string;
  displayName?: string | null;
  bio?: string | null;
  avatarImageId?: string | null;
  avatarUrl?: string | null;
  creditsTotal: number;
  role: UserRole;
  profileComplete: boolean;
}

export interface LeaderboardEntry {
  userId: string;
  pseudonym?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  creditsTotal: number;
  storyCount: number;
  totalHearts: number;
}

export interface LeaderboardData {
  storytellers: LeaderboardEntry[];
  stories: TaleSummary[];
}
