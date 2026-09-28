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
    <div className="space-y-8">
      {/* Page Title & Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Security Scans History
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Auditable log of all SAST and SCA scans performed across DefenderAI workspaces.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Scans</span>
            <Shield className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900">{scans.length}</p>
          <p className="mt-1 text-xs text-gray-500">{completedScans} completed successfully</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Findings</span>
            <ShieldAlert className="h-5 w-5 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900">{totalFindings}</p>
          <p className="mt-1 text-xs text-gray-500">Across all repository scans</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Critical Severity</span>
            <AlertOctagon className="h-5 w-5 text-rose-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-600">{totalCritical}</p>
          <p className="mt-1 text-xs text-gray-500">Immediate remediation required</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">High Severity</span>
            <ShieldAlert className="h-5 w-5 text-orange-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-orange-500">{totalHigh}</p>
          <p className="mt-1 text-xs text-gray-500">Prioritized for AI fix proposals</p>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by project name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg border border-gray-300 py-1.5 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Filter className="h-3.5 w-3.5" />
            <span className="font-medium">Scanner:</span>
            <select
              value={scannerFilter}
              onChange={(e) => setScannerFilter(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none"
            >
              <option value="all">All Scanners</option>
              <option value="semgrep">Semgrep (SAST)</option>
              <option value="trivy">Trivy (SCA/IaC)</option>
            </select>
          </div>
        </div>

        <span className="text-xs text-gray-500">
          Showing {filteredScans.length} of {scans.length} scan records
        </span>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Scans Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-gray-400 mb-2" />
            Loading security scan history...
          </div>
        ) : filteredScans.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-gray-300 mb-3" />
            <p className="text-base font-semibold text-gray-900">No scans found</p>
            <p className="text-xs text-gray-500 mt-1">
              Start a scan from any project workspace to view detailed vulnerability audit records here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
              <tbody className="divide-y divide-gray-100">
                {filteredScans.map((scan) => {
                  const projName = projects[scan.project_id] || "Unknown Project";
                  return (
                    <tr key={scan.id} className="hover:bg-gray-50/80 transition">
                      <td className="px-6 py-4 font-semibold text-gray-900">
                        <Link
                          href={`/projects/${scan.project_id}`}
                          className="hover:text-indigo-600 transition"
                        >
                          {projName}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                          {scan.scanner === "semgrep"
                            ? "Semgrep SAST"
                            : scan.scanner === "trivy"
                            ? "Trivy SCA"
                            : "Hybrid (All)"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {scan.status === "completed" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Completed
                          </span>
                        ) : scan.status === "running" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700">
                            <Clock className="h-4 w-4 text-sky-600 animate-spin" /> Running
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                            <XCircle className="h-4 w-4 text-rose-600" /> Failed
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          {scan.critical_count > 0 && (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-800 font-bold">
                              {scan.critical_count} Crit
                            </span>
                          )}
                          {scan.high_count > 0 && (
                            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-800 font-bold">
                              {scan.high_count} High
                            </span>
                          )}
                          {scan.medium_count > 0 && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                              {scan.medium_count} Med
                            </span>
                          )}
                          {scan.low_count > 0 && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800">
                              {scan.low_count} Low
                            </span>
                          )}
                          {scan.total_findings === 0 && (
                            <span className="text-emerald-600 font-medium">0 findings</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {scan.security_score !== null && scan.security_score !== undefined ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              scan.security_score >= 80
                                ? "bg-emerald-100 text-emerald-800"
                                : scan.security_score >= 50
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {scan.security_score} / 100
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500 font-mono">
                        {new Date(scan.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/projects/${scan.project_id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition"
                        >
                          Inspect <ArrowRight className="h-3 w-3" />
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
