"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  HardDrive,
  RefreshCw,
  Server,
  Shield,
  XCircle,
} from "lucide-react";
import { getSystemHealth, type SystemHealth } from "@/lib/api";

export default function SettingsPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHealth = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getSystemHealth();
      setHealth(data);
    } catch (err) {
      console.error("Failed to load system health:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to DefenderAI backend API"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, []);

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            System Infrastructure & Diagnostics
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Real-time status diagnostics for the security analysis engines, AI provider, and database.
          </p>
        </div>
        <button
          onClick={loadHealth}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 shadow-sm hover:bg-slate-800 hover:text-white transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Run Health Diagnostic
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300">
          <div className="flex items-center gap-2 font-semibold">
            <XCircle className="h-4 w-4 text-rose-400" />
            Backend API Unreachable
          </div>
          <p className="mt-1 text-[11px] text-rose-400">{error}</p>
        </div>
      )}

      {/* Health Overview Banner */}
      {health && (
        <div
          className={`rounded-2xl border p-6 backdrop-blur-sm transition ${
            health.status === "ok"
              ? "border-emerald-500/30 bg-emerald-950/20"
              : "border-amber-500/30 bg-amber-950/20"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl text-white ${
                  health.status === "ok" ? "bg-emerald-600 shadow-lg shadow-emerald-600/30" : "bg-amber-600 shadow-lg shadow-amber-600/30"
                }`}
              >
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">
                    System State: {health.status === "ok" ? "All Systems Operational" : "Degraded Diagnostics"}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                      health.status === "ok"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                        : "bg-amber-950 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {health.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Execution Mode:{" "}
                  <strong className="text-slate-200 uppercase">{health.execution_mode}</strong> (Environment:{" "}
                  <span className="font-mono text-slate-300">{health.app_env}</span>)
                </p>
              </div>
            </div>

            <div className="text-right text-xs text-slate-400 font-mono">
              Diagnostic Timestamp:
              <br />
              <span className="text-slate-300">{new Date(health.timestamp).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Infrastructure Components Grid */}
      {health && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* 1. Database Diagnostic Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Database className="h-5 w-5 text-indigo-400" />
                <h3 className="font-semibold text-white">PostgreSQL Database</h3>
              </div>
              {health.database.connected ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400">
                  <XCircle className="h-4 w-4 text-rose-400" /> Offline
                </span>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Query Latency:</span>
                <span className="font-mono font-medium text-slate-200">
                  {health.database.latency_ms !== null ? `${health.database.latency_ms} ms` : "N/A"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Schema Head:</span>
                <span className="font-mono font-medium text-emerald-400">Alembic Up to Date</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Tables:</span>
                <span className="text-slate-300 font-medium">
                  projects, scans, findings, remediations, verifications, audit_events
                </span>
              </div>
            </div>
          </div>

          {/* 2. Ollama AI Engine Diagnostic Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Cpu className="h-5 w-5 text-cyan-400" />
                <h3 className="font-semibold text-white">Local AI Engine (Ollama)</h3>
              </div>
              {health.ai_service.reachable ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
                  <XCircle className="h-4 w-4 text-amber-400" /> Unreachable
                </span>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Base URL:</span>
                <span className="font-mono text-slate-200">{health.ai_service.base_url}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Target Model:</span>
                <span className="font-mono font-semibold text-indigo-400">
                  {health.ai_service.configured_model}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Model Ready:</span>
                <span
                  className={`font-semibold ${
                    health.ai_service.model_available ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {health.ai_service.model_available ? "Yes (Loaded)" : "Not installed in Ollama"}
                </span>
              </div>
              <div className="pt-1">
                <span className="text-slate-400 block mb-1">Available Models:</span>
                <div className="flex flex-wrap gap-1">
                  {health.ai_service.available_models.length > 0 ? (
                    health.ai_service.available_models.map((m) => (
                      <span
                        key={m}
                        className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300 border border-slate-700"
                      >
                        {m}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 italic">None detected</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Semgrep Scanner Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Shield className="h-5 w-5 text-indigo-400" />
                <h3 className="font-semibold text-white">Semgrep (SAST Engine)</h3>
              </div>
              {health.scanners.semgrep.installed ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Installed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400">
                  <XCircle className="h-4 w-4 text-rose-400" /> Missing
                </span>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Executable Path:</span>
                <span className="font-mono text-slate-200 text-[11px] truncate max-w-[280px]" title={health.scanners.semgrep.path}>
                  {health.scanners.semgrep.path}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Rule Profile:</span>
                <span className="font-medium text-slate-300">--config=auto (OWASP Top 10 + CWE)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Analysis:</span>
                <span className="text-slate-300 font-medium">Static Code Analysis & Taint Tracking</span>
              </div>
            </div>
          </div>

          {/* 4. Trivy Scanner Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <HardDrive className="h-5 w-5 text-amber-400" />
                <h3 className="font-semibold text-white">Trivy (SCA & Config Engine)</h3>
              </div>
              {health.scanners.trivy.installed ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Installed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400">
                  <XCircle className="h-4 w-4 text-rose-400" /> Missing
                </span>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Executable Path:</span>
                <span className="font-mono text-slate-200 text-[11px] truncate max-w-[280px]" title={health.scanners.trivy.path}>
                  {health.scanners.trivy.path}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Capabilities:</span>
                <span className="font-medium text-slate-300">SCA (CVEs), Lockfiles & Misconfigurations</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Offline DB:</span>
                <span className="text-emerald-400 font-medium">Fast Local Cache Enabled</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Execution Architecture Documentation Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <Server className="h-4 w-4 text-indigo-400" />
          Deployment Architecture Modes
        </h3>
        <div className="grid gap-4 sm:grid-cols-3 text-xs text-slate-400 pt-2">
          <div className="rounded-xl bg-slate-950 p-4 space-y-1.5 border border-slate-800">
            <span className="font-bold text-white block">1. Local Mode (Active)</span>
            <p>
              Source code, scanners (Semgrep, Trivy), and AI inference (Ollama) execute 100% locally. Zero proprietary code leaves this machine.
            </p>
          </div>
          <div className="rounded-xl bg-slate-950 p-4 space-y-1.5 border border-slate-800">
            <span className="font-bold text-white block">2. Cloud Mode</span>
            <p>
              Hosted dashboard with cloud-native PostgreSQL, background task workers, and secured multi-tenant workspace isolation.
            </p>
          </div>
          <div className="rounded-xl bg-slate-950 p-4 space-y-1.5 border border-slate-800">
            <span className="font-bold text-white block">3. Hybrid Agent Mode</span>
            <p>
              Centralized dashboard with on-premise local scanning agents. The cloud only receives normalized finding metadata; source remains local.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
