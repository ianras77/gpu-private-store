import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LearningExperience } from "../../../components/learning/LearningExperience";
import { LearningReader } from "../../../components/learning/LearningReader";
import {
  LearningStorageError,
  getPublishedLearningModule,
  listPublishedLearningModules,
} from "../../../lib/learning/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const lesson = await getPublishedLearningModule(slug);
    if (!lesson)
      return { title: "Exploration not found // The Curiosity Room" };
    return {
      title: `${lesson.metadata.title} // The Curiosity Room`,
      description: lesson.metadata.summary,
    };
  } catch {
    return { title: "The Curiosity Room // Rassys" };
  }
}

export default async function LearningModulePage({ params }: PageProps) {
  const { slug } = await params;
  try {
    const [module, modules] = await Promise.all([
      getPublishedLearningModule(slug),
      listPublishedLearningModules(),
    ]);
    if (!module) notFound();
    return (
      <LearningExperience modules={modules} currentSlug={module.metadata.slug}>
        <LearningReader module={module} />
      </LearningExperience>
    );
  } catch (error) {
    if (error instanceof LearningStorageError)
      return <LearningExperience modules={[]} currentSlug={slug} unavailable />;
    throw error;
  }
}
