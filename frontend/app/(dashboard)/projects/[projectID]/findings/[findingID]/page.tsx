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
  ExternalLink,
  FileCode,
  FlaskConical,
  Info,
  RefreshCw,
  Shield,
  ShieldAlert,
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
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800 border border-rose-200">
            <AlertOctagon className="h-3.5 w-3.5 text-rose-600" /> Critical Severity
          </span>
        );
      case "high":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800 border border-orange-200">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-600" /> High Severity
          </span>
        );
      case "medium":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-200">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" /> Medium Severity
          </span>
        );
      case "low":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 border border-blue-200">
            <Shield className="h-3.5 w-3.5 text-blue-600" /> Low Severity
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 border border-slate-200">
            <Info className="h-3.5 w-3.5 text-slate-500" /> Informational
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-sm font-medium text-gray-500">Loading comprehensive vulnerability analysis...</p>
      </div>
    );
  }

  if (error || !finding) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto mt-12">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center space-y-3">
          <AlertOctagon className="mx-auto h-8 w-8 text-rose-600" />
          <h2 className="text-lg font-bold text-rose-900">Finding Not Found or Unauthorized</h2>
          <p className="text-xs text-rose-700">{error || "The requested vulnerability finding does not exist."}</p>
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition"
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
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Link href="/dashboard" className="hover:text-indigo-600 transition">
            Dashboard
          </Link>
          <span>/</span>
          <Link href="/projects" className="hover:text-indigo-600 transition">
            Projects
          </Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="hover:text-indigo-600 font-medium text-gray-700 transition">
            {project?.name || "Project"}
          </Link>
          <span>/</span>
          <span className="font-semibold text-gray-900 truncate max-w-xs">{finding.rule_id || "Finding"}</span>
        </div>

        {/* Previous / Next Triage Buttons */}
        {allScanFindings.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-medium">
              Finding {currentIndex + 1} of {allScanFindings.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => prevFinding && router.push(`/projects/${projectId}/findings/${prevFinding.id}`)}
                disabled={!prevFinding}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title={prevFinding?.title || "Previous finding"}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <button
                onClick={() => nextFinding && router.push(`/projects/${projectId}/findings/${nextFinding.id}`)}
                disabled={!nextFinding}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title={nextFinding?.title || "Next finding"}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Vulnerability Header Banner */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {getSeverityBadge(finding.severity)}
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white uppercase tracking-wider">
              <Terminal className="h-3 w-3" />
              {finding.scanner === "semgrep" ? "Semgrep SAST" : "Trivy SCA"}
            </span>
            {finding.rule_id && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-mono font-medium text-slate-700 border border-slate-200">
                {finding.rule_id}
              </span>
            )}
          </div>

          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-indigo-600 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Project
          </Link>
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 leading-snug">
          {finding.title}
        </h1>

        {/* Location & Metadata Bar */}
        <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-gray-100 text-xs text-gray-600">
          {finding.file_path && (
            <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 font-mono">
              <FileCode className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
              <span className="font-semibold text-gray-800">{finding.file_path}</span>
              {finding.start_line && (
                <span className="text-indigo-600 font-bold ml-1">
                  Line {finding.start_line}
                  {finding.end_line && finding.end_line !== finding.start_line ? `-${finding.end_line}` : ""}
                </span>
              )}
              <button
                onClick={handleCopyPath}
                className="ml-2 text-gray-400 hover:text-gray-700"
                title="Copy relative file path"
              >
                {copiedPath ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}

          <span className="text-gray-400">
            Detected: <strong>{new Date(finding.created_at).toLocaleString()}</strong>
          </span>
        </div>
      </div>

      {/* Main Analysis Grid */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left 2 Cols: Code Context & Remediation Hub */}
        <div className="space-y-8 lg:col-span-2">
          {/* 1. Code Snippet Context Window */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Code2 className="h-4 w-4 text-indigo-600" />
                Vulnerable Code Context
              </h3>
              {finding.start_line && (
                <span className="text-xs text-indigo-600 font-mono font-semibold">
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
              <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">
                Code context could not be extracted directly from disk.
              </div>
            )}

            {/* Finding Description / Taxonomy */}
            {finding.description && (
              <div className="space-y-1 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Scanner Advisory</h4>
                <div className="rounded-lg bg-gray-50 p-4 text-xs text-gray-700 leading-relaxed border border-gray-100 whitespace-pre-wrap">
                  {finding.description}
                </div>
              </div>
            )}
          </div>

          {/* 2. Interactive Remediation & Verification Sandbox Hub */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <FlaskConical className="h-5 w-5 text-emerald-600" />
                  Verified Remediation Sandbox
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Generate fixes, inspect unified diffs, run isolated sandbox re-scans, and safely apply patches.
                </p>
              </div>

              {!remediation && (
                <button
                  onClick={handleSuggestFix}
                  disabled={loadingRemediate}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition"
                >
                  <Sparkles className={`h-4 w-4 ${loadingRemediate ? "animate-spin" : ""}`} />
                  {loadingRemediate ? "Generating AI Fix..." : "Generate AI Fix"}
                </button>
              )}
            </div>

            {remediateError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
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
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-b from-indigo-50/50 via-white to-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
              <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                AI Security Intelligence
              </h3>
              {!explanation && (
                <button
                  onClick={handleExplain}
                  disabled={loadingExplain}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition"
                >
                  <Sparkles className={`h-3 w-3 ${loadingExplain ? "animate-spin" : ""}`} />
                  {loadingExplain ? "Analyzing..." : "Explain Finding"}
                </button>
              )}
            </div>

            {explainError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {explainError}
              </div>
            )}

            {explanation ? (
              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <span className="font-bold uppercase tracking-wider text-indigo-900 block text-[11px]">
                    Technical Root Cause
                  </span>
                  <p className="rounded-lg bg-white p-3 text-gray-700 leading-relaxed border border-indigo-100 shadow-xs">
                    {explanation.root_cause}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="font-bold uppercase tracking-wider text-rose-900 block text-[11px]">
                    Attack Vector & Exploitation
                  </span>
                  <p className="rounded-lg bg-white p-3 text-gray-700 leading-relaxed border border-rose-100 shadow-xs">
                    {explanation.attack_vector}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="font-bold uppercase tracking-wider text-amber-900 block text-[11px]">
                    Potential Security Impact
                  </span>
                  <p className="rounded-lg bg-white p-3 text-gray-700 leading-relaxed border border-amber-100 shadow-xs">
                    {explanation.impact}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="font-bold uppercase tracking-wider text-emerald-900 block text-[11px]">
                    Remediation Strategy
                  </span>
                  <p className="rounded-lg bg-white p-3 text-gray-700 leading-relaxed border border-emerald-100 shadow-xs">
                    {explanation.recommendation}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 space-y-2">
                <Shield className="mx-auto h-8 w-8 text-indigo-300" />
                <p className="text-xs text-indigo-900 font-semibold">Deep AI Analysis Available</p>
                <p className="text-[11px] text-gray-500">
                  Click &quot;Explain Finding&quot; to unpack root cause, attack vector, and recommended defensive strategies.
                </p>
              </div>
            )}
          </div>

          {/* Verification Protocol Info Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 flex items-center gap-1.5">
              <FlaskConical className="h-4 w-4 text-emerald-600" />
              Empirical Verification Policy
            </h4>
            <p className="text-xs text-gray-600 leading-relaxed">
              DefenderAI never auto-applies AI patches to your source code. Every patch is verified in an isolated,
              ephemeral sandbox copy and re-scanned to ensure 0 remaining vulnerabilities before you approve.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
