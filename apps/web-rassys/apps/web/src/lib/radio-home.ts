"use client";

import useSWR from "swr";
import type { RadioNote } from "./radio-notes";

export type RadioHomeRequestLineItem = {
  id: string;
  summary: string;
  listenerMessage?: string | null;
  response?: string | null;
  trackId?: string | null;
  trackIds?: string[];
  source?: "chat" | "form" | "featured" | null;
  status?: "accepted" | "rejected" | "considering" | "none" | "queued" | "fulfilled" | null;
  intent?: string | null;
  createdAt: number;
  tracks?: Array<{
    id: string;
    title: string;
    artist: string;
    album?: string;
    year?: number;
  }>;
};

export type RadioHomeStatus = {
  playCount?: number | null;
  plays?: number | null;
  mood?: string | null;
  queueDepth?: number;
  nowPlaying?: {
    id?: string;
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
    genres?: string[];
    energy?: number;
    albumArtUrl?: string;
    startedAt?: string;
  } | null;
  feedbackTop?: Array<{
    trackId: string;
    score: number;
    title: string;
    artist: string;
  }>;
  requestLine?: string[];
  requestLineItems?: RadioHomeRequestLineItem[];
  requestLineDepth?: number;
  llmDirector?: {
    active?: boolean;
    driving?: boolean;
    name?: string;
    model?: string;
  };
  djMode?: string | null;
};

export type RadioHomeDj = {
  script?: string | null;
  mood?: string | null;
  source?: string | null;
  reason?: string | null;
  trackIds?: string[];
  at?: number | null;
};

export type RadioHomePayload = {
  available: boolean;
  status: RadioHomeStatus | null;
  dj: RadioHomeDj | null;
  latestNote: RadioNote | null;
  notes: RadioNote[];
  fetchedAt: string;
};

const fetcher = async (url: string): Promise<RadioHomePayload> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`radio_home_failed_${response.status}`);
  }
  return response.json() as Promise<RadioHomePayload>;
};

export const useRadioHome = () =>
  useSWR<RadioHomePayload>("/api/radio/home", fetcher, {
    refreshInterval: 12000,
    dedupingInterval: 5000,
    revalidateOnFocus: false
  });
