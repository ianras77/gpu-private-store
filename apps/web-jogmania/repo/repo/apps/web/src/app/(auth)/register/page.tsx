"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const formatError = (err: unknown) => {
    if (err instanceof Error) {
      const message = err.message.toLowerCase();
      if (message.includes("already registered")) {
        return "Email already exists. Try signing in.";
      }
      if (message.includes("valid email")) {
        return "Enter a valid email address.";
      }
      if (message.includes("password must be at least")) {
        return "Password must be at least 8 characters.";
      }
      return err.message;
    }
    return "Registration failed. Try again.";
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await register(email, password);
      if (res.requires_verification) {
        setNotice(res.message ?? "Check your email to verify your account.");
        return;
      }
      if (res.message) {
        setNotice(res.message);
      }
      router.push("/overview");
    } catch (err) {
      setError(formatError(err));
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16 jm-hero">
      <Card className="p-8 w-full max-w-md">
        <p className="jm-kicker">New Cartridge</p>
        <h1 className="font-display text-2xl mt-2">Create your account</h1>
        <p className="text-sm text-jm-muted mt-2">Start building your Adventure Courses.</p>
        {error && <p className="mt-4 text-sm text-jm-magenta">{error}</p>}
        {notice && <p className="mt-4 text-sm text-jm-acid">{notice}</p>}
        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="jm-input w-full"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="jm-input w-full"
          />
          <Button type="submit" variant="primary">
            Create account
          </Button>
        </form>
        <p className="text-xs text-jm-muted mt-6">
          Already have an account? <Link href="/login" className="text-jm-cyan">Sign in</Link>
        </p>
      </Card>
    </main>
  );
}
