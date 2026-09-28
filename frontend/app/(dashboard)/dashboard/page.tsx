"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FolderKanban,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { getAllScans, getProjects, type Scan } from "@/lib/api";

type Project = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
};

export default function DashboardPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboardData = async () => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [projData, scanData] = await Promise.all([
        getProjects(token),
        getAllScans(token).catch(() => []),
      ]);

      setProjects(projData);
      setScans(scanData);
    } catch (err) {
      console.error("Dashboard load failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load dashboard data"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const totalCritical = scans.reduce((acc, s) => acc + (s.critical_count || 0), 0);
  const totalHigh = scans.reduce((acc, s) => acc + (s.high_count || 0), 0);
  const totalFindings = scans.reduce((acc, s) => acc + (s.total_findings || 0), 0);
  const completedScans = scans.filter((s) => s.status === "completed").length;

  return (
    <div className="space-y-8">
      {/* Header with Title & Quick Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Security Operations Console
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Real-time vulnerability metrics, project security health, and scan audit streams.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadDashboardData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 shadow-sm hover:bg-slate-800 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 transition"
          >
            <Plus className="h-4 w-4" />
            Manage Projects
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Projects Metric */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Projects</span>
            <FolderKanban className="h-5 w-5 text-indigo-400" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-white">{projects.length}</p>
          <p className="mt-1 text-xs text-slate-400">Repositories monitored</p>
        </div>

        {/* Scans Metric */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Scans Run</span>
            <Shield className="h-5 w-5 text-cyan-400" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-white">{scans.length}</p>
          <p className="mt-1 text-xs text-emerald-400 font-medium">
            {completedScans} completed successfully
          </p>
        </div>

        {/* Total Findings Metric */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Findings</span>
            <ShieldAlert className="h-5 w-5 text-amber-400" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-white">{totalFindings}</p>
          <p className="mt-1 text-xs text-slate-400">SAST & SCA identified</p>
        </div>

        {/* Critical & High Severity Metric */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Critical & High</span>
            <AlertTriangle className="h-5 w-5 text-rose-400" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-rose-400">
            {totalCritical + totalHigh}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {totalCritical} Critical · {totalHigh} High
          </p>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Main Content Layout */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left 2 Cols: Projects Grid */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Your Projects</h2>
            <Link
              href="/projects"
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-500 mb-2" />
              Loading projects and scan telemetry...
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center">
              <FolderKanban className="mx-auto h-10 w-10 text-slate-600 mb-3" />
              <h3 className="text-base font-semibold text-white">No projects yet</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                Create a project and upload your code archive or paste snippets to perform automated SAST and SCA vulnerability scans.
              </p>
              <Link
                href="/projects"
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Create First Project
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((project) => {
                const projectScans = scans.filter((s) => s.project_id === project.id);
                const latestScan = projectScans[0];

                return (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="group rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 hover:border-indigo-500/50 hover:bg-slate-900/90 transition block space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-white group-hover:text-indigo-400 transition truncate">
                          {project.name}
                        </h3>
                        <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                          {project.description || "No description provided."}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-800 p-2 text-slate-400 group-hover:bg-indigo-600/20 group-hover:text-indigo-300 transition">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                      <span>{projectScans.length} scan{projectScans.length !== 1 ? "s" : ""}</span>
                      {latestScan ? (
                        <span
                          className={`font-semibold ${
                            latestScan.security_score && latestScan.security_score >= 80
                              ? "text-emerald-400"
                              : latestScan.security_score && latestScan.security_score >= 50
                              ? "text-amber-400"
                              : "text-rose-400"
                          }`}
                        >
                          Score: {latestScan.security_score ?? "N/A"}/100
                        </span>
                      ) : (
                        <span className="text-slate-500">Not scanned</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 1 Col: Engine Status & Recent Scans */}
        <div className="space-y-6">
          {/* Quick Engine Status Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-indigo-400" />
                Security Engines
              </span>
              <Link
                href="/settings"
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
              >
                Diagnostics →
              </Link>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Semgrep (SAST)</span>
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Ready
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Trivy (SCA/IaC)</span>
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Ready
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">AI Remediation</span>
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Sovereign Engine
                </span>
              </div>
            </div>
          </div>

          {/* Recent Scans Feed */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">Recent Scans</h3>
              <Link
                href="/scans"
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
              >
                View all ({scans.length})
              </Link>
            </div>

            {scans.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No scans recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {scans.slice(0, 5).map((scan) => (
                  <div
                    key={scan.id}
                    className="flex items-center justify-between text-xs py-2 border-b border-slate-800/60 last:border-0"
                  >
                    <div>
                      <span className="font-semibold text-slate-200 uppercase block font-mono">
                        {scan.scanner || "hybrid"}
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        {new Date(scan.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="text-right">
                      <span
                        className={`font-bold block ${
                          scan.total_findings > 0 ? "text-amber-400" : "text-emerald-400"
                        }`}
                      >
                        {scan.total_findings} finding{scan.total_findings !== 1 ? "s" : ""}
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase font-mono">
                        {scan.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}