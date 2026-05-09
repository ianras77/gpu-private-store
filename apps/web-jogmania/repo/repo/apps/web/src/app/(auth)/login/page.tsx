"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const api = useApi();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const formatError = (err: unknown) => {
    if (err instanceof Error) {
      const message = err.message.toLowerCase();
      if (message.includes("email not verified")) {
        return "Email not verified. Check your inbox for the verification link.";
      }
      if (message.includes("valid email")) {
        return "Enter a valid email address.";
      }
      return err.message;
    }
    return "Login failed. Check your credentials.";
  };

  const verifyToken = params.get("verify_token");

  useEffect(() => {
    if (!verifyToken) return;
    api
      .verifyEmail(verifyToken)
      .then(() => {
        setNotice("Email verified. Redirecting to dashboard...");
        setTimeout(() => router.push("/overview"), 800);
      })
      .catch(() => setError("Verification failed. Request a new link."));
  }, [verifyToken, api, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await login(email, password);
      if (res.requires_verification) {
        setNotice(res.message ?? "Check your email to verify your account.");
        return;
      }
      router.push("/overview");
    } catch (err) {
      setError(formatError(err));
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16 jm-hero">
      <Card className="p-8 w-full max-w-md">
        <p className="jm-kicker">Return</p>
        <h1 className="font-display text-2xl mt-2">Welcome back</h1>
        <p className="text-sm text-jm-muted mt-2">Resume your run adventures.</p>
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
          <Button type="submit">
            Sign in
          </Button>
        </form>
        <p className="text-xs text-jm-muted mt-6">
          Need an account? <Link href="/register" className="text-jm-acid">Create one</Link>
        </p>
      </Card>
    </main>
  );
}
