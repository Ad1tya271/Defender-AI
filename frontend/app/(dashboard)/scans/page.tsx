"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { getAllScans, getProjects, type Scan } from "@/lib/api";

interface Project {
  id: string;
  name: string;
}

export default function ScansPage() {
  const router = useRouter();
  const [scans, setScans] = useState<Scan[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scannerFilter, setScannerFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [scansData, projectsData] = await Promise.all([
        getAllScans(token),
        getProjects(token),
      ]);

      setScans(scansData);

      const projMap: Record<string, string> = {};
      projectsData.forEach((p: Project) => {
        projMap[p.id] = p.name;
      });
      setProjects(projMap);
    } catch (err) {
      console.error("Failed to load scans data:", err);
      setError(err instanceof Error ? err.message : "Failed to load scans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredScans = useMemo(() => {
    return scans.filter((scan) => {
      const matchesScanner =
        scannerFilter === "all" ||
        (scan.scanner || "").toLowerCase() === scannerFilter.toLowerCase();
      const projName = projects[scan.project_id] || "";
      const matchesSearch =
        !searchQuery ||
        projName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        scan.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesScanner && matchesSearch;
    });
  }, [scans, scannerFilter, searchQuery, projects]);

  const totalCritical = scans.reduce((acc, s) => acc + (s.critical_count || 0), 0);
  const totalHigh = scans.reduce((acc, s) => acc + (s.high_count || 0), 0);
  const totalFindings = scans.reduce((acc, s) => acc + (s.total_findings || 0), 0);
  const completedScans = scans.filter((s) => s.status === "completed").length;

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Page Title & Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Security Scans History
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Auditable log of all SAST and SCA scans performed across DefenderAI workspaces.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 shadow-sm hover:bg-slate-800 hover:text-white transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Scans</span>
            <Shield className="h-5 w-5 text-indigo-400" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-white">{scans.length}</p>
          <p className="mt-1 text-xs text-slate-400">{completedScans} completed successfully</p>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Findings</span>
            <ShieldAlert className="h-5 w-5 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-white">{totalFindings}</p>
          <p className="mt-1 text-xs text-slate-400">Across all repository scans</p>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Critical Severity</span>
            <AlertOctagon className="h-5 w-5 text-rose-400" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-rose-400">{totalCritical}</p>
          <p className="mt-1 text-xs text-slate-400">Immediate remediation required</p>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">High Severity</span>
            <ShieldAlert className="h-5 w-5 text-orange-400" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-orange-400">{totalHigh}</p>
          <p className="mt-1 text-xs text-slate-400">Prioritized for AI fix proposals</p>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by project name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl border border-slate-800 bg-slate-950 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <span>Scanner:</span>
            <select
              value={scannerFilter}
              onChange={(e) => setScannerFilter(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500"
            >
              <option value="all">All Scanners</option>
              <option value="semgrep">Semgrep (SAST)</option>
              <option value="trivy">Trivy (SCA/IaC)</option>
            </select>
          </div>
        </div>

        <span className="text-xs text-slate-500">
          Showing {filteredScans.length} of {scans.length} records
        </span>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Scans Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-500 mb-2" />
            Loading security scan history...
          </div>
        ) : filteredScans.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-white">No scans found</p>
            <p className="text-xs text-slate-500 mt-1">
              Start a scan from any project workspace to view detailed vulnerability audit records here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-3.5">Project</th>
                  <th className="px-6 py-3.5">Scanner</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Findings Breakdown</th>
                  <th className="px-6 py-3.5">Security Score</th>
                  <th className="px-6 py-3.5">Date & Time</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredScans.map((scan) => {
                  const projName = projects[scan.project_id] || "Unknown Project";
                  return (
                    <tr key={scan.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-6 py-4 font-semibold text-white">
                        <Link
                          href={`/projects/${scan.project_id}`}
                          className="hover:text-indigo-400 transition"
                        >
                          {projName}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-semibold uppercase font-mono text-slate-300 border border-slate-700">
                          {scan.scanner === "semgrep"
                            ? "Semgrep SAST"
                            : scan.scanner === "trivy"
                            ? "Trivy SCA"
                            : "Hybrid (All)"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {scan.status === "completed" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Completed
                          </span>
                        ) : scan.status === "running" ? (
                          <span className="inline-flex items-center gap-1 text-cyan-400 font-medium">
                            <Clock className="h-3.5 w-3.5 text-cyan-400 animate-spin" /> Running
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                            <XCircle className="h-3.5 w-3.5 text-rose-400" /> Failed
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 font-medium">
                          {scan.critical_count > 0 && (
                            <span className="rounded bg-rose-950/60 border border-rose-500/30 px-1.5 py-0.5 text-rose-300 font-bold">
                              {scan.critical_count} Crit
                            </span>
                          )}
                          {scan.high_count > 0 && (
                            <span className="rounded bg-orange-950/60 border border-orange-500/30 px-1.5 py-0.5 text-orange-300 font-bold">
                              {scan.high_count} High
                            </span>
                          )}
                          {scan.medium_count > 0 && (
                            <span className="rounded bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 text-amber-300">
                              {scan.medium_count} Med
                            </span>
                          )}
                          {scan.low_count > 0 && (
                            <span className="rounded bg-indigo-950/60 border border-indigo-500/30 px-1.5 py-0.5 text-indigo-300">
                              {scan.low_count} Low
                            </span>
                          )}
                          {scan.total_findings === 0 && (
                            <span className="text-emerald-400 font-medium">0 findings</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {scan.security_score !== null && scan.security_score !== undefined ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              scan.security_score >= 80
                                ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30"
                                : scan.security_score >= 50
                                ? "bg-amber-950/60 text-amber-400 border border-amber-500/30"
                                : "bg-rose-950/60 text-rose-400 border border-rose-500/30"
                            }`}
                          >
                            {scan.security_score} / 100
                          </span>
                        ) : (
                          <span className="text-slate-500">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-mono text-[11px]">
                        {new Date(scan.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/projects/${scan.project_id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
                        >
                          <span>Inspect</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
