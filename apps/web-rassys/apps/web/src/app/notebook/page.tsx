import type { Metadata } from "next";
import ThoughtsPage, { metadata as thoughtsMetadata } from "../thoughts/page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = thoughtsMetadata;

export default function NotebookPage() {
  return <ThoughtsPage />;
}
