import { ReadingOutputSchema, type ReadingOutput } from "@astro/reading-core";
import type { AstrologyReportArtifact } from "./index";

const sectionText = (artifact: AstrologyReportArtifact, key: string, fallback: string) => artifact.sections.find((section) => section.key === key)?.body.join(" ") || fallback;

/** Preserves the old ReadingOutput contract while new reports remain canonical artifacts. */
export function toLegacyReadingOutput(artifact: AstrologyReportArtifact): ReadingOutput {
  const sections = artifact.sections;
  const planetSections = sections.filter((section) => /planet|big-three|identity|mind|love|desire/i.test(`${section.key} ${section.title}`));
  const aspectSections = sections.filter((section) => /aspect|wiring|architecture/i.test(`${section.key} ${section.title}`));
  const houses = sections.find((section) => section.key === "house-atlas");
  const body = (planetSections.length ? planetSections : sections).map((section) => ({ planet: section.title, text: section.body.join(" ") }));
  while (body.length < 5) body.push({ planet: `Chapter ${body.length + 1}`, text: sectionText(artifact, "central-thesis", "A grounded chapter from the report artifact.") });
  const aspects = (aspectSections.length ? aspectSections : sections).map((section) => ({ aspect: section.title, text: section.body.join(" ") }));
  while (aspects.length < 3) aspects.push({ aspect: `Pattern ${aspects.length + 1}`, text: sectionText(artifact, "chart-architecture", "A deterministic chart pattern interpreted reflectively.") });
  return ReadingOutputSchema.parse({
    title: artifact.cover.title,
    subtitle: artifact.cover.subtitle,
    excerpt: artifact.cover.excerpt,
    overview: [artifact.cover.excerpt, ...sections.slice(0, 4).map((section) => section.body[0] ?? section.title)].slice(0, 8),
    narrative: sections.slice(0, 10).map((section) => section.body.join(" ")).filter(Boolean).slice(0, 10),
    characterSheet: { title: artifact.cover.archetype ?? "Chart portrait", archetypes: ["Patterned", "Reflective"], strengths: ["Specificity", "Self-observation"], shadows: ["Over-certainty", "Overextension"], path: artifact.practicalIntegration.questions.length >= 2 ? artifact.practicalIntegration.questions.slice(0, 3) : ["Return to the facts", "Choose a proportionate next step"], motto: "Use the chart as a language, not a verdict." },
    bigThree: { sun: sectionText(artifact, "central-thesis", "Sun placement interpreted in context"), moon: sectionText(artifact, "chart-architecture", "Moon placement interpreted with uncertainty where needed"), rising: artifact.chart.timeConfidence === "unknown" ? undefined : sectionText(artifact, "technical-frame", "Rising sign calculated from the chart") },
    planets: body.slice(0, 12),
    houses: houses ? [{ house: 1, text: houses.body.join(" ") }] : undefined,
    aspects: aspects.slice(0, 12),
    brandLens: [{ title: `${artifact.brandId} lens`, text: sectionText(artifact, "applied-handbook", "Brand expression preserves the deterministic chart facts.") }],
    ritualCalendar: Array.from({ length: 5 }, (_, index) => ({ date: artifact.provenance.generatedAt.slice(0, 10), title: `Report reflection ${index + 1}`, focus: artifact.cover.title, ritual: artifact.practicalIntegration.practices[index % Math.max(1, artifact.practicalIntegration.practices.length)] ?? "Return to the relevant report chapter." })),
    actionables: [...artifact.practicalIntegration.reflections, ...artifact.practicalIntegration.practices, ...artifact.practicalIntegration.questions].slice(0, 5),
    disclaimer: artifact.disclaimer
  });
}
