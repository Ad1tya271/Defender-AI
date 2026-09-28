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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Security Operations Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time vulnerability metrics, project security health, and scan audit streams.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadDashboardData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-gray-800 transition"
          >
            <Plus className="h-4 w-4" />
            Manage Projects
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Projects Metric */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Projects</span>
            <FolderKanban className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-gray-900">{projects.length}</p>
          <p className="mt-1 text-xs text-gray-400">Repositories monitored</p>
        </div>

        {/* Scans Metric */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Scans Run</span>
            <Shield className="h-5 w-5 text-sky-600" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-gray-900">{scans.length}</p>
          <p className="mt-1 text-xs text-emerald-600 font-medium">
            {completedScans} completed successfully
          </p>
        </div>

        {/* Total Findings Metric */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Findings</span>
            <ShieldAlert className="h-5 w-5 text-amber-500" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-gray-900">{totalFindings}</p>
          <p className="mt-1 text-xs text-gray-400">SAST & SCA identified</p>
        </div>

        {/* Critical & High Severity Metric */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Critical & High</span>
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-rose-600">
            {totalCritical + totalHigh}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {totalCritical} Critical · {totalHigh} High
          </p>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Main Content Layout */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left 2 Cols: Projects Grid */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Your Projects</h2>
            <Link
              href="/projects"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin text-gray-400 mb-2" />
              Loading projects and scan telemetry...
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <FolderKanban className="mx-auto h-10 w-10 text-gray-300 mb-3" />
              <h3 className="text-base font-semibold text-gray-900">No projects yet</h3>
              <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
                Create a project and upload your code archive or paste snippets to perform automated SAST and SCA vulnerability scans.
              </p>
              <Link
                href="/projects"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-gray-800"
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
                    className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-indigo-400 hover:shadow-md transition block space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition">
                          {project.name}
                        </h3>
                        <p className="mt-1 text-xs text-gray-500 line-clamp-2">
                          {project.description || "No description provided."}
                        </p>
                      </div>
                      <span className="rounded-full bg-gray-100 p-2 text-gray-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs text-gray-500">
                      <span>{projectScans.length} scan{projectScans.length !== 1 ? "s" : ""}</span>
                      {latestScan ? (
                        <span
                          className={`font-semibold ${
                            latestScan.security_score && latestScan.security_score >= 80
                              ? "text-emerald-600"
                              : latestScan.security_score && latestScan.security_score >= 50
                              ? "text-amber-600"
                              : "text-rose-600"
                          }`}
                        >
                          Score: {latestScan.security_score ?? "N/A"}/100
                        </span>
                      ) : (
                        <span className="text-gray-400">Not scanned</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 1 Col: Recent Scans Stream & Engine Status */}
        <div className="space-y-6">
          {/* Quick Engine Status Card */}
          <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 via-white to-indigo-50/20 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-indigo-600" />
                Security Engines
              </span>
              <Link
                href="/settings"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
              >
                Diagnostics →
              </Link>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Semgrep (SAST)</span>
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Ready
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Trivy (SCA/IaC)</span>
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Ready
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">AI Remediation</span>
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Ollama Qwen2.5
                </span>
              </div>
            </div>
          </div>

          {/* Recent Scans Feed */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 text-sm">Recent Scans</h3>
              <Link
                href="/scans"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
              >
                View all ({scans.length})
              </Link>
            </div>

            {scans.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">No scans recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {scans.slice(0, 5).map((scan) => (
                  <div
                    key={scan.id}
                    className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0"
                  >
                    <div>
                      <span className="font-semibold text-gray-800 uppercase block font-mono">
                        {scan.scanner || "hybrid"}
                      </span>
                      <span className="text-gray-400 text-[11px]">
                        {new Date(scan.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="text-right">
                      <span
                        className={`font-bold block ${
                          scan.total_findings > 0 ? "text-amber-600" : "text-emerald-600"
                        }`}
                      >
                        {scan.total_findings} finding{scan.total_findings !== 1 ? "s" : ""}
                      </span>
                      <span className="text-[11px] text-gray-400 uppercase">
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