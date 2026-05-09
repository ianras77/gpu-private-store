import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/buttonStyles";

export default function PricingPage() {
  return (
    <main className="min-h-screen px-6 md:px-12 py-16 jm-hero">
      <Link href="/" className="text-xs uppercase tracking-[0.3em] text-jm-muted">
        Back to home
      </Link>
      <h1 className="font-display text-4xl mt-4">Pricing</h1>
      <p className="text-jm-muted mt-2">Early access is free while we build the future of fitness adventures.</p>
      <Card className="mt-8 p-8 max-w-xl jm-cartridge">
        <Badge tone="cyan">Founders Edition</Badge>
        <h2 className="font-display text-2xl mt-4">Founders Edition</h2>
        <p className="text-sm text-jm-muted mt-2">Unlimited runs, courses, and retro adventures.</p>
        <div className="mt-6 flex items-center gap-4">
          <span className="text-3xl font-display text-jm-acid">$0</span>
          <span className="text-xs text-jm-muted">for now</span>
        </div>
        <Link href="/register" className={buttonStyles("secondary", "md")}>
          Join free
        </Link>
      </Card>
    </main>
  );
}
