"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  FileCode,
  FlaskConical,
  Info,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import {
  explainFinding,
  getFinding,
  getFindings,
  getProjects,
  remediateFinding,
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
}

export default function FindingDetailPage() {
  const params = useParams();
  const router = useRouter();

  const projectId = (params?.projectID as string) || "";
  const findingId = (params?.findingID as string) || "";

  const [project, setProject] = useState<Project | null>(null);
  const [finding, setFinding] = useState<FindingDetail | null>(null);
  const [allScanFindings, setAllScanFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [copiedPath, setCopiedPath] = useState(false);

  // AI States
  const [explanation, setExplanation] = useState<FindingExplanation | null>(null);
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [explainError, setExplainError] = useState("");

  const [remediation, setRemediation] = useState<RemediationSuggestion | null>(null);
  const [loadingRemediate, setLoadingRemediate] = useState(false);
  const [remediateError, setRemediateError] = useState("");

  // Load Finding & Project Data
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const token = localStorage.getItem("access_token");
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        setLoading(true);
        setError("");

        // 1. Fetch Finding Details
        const findingDetail = await getFinding(token, findingId);
        if (cancelled) return;
        setFinding(findingDetail);

        // 2. Fetch Projects to resolve project name
        const projects = await getProjects(token);
        if (cancelled) return;
        const currentProject = projects.find((p: Project) => p.id === projectId);
        if (currentProject) {
          setProject(currentProject);
        }

        // 3. Fetch sibling findings for sequential triage (prev/next)
        if (findingDetail.scan_id) {
          const scanFindings = await getFindings(token, findingDetail.scan_id);
          if (!cancelled) {
            setAllScanFindings(scanFindings);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load finding details:", err);
          setError(err instanceof Error ? err.message : "Failed to load finding details");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (projectId && findingId) {
      loadData();
    }

    return () => {
      cancelled = true;
    };
  }, [projectId, findingId, router]);

  // Sequential Triage Navigation
  const { currentIndex, prevFinding, nextFinding } = useMemo(() => {
    if (!finding || allScanFindings.length === 0) {
      return { currentIndex: -1, prevFinding: null, nextFinding: null };
    }
    const idx = allScanFindings.findIndex((f) => f.id === finding.id);
    return {
      currentIndex: idx,
      prevFinding: idx > 0 ? allScanFindings[idx - 1] : null,
      nextFinding: idx >= 0 && idx < allScanFindings.length - 1 ? allScanFindings[idx + 1] : null,
    };
  }, [finding, allScanFindings]);

  // Handlers
  const handleCopyPath = () => {
    if (!finding?.file_path) return;
    navigator.clipboard.writeText(finding.file_path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const handleExplain = async () => {
    const token = localStorage.getItem("access_token");
    if (!token || !finding) return;

    try {
      setLoadingExplain(true);
      setExplainError("");
      const result = await explainFinding(token, finding.id);
      setExplanation(result);
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : "Failed to generate AI explanation");
    } finally {
      setLoadingExplain(false);
    }
  };

  const handleSuggestFix = async () => {
    const token = localStorage.getItem("access_token");
    if (!token || !finding) return;

    try {
      setLoadingRemediate(true);
      setRemediateError("");
      const result = await remediateFinding(token, finding.id);
      setRemediation(result);
    } catch (err) {
      setRemediateError(err instanceof Error ? err.message : "Failed to generate AI remediation");
    } finally {
      setLoadingRemediate(false);
    }
  };

  // Severity styling
  const getSeverityBadge = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "critical":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-950/60 px-3 py-1 text-xs font-bold text-rose-300 border border-rose-500/30">
            <AlertOctagon className="h-3.5 w-3.5 text-rose-400" /> Critical Severity
          </span>
        );
      case "high":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-950/60 px-3 py-1 text-xs font-bold text-orange-300 border border-orange-500/30">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-400" /> High Severity
          </span>
        );
      case "medium":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/60 px-3 py-1 text-xs font-bold text-amber-300 border border-amber-500/30">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" /> Medium Severity
          </span>
        );
      case "low":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-950/60 px-3 py-1 text-xs font-bold text-indigo-300 border border-indigo-500/30">
            <Shield className="h-3.5 w-3.5 text-indigo-400" /> Low Severity
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300 border border-slate-700">
            <Info className="h-3.5 w-3.5 text-slate-400" /> Informational
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm font-medium text-slate-400">Loading comprehensive vulnerability analysis...</p>
      </div>
    );
  }

  if (error || !finding) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto mt-12">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-8 text-center space-y-3">
          <AlertOctagon className="mx-auto h-8 w-8 text-rose-400" />
          <h2 className="text-lg font-bold text-white">Finding Not Found or Unauthorized</h2>
          <p className="text-xs text-rose-300">{error || "The requested vulnerability finding does not exist."}</p>
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Project Findings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Top Breadcrumb & Sequential Triage Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/dashboard" className="hover:text-white transition">
            Dashboard
          </Link>
          <span>/</span>
          <Link href="/projects" className="hover:text-white transition">
            Projects
          </Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="hover:text-white font-medium text-slate-300 transition">
            {project?.name || "Project"}
          </Link>
          <span>/</span>
          <span className="font-semibold text-white truncate max-w-xs">{finding.rule_id || "Finding"}</span>
        </div>

        {/* Previous / Next Triage Buttons */}
        {allScanFindings.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">
              Finding {currentIndex + 1} of {allScanFindings.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => prevFinding && router.push(`/projects/${projectId}/findings/${prevFinding.id}`)}
                disabled={!prevFinding}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
                title={prevFinding?.title || "Previous finding"}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <button
                onClick={() => nextFinding && router.push(`/projects/${projectId}/findings/${nextFinding.id}`)}
                disabled={!nextFinding}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
                title={nextFinding?.title || "Next finding"}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Vulnerability Header Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {getSeverityBadge(finding.severity)}
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono border border-slate-700">
              <Terminal className="h-3 w-3" />
              {finding.scanner === "semgrep" ? "Semgrep SAST" : "Trivy SCA"}
            </span>
            {finding.rule_id && (
              <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-mono text-indigo-300 border border-slate-700">
                {finding.rule_id}
              </span>
            )}
          </div>

          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Project
          </Link>
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight text-white leading-snug">
          {finding.title}
        </h1>

        {/* Location & Metadata Bar */}
        <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-800 text-xs text-slate-400">
          {finding.file_path && (
            <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 font-mono">
              <FileCode className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span className="font-semibold text-slate-200">{finding.file_path}</span>
              {finding.start_line && (
                <span className="text-indigo-400 font-bold ml-1">
                  Line {finding.start_line}
                  {finding.end_line && finding.end_line !== finding.start_line ? `-${finding.end_line}` : ""}
                </span>
              )}
              <button
                onClick={handleCopyPath}
                className="ml-2 text-slate-500 hover:text-white transition"
                title="Copy relative file path"
              >
                {copiedPath ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}

          <span className="text-slate-500">
            Detected: <strong className="text-slate-400">{new Date(finding.created_at).toLocaleString()}</strong>
          </span>
        </div>
      </div>

      {/* Main Analysis Grid */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left 2 Cols: Code Context & Remediation Hub */}
        <div className="space-y-8 lg:col-span-2">
          {/* 1. Code Snippet Context Window */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Code2 className="h-4 w-4 text-indigo-400" />
                Vulnerable Code Context
              </h3>
              {finding.start_line && (
                <span className="text-xs text-indigo-400 font-mono font-semibold">
                  Lines {Math.max(1, finding.start_line - 5)} - {(finding.end_line || finding.start_line) + 5}
                </span>
              )}
            </div>

            {finding.code_snippet ? (
              <div className="rounded-xl bg-slate-950 font-mono text-xs leading-relaxed text-slate-200 shadow-inner overflow-hidden border border-slate-800">
                <div className="flex items-center justify-between bg-slate-900/90 px-4 py-2 border-b border-slate-800 text-[11px] text-slate-400">
                  <span>{finding.file_path || "source_file"}</span>
                  <span className="text-rose-400 font-medium">Flagged by {finding.scanner}</span>
                </div>
                <pre className="overflow-x-auto p-4 max-h-[380px]">
                  <code>{finding.code_snippet}</code>
                </pre>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
                Code context could not be extracted directly from disk.
              </div>
            )}

            {/* Finding Description / Taxonomy */}
            {finding.description && (
              <div className="space-y-1.5 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Scanner Advisory</h4>
                <div className="rounded-xl bg-slate-950 p-4 text-xs text-slate-300 leading-relaxed border border-slate-800 whitespace-pre-wrap">
                  {finding.description}
                </div>
              </div>
            )}
          </div>

          {/* 2. Interactive Remediation & Verification Sandbox Hub */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FlaskConical className="h-5 w-5 text-emerald-400" />
                  Verified Remediation Sandbox
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Generate fixes, inspect unified diffs, run isolated sandbox re-scans, and safely apply patches.
                </p>
              </div>

              {!remediation && (
                <button
                  onClick={handleSuggestFix}
                  disabled={loadingRemediate}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/30 hover:bg-emerald-500 disabled:opacity-50 transition"
                >
                  <Sparkles className={`h-4 w-4 ${loadingRemediate ? "animate-spin" : ""}`} />
                  {loadingRemediate ? "Generating AI Fix..." : "Generate AI Fix"}
                </button>
              )}
            </div>

            {remediateError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
                {remediateError}
              </div>
            )}

            {/* Embedded Remediation Pipeline with DiffViewer & Isolated Sandbox Verification */}
            <RemediationManager
              findingId={finding.id}
              projectId={projectId}
              findingTitle={finding.title}
              filePath={finding.file_path}
              suggestedRemediation={remediation}
            />
          </div>
        </div>

        {/* Right 1 Col: AI Security Intelligence */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-400" />
                AI Security Intelligence
              </h3>
              {!explanation && (
                <button
                  onClick={handleExplain}
                  disabled={loadingExplain}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50 transition"
                >
                  <Sparkles className={`h-3 w-3 ${loadingExplain ? "animate-spin" : ""}`} />
                  {loadingExplain ? "Analyzing..." : "Explain Finding"}
                </button>
              )}
            </div>

            {explainError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
                {explainError}
              </div>
            )}

            {explanation ? (
              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <span className="font-bold uppercase tracking-wider text-indigo-400 block text-[11px]">
                    Technical Root Cause
                  </span>
                  <p className="rounded-xl bg-slate-950 p-3 text-slate-300 leading-relaxed border border-slate-800">
                    {explanation.root_cause}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="font-bold uppercase tracking-wider text-rose-400 block text-[11px]">
                    Attack Vector & Exploitation
                  </span>
                  <p className="rounded-xl bg-slate-950 p-3 text-slate-300 leading-relaxed border border-slate-800">
                    {explanation.attack_vector}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="font-bold uppercase tracking-wider text-amber-400 block text-[11px]">
                    Potential Security Impact
                  </span>
                  <p className="rounded-xl bg-slate-950 p-3 text-slate-300 leading-relaxed border border-slate-800">
                    {explanation.impact}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="font-bold uppercase tracking-wider text-emerald-400 block text-[11px]">
                    Remediation Strategy
                  </span>
                  <p className="rounded-xl bg-slate-950 p-3 text-slate-300 leading-relaxed border border-slate-800">
                    {explanation.recommendation}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 space-y-2">
                <Shield className="mx-auto h-8 w-8 text-indigo-400/50" />
                <p className="text-xs text-white font-semibold">Deep AI Analysis Available</p>
                <p className="text-[11px] text-slate-400">
                  Click &quot;Explain Finding&quot; to unpack root cause, attack vector, and recommended defensive strategies.
                </p>
              </div>
            )}
          </div>

          {/* Verification Protocol Info Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
              <FlaskConical className="h-4 w-4 text-emerald-400" />
              Empirical Verification Policy
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              DefenderAI never auto-applies AI patches to your source code. Every patch is verified in an isolated,
              ephemeral sandbox copy and re-scanned to ensure 0 remaining vulnerabilities before you approve.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
