"use client";

import { FormEvent, useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Shield, Lock, Mail, ArrowRight, Sparkles, CheckCircle2, AlertTriangle, Key, Clock } from "lucide-react";
import { login, register, isTokenExpired } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-switch mode if query param ?mode=register is provided
  useEffect(() => {
    if (searchParams.get("mode") === "register" || searchParams.get("tab") === "register") {
      setMode("register");
    }
  }, [searchParams]);

  // If already logged in with a valid non-expired token, redirect straight to dashboard
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token && !isTokenExpired(token)) {
      router.push("/dashboard");
    } else if (token) {
      localStorage.removeItem("access_token");
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (mode === "register") {
        // Register new account
        await register(email, password);
        setSuccess("Account created successfully! Logging you in...");
        // Auto-login upon registration
        const authData = await login(email, password);
        localStorage.setItem("access_token", authData.access_token);
        router.push("/dashboard");
      } else {
        // Sign in to existing account
        const data = await login(email, password);
        localStorage.setItem("access_token", data.access_token);
        router.push("/dashboard");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === "register"
          ? "Registration failed. Password must be at least 8 characters."
          : "Invalid credentials. Please verify your email and password."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleFillDemo() {
    setEmail("security.lead@defender.local");
    setPassword("SovereignSec2026!");
    setError("");
  }

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden text-slate-100 font-sans">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Brand Header */}
      <div className="mb-8 text-center relative z-10">
        <Link href="/" className="inline-flex items-center gap-3 group">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-0.5 shadow-xl shadow-indigo-500/25 group-hover:scale-105 transition">
            <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-slate-950">
              <Shield className="h-6 w-6 text-indigo-400" />
            </div>
          </div>
          <div className="text-left">
            <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              DefenderAI
            </span>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
              Autonomous AppSec Platform
            </span>
          </div>
        </Link>
      </div>

      {/* Main Authentication Card */}
      <div className="w-full max-w-md rounded-2xl border border-slate-800/90 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl relative z-10">
        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 rounded-xl bg-slate-950 p-1 border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
              setSuccess("");
            }}
            className={`py-2 text-xs font-semibold rounded-lg transition ${
              mode === "login"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError("");
              setSuccess("");
            }}
            className={`py-2 text-xs font-semibold rounded-lg transition ${
              mode === "register"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Create Account
          </button>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-bold text-white tracking-tight">
            {mode === "login" ? "Welcome back" : "Create your workspace"}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {mode === "login"
              ? "Access your sovereign vulnerability triage and verification console."
              : "Set up your secure local security analyst account in seconds."}
          </p>
        </div>

        {searchParams.get("expired") === "true" && !error && (
          <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-amber-950/50 border border-amber-500/30 p-3.5 text-xs text-amber-300">
            <Clock className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <span className="font-semibold block text-amber-200">Session Expired</span>
              <span>Your security session has expired. Please sign in again to continue.</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-xl bg-rose-950/40 border border-rose-500/30 p-3.5 text-xs text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-start gap-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30 p-3.5 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@organization.local"
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-950/90 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                minLength={8}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/90 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
            {mode === "register" && (
              <p className="mt-1 text-[11px] text-slate-500">
                Minimum 8 characters with at least one letter and number.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>{mode === "login" ? "Authenticating..." : "Creating Account..."}</span>
              </>
            ) : (
              <>
                <span>{mode === "login" ? "Sign In to Console" : "Create Security Account"}</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Fill Helper */}
        <div className="mt-6 pt-5 border-t border-slate-800 text-center">
          <button
            type="button"
            onClick={handleFillDemo}
            className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition"
          >
            <Key className="h-3.5 w-3.5" />
            <span>Fill Demo Credentials</span>
          </button>
        </div>
      </div>

      {/* Return to Home link */}
      <div className="mt-6 text-center relative z-10">
        <Link
          href="/"
          className="text-xs text-slate-400 hover:text-white transition inline-flex items-center gap-1"
        >
          <span>&larr; Back to Platform Homepage</span>
        </Link>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          <div className="flex items-center gap-2 text-sm">
            <div className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <span>Loading authentication console...</span>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}