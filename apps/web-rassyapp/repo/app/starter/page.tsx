import Link from "next/link";
import { StarterChat } from "@/components/chat/starter-chat";
import { BrandMark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";

export default function StarterPage() {
  return (
    <div className="min-h-screen bg-ink-950 text-ink-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <nav className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/">
            <BrandMark />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button variant="outline">Sign in</Button>
            </Link>
          </div>
        </nav>
        <div className="mt-10">
          <StarterChat />
        </div>
      </div>
    </div>
  );
}
