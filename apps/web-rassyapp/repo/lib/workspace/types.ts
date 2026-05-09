import type { StudioProjectSummary } from "@/lib/studio/types";

export type WorkspaceFileEntry = {
  path: string;
  type: "file" | "folder";
  depth: number;
  status?: "clean" | "modified" | "added" | "deleted" | "renamed";
};

export type WorkspaceSummary = {
  workspace: {
    id: string;
    slug: string;
    name: string;
    repoRoot?: string | null;
    branch?: string | null;
    collaboratorCount: number;
  };
  member: {
    role: string;
  };
  sessions: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string;
    owner?: { id: string; username: string | null } | null;
  }>;
  activeSessionId: string;
  openFiles: string[];
  activeFile: string | null;
  runs: Array<{
    id: string;
    label: string;
    status: string;
  }>;
  studioProject?: StudioProjectSummary;
};

export type WorkspacePresenceSummary = {
  id: string;
  userId: string;
  name: string;
  role: string;
  status: string;
  lastSeenAt: string;
};

export type WorkspaceFileResponse = {
  path: string;
  content: string;
  truncated: boolean;
};

export type WorkspaceDiffResponse = {
  path: string;
  diff: string;
};
