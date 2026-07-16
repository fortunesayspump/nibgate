"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await apiFetch<{ success: boolean; token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("token", data.token);
      router.push("/admin/posts");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-xs">
        <a href="/" className="text-xs text-[var(--muted)] no-underline hover:text-[var(--fg)] transition-colors">
          &larr; Back to blog
        </a>
        <h1 className="text-lg font-semibold mt-8 mb-8">Sign In</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted)]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted)]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[42px] bg-[var(--accent-soft)] border border-[var(--accent)] text-sm font-semibold rounded-md hover:bg-[var(--accent)] hover:text-white transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
