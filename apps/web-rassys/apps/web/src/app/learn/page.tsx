import type { Metadata } from "next";
import { LearningExperience } from "../../components/learning/LearningExperience";
import {
  LearningStorageError,
  listPublishedLearningModules,
} from "../../lib/learning/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: "The Curiosity Room // Rassys",
  description:
    "Choose a short exploration, take what is useful, and follow the questions that stay with you.",
};

export default async function LearningCatalogPage() {
  try {
    const modules = await listPublishedLearningModules();
    return <LearningExperience modules={modules} />;
  } catch (error) {
    if (error instanceof LearningStorageError)
      return <LearningExperience modules={[]} unavailable />;
    throw error;
  }
}
