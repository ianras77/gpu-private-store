import Link from "next/link";
import { PageShell, Section, Heading, Text, Card } from "@astro/ui";
import { brand, brandCopy } from "../lib/brand";

const CHART_KEYS = ["Sun", "Moon", "Rising", "Houses", "Aspects", "Retrogrades"];
const REPORT_SECTIONS = [
  "Big Three foundation",
  "Planet placements",
  "Aspect story",
  "Element and modality balance"
];
const STEPS = [
  {
    title: "Cast the birth chart",
    text: "Give us the date, time, and place. We draw the wheel first so the symbolism feels visible, not abstract."
  },
  {
    title: "Receive the first report",
    text: "The opening reading is long-form, chart-specific, and written in the voice of the brand you chose."
  },
  {
    title: "Keep the grimoire alive",
    text: "Register once to save the chart, keep the natal report, and collect fresh weekly entries in your private journal."
  }
];

const GRIMOIRE_BENEFITS = [
  "Save the chart that feels like you.",
  "Keep the first report and every follow-up in one place.",
  "Receive a new weekly note written in the brand voice you chose."
];

export default function Page() {
  return (
    <PageShell>
      <Section>
        <div className="astro-hero">
          <div className="astro-hero-copy">
            <Text className="astro-kicker">{brandCopy.hero.kicker}</Text>
            <Heading>{brand.name}</Heading>
            <Text muted>{brandCopy.hero.subtitle}</Text>
            <Text className="astro-meta">{brandCopy.hero.mantra}</Text>
            <div className="astro-hero-actions">
              <Link href="/intake" className="astro-button astro-button-primary astro-button-block">
                Draw My Birth Chart
              </Link>
              <Link href="/account" className="astro-button astro-button-ghost astro-button-block">
                Create Private Grimoire
              </Link>
            </div>
            <div className="astro-pill-row">
              {CHART_KEYS.map((item) => (
                <span key={item} className="astro-pill">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="astro-hero-visual">
            <div className="astro-hero-orbit">
              <span className="astro-hero-node node-one" />
              <span className="astro-hero-node node-two" />
              <span className="astro-hero-node node-three" />
              <span className="astro-hero-node node-four" />
              <div className="astro-hero-center">Birth Chart</div>
            </div>
            <div className="astro-preview-card">
              <Text className="astro-kicker">How it lands</Text>
              <Heading level={3}>{brandCopy.signature.title}</Heading>
              <Text muted>
                A visual chart, a chart-specific report, and a private stream of follow-up writing that keeps
                the reading alive week after week.
              </Text>
              <div className="astro-stack-tight">
                {brandCopy.deliverables.slice(0, 3).map((item) => (
                  <Text key={item} muted>
                    {item}
                  </Text>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Why This Brand Feels Different">
        <Text muted>
          {brandCopy.reading.intro}
        </Text>
        <div className="astro-grid">
          {brandCopy.signature.items.map((item) => (
            <Card key={item.title}>
              <Heading level={3}>{item.title}</Heading>
              <Text muted>{item.description}</Text>
            </Card>
          ))}
          {brand.focusModules.map((item) => (
            <Card key={item.id}>
              <Heading level={3}>{item.title}</Heading>
              <Text muted>{item.description}</Text>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="What The First Report Includes">
        <Text muted>
          The opening reading is not a generic horoscope. It is written from the exact chart you just drew,
          then it becomes the foundation for the weekly writing that follows.
        </Text>
        <div className="astro-grid-tight">
          {brandCopy.deliverables.map((item, index) => (
            <Card key={item}>
              <Text className="astro-kicker">Report {index + 1}</Text>
              <Heading level={3}>{REPORT_SECTIONS[index] ?? "Chart module"}</Heading>
              <Text muted>{item}</Text>
            </Card>
          ))}
        </div>
        <div className="astro-note-strip">
          <strong>{brandCopy.hero.mantra}</strong>
          <Text muted>
            The voice stays consistent from the first reading into the private grimoire, so the weekly notes feel
            like a continuation of your chart rather than disconnected content.
          </Text>
        </div>
      </Section>

      <Section title="What The Experience Gives You">
        <div className="astro-stepper">
          {STEPS.map((step, index) => (
            <div key={step.title} className="astro-step">
              <span className="astro-step-number">Step {index + 1}</span>
              <Heading level={3}>{step.title}</Heading>
              <Text muted>{step.text}</Text>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Private Grimoire">
        <div className="astro-split-panel">
          <div className="astro-form-shell">
            <Heading level={2}>Register once. Keep the chart, the report, and the weekly note.</Heading>
            <Text muted>{brandCopy.account.intro}</Text>
            <ul className="astro-list">
              {GRIMOIRE_BENEFITS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="astro-hero-actions">
              <Link href="/account" className="astro-button astro-button-primary astro-button-block">
                Create Account
              </Link>
              <Link href="/reading" className="astro-button astro-button-ghost astro-button-block">
                See A Reading Demo
              </Link>
            </div>
          </div>

          <div className="astro-note-strip">
            <strong>{brandCopy.signature.title}</strong>
            <Text muted>{brandCopy.account.note}</Text>
            <Text muted>
              The first reading is your foundation. After that, the weekly grimoire keeps speaking to the same chart
              instead of starting over every time.
            </Text>
            <div className="astro-stack-tight">
              {brandCopy.reading.notes.map((item) => (
                <Text key={item} muted>
                  {item}
                </Text>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </PageShell>
  );
}
