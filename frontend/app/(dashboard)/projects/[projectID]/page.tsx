"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Code2,
  FileCode,
  FolderKanban,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Upload,
} from "lucide-react";
import {
  createScan,
  getProjects,
  getScans,
  getFindings,
  getFinding,
  uploadProject,
  saveSnippet,
  explainFinding,
  remediateFinding,
  type Scan,
  type ScannerType,
  type Finding,
  type FindingDetail,
  type FindingExplanation,
  type RemediationSuggestion,
} from "@/lib/api";
import RemediationManager from "@/components/RemediationManager";

interface Project {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
}

export default function ProjectPage() {
  const pathname = usePathname();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingScans, setLoadingScans] = useState(true);

  const [error, setError] = useState("");
  const [scanError, setScanError] = useState("");

  const [selectedScanner, setSelectedScanner] = useState<ScannerType>("all");
  const [startingScan, setStartingScan] = useState(false);

  // Source: upload vs paste
  const [sourceMode, setSourceMode] = useState<"upload" | "paste">("upload");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  const [snippetFilename, setSnippetFilename] = useState("snippet.py");
  const [snippetCode, setSnippetCode] = useState("");
  const [savingSnippet, setSavingSnippet] = useState(false);
  const [snippetError, setSnippetError] = useState("");
  const [snippetSuccess, setSnippetSuccess] = useState("");

  // Findings state
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<FindingDetail | null>(null);

  const [loadingFindings, setLoadingFindings] = useState(false);
  const [loadingFindingDetail, setLoadingFindingDetail] = useState(false);
  const [findingError, setFindingError] = useState("");

  // AI: Explain / Remediate state
  const [explanation, setExplanation] = useState<FindingExplanation | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [explainError, setExplainError] = useState("");

  const [remediation, setRemediation] = useState<RemediationSuggestion | null>(null);
  const [loadingRemediation, setLoadingRemediation] = useState(false);
  const [remediateError, setRemediateError] = useState("");

  const projectId = pathname.split("/").filter(Boolean).pop() || "";

  // Load project
  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
      if (!projectId || projectId === "projects") {
        if (!cancelled) {
          setError("Project ID is missing");
          setLoading(false);
        }
        return;
      }

      const token = localStorage.getItem("access_token");
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const projects = await getProjects(token);
        if (cancelled) return;

        const foundProject = projects.find((item: Project) => item.id === projectId);
        if (!foundProject) {
          setError("Project not found");
          return;
        }

        setProject(foundProject);
        setError("");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to load project");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProject();
    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  // Load scans
  useEffect(() => {
    let cancelled = false;

    async function loadScans() {
      if (!projectId || projectId === "projects") {
        if (!cancelled) setLoadingScans(false);
        return;
      }

      const token = localStorage.getItem("access_token");
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const data = await getScans(token, projectId);
        if (cancelled) return;
        setScans(data);
        setScanError("");
      } catch (err) {
        if (cancelled) return;
        setScanError(err instanceof Error ? err.message : "Failed to load scans");
      } finally {
        if (!cancelled) setLoadingScans(false);
      }
    }

    loadScans();
    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  async function handleUpload() {
    if (!uploadFile || !projectId || projectId === "projects") return;

    try {
      setUploading(true);
      setUploadError("");
      setUploadSuccess("");

      const token = localStorage.getItem("access_token");
      if (!token) {
        router.push("/login");
        return;
      }

      await uploadProject(token, projectId, uploadFile);
      setUploadSuccess("Archive uploaded and unpacked. You can now launch a security scan.");
      setUploadFile(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload project");
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveSnippet() {
    if (!snippetCode.trim() || !projectId || projectId === "projects") return;

    try {
      setSavingSnippet(true);
      setSnippetError("");
      setSnippetSuccess("");

      const token = localStorage.getItem("access_token");
      if (!token) {
        router.push("/login");
        return;
      }

      const filename = snippetFilename.trim() || "snippet.py";
      await saveSnippet(token, projectId, filename, snippetCode);
      setSnippetSuccess(`Saved snippet "${filename}". Ready for scanner analysis.`);
    } catch (err) {
      setSnippetError(err instanceof Error ? err.message : "Failed to save code snippet");
    } finally {
      setSavingSnippet(false);
    }
  }

  async function handleStartScan() {
    if (!projectId || projectId === "projects") return;

    try {
      setStartingScan(true);
      setScanError("");

      const token = localStorage.getItem("access_token");
      if (!token) {
        router.push("/login");
        return;
      }

      await createScan(token, projectId, selectedScanner);
      const updatedScans = await getScans(token, projectId);
      setScans(updatedScans);

      // Auto-select latest scan findings
      if (updatedScans.length > 0) {
        handleViewFindings(updatedScans[0]);
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Failed to start scan");
    } finally {
      setStartingScan(false);
    }
  }

  async function handleViewFindings(scan: Scan) {
    if (scan.status !== "completed") return;

    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      setSelectedScan(scan);
      setFindings([]);
      setSelectedFinding(null);
      setFindingError("");
      setLoadingFindings(true);

      const data = await getFindings(token, scan.id);
      setFindings(data);
      if (data.length > 0) {
        handleViewFinding(data[0]);
      }
    } catch (err) {
      setFindingError(err instanceof Error ? err.message : "Failed to load findings");
    } finally {
      setLoadingFindings(false);
    }
  }

  async function handleViewFinding(finding: Finding) {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }

    setExplanation(null);
    setExplainError("");
    setRemediation(null);
    setRemediateError("");

    try {
      setLoadingFindingDetail(true);
      setFindingError("");

      const detail = await getFinding(token, finding.id);
      setSelectedFinding(detail);
    } catch (err) {
      setFindingError(err instanceof Error ? err.message : "Failed to load finding details");
    } finally {
      setLoadingFindingDetail(false);
    }
  }

  async function handleExplainFinding() {
    if (!selectedFinding) return;

    try {
      setLoadingExplanation(true);
      setExplainError("");

      const token = localStorage.getItem("access_token");
      if (!token) {
        router.push("/login");
        return;
      }

      const result = await explainFinding(token, selectedFinding.id);
      setExplanation(result);
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : "Failed to get AI explanation");
    } finally {
      setLoadingExplanation(false);
    }
  }

  async function handleSuggestFix() {
    if (!selectedFinding) return;

    try {
      setLoadingRemediation(true);
      setRemediateError("");

      const token = localStorage.getItem("access_token");
      if (!token) {
        router.push("/login");
        return;
      }

      const result = await remediateFinding(token, selectedFinding.id);
      setRemediation(result);
    } catch (err) {
      setRemediateError(err instanceof Error ? err.message : "Failed to generate AI remediation");
    } finally {
      setLoadingRemediation(false);
    }
  }

  function getSeverityClass(severity: string) {
    switch (severity.toLowerCase()) {
      case "critical":
        return "bg-rose-950/60 text-rose-300 border border-rose-500/30";
      case "high":
        return "bg-orange-950/60 text-orange-300 border border-orange-500/30";
      case "medium":
        return "bg-amber-950/60 text-amber-300 border border-amber-500/30";
      case "low":
        return "bg-indigo-950/60 text-indigo-300 border border-indigo-500/30";
      default:
        return "bg-slate-800 text-slate-400 border border-slate-700";
    }
  }

  const latestScan = scans.length > 0 ? scans[0] : null;

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm font-medium text-slate-400">Loading project security workspace...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto mt-12">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Link>
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-8 text-center space-y-2">
          <ShieldAlert className="mx-auto h-8 w-8 text-rose-400" />
          <h2 className="text-lg font-bold text-white">Project Not Found</h2>
          <p className="text-xs text-rose-300">{error || "Could not retrieve the specified workspace."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Top Breadcrumb & Title */}
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <span>{project.name}</span>
              <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/20 font-mono">
                Active Project
              </span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400 max-w-2xl">
              {project.description || "Monitored codebase for automated SAST, SCA, and AI patch synthesis."}
            </p>
          </div>

          <div className="text-xs text-slate-500 font-mono">
            Created: {new Date(project.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Two Column Layout: Source Upload & Scan Controls */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card 1: Source Upload / Paste */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-indigo-400" />
              Project Source
            </h2>
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                onClick={() => setSourceMode("upload")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  sourceMode === "upload" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
                }`}
              >
                Upload .zip
              </button>
              <button
                onClick={() => setSourceMode("paste")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  sourceMode === "paste" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
                }`}
              >
                Paste Code
              </button>
            </div>
          </div>

          {sourceMode === "upload" ? (
            <div className="space-y-3 pt-2">
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                disabled={uploading}
                className="block w-full text-xs text-slate-400 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
              />
              <button
                onClick={handleUpload}
                disabled={uploading || !uploadFile}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50 transition"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Extracting & Preparing..." : "Upload & Prepare Code"}
              </button>

              {uploadSuccess && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-300">
                  {uploadSuccess}
                </div>
              )}
              {uploadError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
                  {uploadError}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <input
                type="text"
                value={snippetFilename}
                onChange={(e) => setSnippetFilename(e.target.value)}
                placeholder="snippet.py"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 font-mono"
              />
              <textarea
                value={snippetCode}
                onChange={(e) => setSnippetCode(e.target.value)}
                placeholder="Paste code snippet to scan..."
                rows={6}
                className="w-full resize-none rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 font-mono leading-relaxed"
              />
              <button
                onClick={handleSaveSnippet}
                disabled={savingSnippet || !snippetCode.trim()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50 transition"
              >
                <FileCode className="h-3.5 w-3.5" />
                {savingSnippet ? "Saving..." : "Save Code Snippet"}
              </button>

              {snippetSuccess && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-300">
                  {snippetSuccess}
                </div>
              )}
              {snippetError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
                  {snippetError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card 2: Security Scan Launcher */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Shield className="h-4 w-4 text-cyan-400" />
              Execute Security Scan
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Run automated Semgrep static analysis (SAST) and Trivy dependency vulnerability checks (SCA).
            </p>

            <div className="mt-4 space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Select Analysis Engine
              </label>
              <select
                value={selectedScanner}
                onChange={(e) => setSelectedScanner(e.target.value as ScannerType)}
                disabled={startingScan}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white outline-none focus:border-indigo-500"
              >
                <option value="all">Hybrid Scan (Semgrep SAST + Trivy SCA)</option>
                <option value="semgrep">Semgrep Static Analysis (SAST)</option>
                <option value="trivy">Trivy Dependency Vulnerabilities (SCA)</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleStartScan}
              disabled={startingScan}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:opacity-90 disabled:opacity-50 transition"
            >
              {startingScan ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Scanning Codebase...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-white" />
                  <span>Launch Automated Scan</span>
                </>
              )}
            </button>

            {scanError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
                {scanError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Security Posture Overview (Latest Scan) */}
      {latestScan && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Security Score</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">
                {latestScan.security_score ?? "—"}
              </span>
              <span className="text-xs text-slate-500">/ 100</span>
            </div>
            <p className="mt-1 text-xs text-emerald-400 font-medium">
              {latestScan.security_score && latestScan.security_score >= 80
                ? "Good Standing"
                : "Remediation Recommended"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Findings</span>
            <p className="mt-2 text-3xl font-extrabold text-white">{latestScan.total_findings}</p>
            <p className="mt-1 text-xs text-slate-400">Flagged across scan rules</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Critical Alerts</span>
            <p className="mt-2 text-3xl font-extrabold text-rose-400">{latestScan.critical_count}</p>
            <p className="mt-1 text-xs text-slate-400">Immediate action required</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">High Alerts</span>
            <p className="mt-2 text-3xl font-extrabold text-orange-400">{latestScan.high_count}</p>
            <p className="mt-1 text-xs text-slate-400">High priority vulnerability</p>
          </div>
        </div>
      )}

      {/* Scan History Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Scan History</h2>
          <span className="text-xs text-slate-400 font-mono">
            {scans.length} {scans.length === 1 ? "scan" : "scans"} recorded
          </span>
        </div>

        {loadingScans ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-xs text-slate-500">
            Loading scan history...
          </div>
        ) : scans.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
            No scans executed yet. Click &quot;Launch Automated Scan&quot; above to start.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3">Scanner</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Score</th>
                  <th className="px-5 py-3">Findings</th>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {scans.map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-3 font-semibold text-white uppercase font-mono">
                      {scan.scanner || "hybrid"}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-300 border border-slate-700">
                        {scan.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono font-bold text-white">
                      {scan.security_score ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`font-semibold ${
                          scan.total_findings > 0 ? "text-amber-400" : "text-emerald-400"
                        }`}
                      >
                        {scan.total_findings} findings
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 font-mono text-[11px]">
                      {new Date(scan.created_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {scan.status === "completed" && scan.total_findings > 0 ? (
                        <button
                          onClick={() => handleViewFindings(scan)}
                          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                        >
                          View Findings
                        </button>
                      ) : (
                        <span className="text-slate-600">Clean</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Scan Findings Section */}
      {selectedScan && (
        <div className="space-y-5 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">
                Findings ({findings.length})
              </h2>
              <p className="text-xs text-slate-400">
                Results from {selectedScan.scanner || "selected"} scan. Select a finding below or open its dedicated analysis page.
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedScan(null);
                setFindings([]);
                setSelectedFinding(null);
              }}
              className="text-xs text-slate-400 hover:text-white transition"
            >
              Close Findings
            </button>
          </div>

          {findingError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300">
              {findingError}
            </div>
          )}

          {loadingFindings ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading findings...</div>
          ) : findings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
              Zero vulnerabilities detected in this scan.
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Finding list */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                <div className="border-b border-slate-800 px-5 py-3.5 bg-slate-950/60 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Vulnerability List
                </div>

                <div className="divide-y divide-slate-800/60 max-h-[560px] overflow-y-auto">
                  {findings.map((finding) => (
                    <div
                      key={finding.id}
                      className={`flex items-center justify-between p-4 transition hover:bg-slate-800/40 ${
                        selectedFinding?.id === finding.id
                          ? "bg-indigo-950/30 border-l-4 border-l-indigo-500"
                          : ""
                      }`}
                    >
                      <button
                        onClick={() => handleViewFinding(finding)}
                        className="flex-1 text-left min-w-0 pr-3 focus:outline-none"
                      >
                        <p className="font-semibold text-white text-xs sm:text-sm truncate">
                          {finding.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 font-mono truncate">
                          {finding.scanner} • {finding.file_path || "source"} {finding.start_line ? `:${finding.start_line}` : ""}
                        </p>
                      </button>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getSeverityClass(finding.severity)}`}>
                          {finding.severity}
                        </span>

                        <Link
                          href={`/projects/${projectId}/findings/${finding.id}`}
                          title="Open dedicated analysis page in full screen"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-600 hover:text-white transition"
                        >
                          <span>Open</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Preview & Action Drawer */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-white">Finding Quick Triage</h3>
                  {selectedFinding && (
                    <Link
                      href={`/projects/${projectId}/findings/${selectedFinding.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
                    >
                      <span>Full Analysis Page</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>

                {!selectedFinding ? (
                  <p className="text-xs text-slate-500 text-center py-12">
                    Select a finding on the left to inspect code context and remediation.
                  </p>
                ) : loadingFindingDetail ? (
                  <p className="text-xs text-slate-500 text-center py-12">Loading finding details...</p>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${getSeverityClass(selectedFinding.severity)}`}>
                        {selectedFinding.severity}
                      </span>
                      <h4 className="mt-2 text-base font-bold text-white">{selectedFinding.title}</h4>
                      <p className="mt-1 text-xs text-slate-400 font-mono">
                        {selectedFinding.file_path} {selectedFinding.start_line ? `(Line ${selectedFinding.start_line})` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleExplainFinding}
                        disabled={loadingExplanation}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition disabled:opacity-50"
                      >
                        {loadingExplanation ? "Analyzing..." : "Explain with AI"}
                      </button>
                      <button
                        onClick={handleSuggestFix}
                        disabled={loadingRemediation}
                        className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition disabled:opacity-50"
                      >
                        {loadingRemediation ? "Generating Fix..." : "Suggest Fix"}
                      </button>
                    </div>

                    {explanation && (
                      <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 text-xs space-y-2">
                        <p className="font-semibold text-indigo-400">AI Root Cause Analysis:</p>
                        <p className="text-slate-300 leading-relaxed">{explanation.root_cause}</p>
                      </div>
                    )}

                    {/* Quick Remediation Pipeline */}
                    <RemediationManager
                      findingId={selectedFinding.id}
                      projectId={projectId}
                      findingTitle={selectedFinding.title}
                      filePath={selectedFinding.file_path}
                      suggestedRemediation={remediation}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}