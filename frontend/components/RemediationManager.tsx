"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FlaskConical,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import DiffViewer from "./DiffViewer";
import {
  applyRemediation,
  approveRemediation,
  createRemediationProposal,
  getFindingProposals,
  rejectRemediation,
  rollbackRemediation,
  verifyRemediation,
  type RemediationProposal,
  type RemediationSuggestion,
  type VerificationResult,
} from "@/lib/api";

interface RemediationManagerProps {
  findingId: string;
  projectId: string;
  findingTitle: string;
  filePath?: string | null;
  suggestedRemediation?: RemediationSuggestion | null;
}

export default function RemediationManager({
  findingId,
  filePath,
  suggestedRemediation,
}: RemediationManagerProps) {
  const [proposals, setProposals] = useState<RemediationProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const loadProposals = useCallback(async () => {
    if (!token || !findingId) return;
    try {
      setLoading(true);
      const data = await getFindingProposals(token, findingId);
      setProposals(data);
    } catch (err) {
      console.error("Failed to load remediation proposals:", err);
    } finally {
      setLoading(false);
    }
  }, [token, findingId]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  const handleSaveAsProposal = async () => {
    if (!token || !suggestedRemediation) return;
    try {
      setActionLoading("save");
      setFeedbackMessage(null);
      await createRemediationProposal(token, findingId, {
        explanation: suggestedRemediation.explanation,
        patch: suggestedRemediation.patch,
        target_file: filePath || undefined,
      });
      setFeedbackMessage({
        type: "success",
        text: "Proposal saved to review pipeline!",
      });
      await loadProposals();
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save proposal",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerify = async (proposalId: string) => {
    if (!token) return;
    try {
      setActionLoading(`verify-${proposalId}`);
      setFeedbackMessage(null);
      const result = await verifyRemediation(token, proposalId);
      setFeedbackMessage({
        type: result.status === "verified_fixed" ? "success" : "error",
        text: `Sandbox Verification: ${result.details || (result.status === "verified_fixed" ? "Verified fixed (0 remaining)" : result.status)}`,
      });
      await loadProposals();
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Verification runner failed",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (proposalId: string) => {
    if (!token) return;
    try {
      setActionLoading(`approve-${proposalId}`);
      setFeedbackMessage(null);
      await approveRemediation(token, proposalId);
      setFeedbackMessage({
        type: "success",
        text: "Proposal approved for codebase application!",
      });
      await loadProposals();
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to approve proposal",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (proposalId: string) => {
    if (!token) return;
    try {
      setActionLoading(`reject-${proposalId}`);
      setFeedbackMessage(null);
      await rejectRemediation(token, proposalId);
      setFeedbackMessage({
        type: "info",
        text: "Proposal marked as rejected.",
      });
      await loadProposals();
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to reject proposal",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApply = async (proposalId: string) => {
    if (!token) return;
    try {
      setActionLoading(`apply-${proposalId}`);
      setFeedbackMessage(null);
      await applyRemediation(token, proposalId);
      setFeedbackMessage({
        type: "success",
        text: "Patch applied securely! Snapshot backup saved to .defender_backup",
      });
      await loadProposals();
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to apply patch",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRollback = async (proposalId: string) => {
    if (!token) return;
    try {
      setActionLoading(`rollback-${proposalId}`);
      setFeedbackMessage(null);
      await rollbackRemediation(token, proposalId);
      setFeedbackMessage({
        type: "info",
        text: "Rollback successful! File restored from snapshot backup.",
      });
      await loadProposals();
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to rollback patch",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "proposed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/60 px-2.5 py-0.5 text-xs font-semibold text-amber-300 border border-amber-500/30">
            <Clock className="h-3 w-3" /> Under Review
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-950/60 px-2.5 py-0.5 text-xs font-semibold text-indigo-300 border border-indigo-500/30">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-400 border border-slate-700">
            <XCircle className="h-3 w-3" /> Rejected
          </span>
        );
      case "applied":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
            <ShieldCheck className="h-3 w-3" /> Applied to Codebase
          </span>
        );
      default:
        return null;
    }
  };

  const getVerificationBadge = (result?: VerificationResult) => {
    if (!result) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-400 border border-slate-700">
          <FlaskConical className="h-3 w-3 text-slate-500" /> Not verified yet
        </span>
      );
    }
    switch (result.status) {
      case "verified_fixed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Verified Fixed (0 remaining)
          </span>
        );
      case "still_vulnerable":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-950/60 px-2.5 py-0.5 text-xs font-semibold text-rose-300 border border-rose-500/30">
            <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
            Still Vulnerable
          </span>
        );
      case "new_findings_introduced":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/60 px-2.5 py-0.5 text-xs font-semibold text-amber-300 border border-amber-500/30">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            Regression ({result.new_findings_count} new)
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-950/60 px-2.5 py-0.5 text-xs font-semibold text-rose-300 border border-rose-500/30">
            <XCircle className="h-3.5 w-3.5 text-rose-400" />
            Verification Failed
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 pt-4 border-t border-slate-800">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            Remediation & Patch Pipeline
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Review diffs, run isolated scanner verifications, and apply approved fixes.
          </p>
        </div>
      </div>

      {/* Global feedback message toast */}
      {feedbackMessage && (
        <div
          className={`rounded-xl p-3 text-xs font-medium flex items-center gap-2 ${
            feedbackMessage.type === "success"
              ? "bg-emerald-950/50 text-emerald-300 border border-emerald-500/30"
              : feedbackMessage.type === "error"
              ? "bg-rose-950/50 text-rose-300 border border-rose-500/30"
              : "bg-indigo-950/50 text-indigo-300 border border-indigo-500/30"
          }`}
        >
          {feedbackMessage.type === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
          {feedbackMessage.type === "error" && <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />}
          {feedbackMessage.type === "info" && <RotateCcw className="h-4 w-4 text-indigo-400 shrink-0" />}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* AI Suggestion Promotion Card */}
      {suggestedRemediation && proposals.length === 0 && (
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-5 shadow-xl space-y-4 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              AI Generated Fix Proposal
            </span>
            <button
              onClick={handleSaveAsProposal}
              disabled={actionLoading === "save"}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 disabled:opacity-50 transition"
            >
              {actionLoading === "save" ? "Saving..." : "Save as Formal Proposal"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{suggestedRemediation.explanation}</p>
          <DiffViewer patch={suggestedRemediation.patch} targetFile={filePath} />
        </div>
      )}

      {/* Existing Proposals Pipeline */}
      {loading ? (
        <p className="text-xs text-slate-500 italic">Loading remediation proposals...</p>
      ) : proposals.length === 0 && !suggestedRemediation ? (
        <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center">
          <p className="text-xs text-slate-400">
            No remediation proposals yet. Click &quot;Generate AI Fix&quot; above to create a candidate patch.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal) => {
            const latestVerification = proposal.verifications?.[0];
            const isVerifiedFixed = latestVerification?.status === "verified_fixed";
            const canApply = proposal.status === "approved" && isVerifiedFixed;

            return (
              <div
                key={proposal.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-md space-y-4"
              >
                {/* Header & Status */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {getStatusBadge(proposal.status)}
                    {getVerificationBadge(latestVerification)}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {new Date(proposal.created_at).toLocaleString()}
                  </span>
                </div>

                {/* Explanation */}
                <p className="text-xs text-slate-300 leading-relaxed">{proposal.explanation}</p>

                {/* Diff Viewer */}
                <DiffViewer
                  patch={proposal.patch}
                  targetFile={proposal.target_file || filePath}
                />

                {/* Action Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                  {/* Left: Verification button */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleVerify(proposal.id)}
                      disabled={actionLoading === `verify-${proposal.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-50 transition"
                      title="Run isolated re-scan in ephemeral sandbox"
                    >
                      <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
                      {actionLoading === `verify-${proposal.id}`
                        ? "Verifying in Sandbox..."
                        : "Verify Patch in Sandbox"}
                    </button>
                  </div>

                  {/* Right: Approval & Apply actions */}
                  <div className="flex items-center gap-2">
                    {proposal.status === "proposed" && (
                      <>
                        <button
                          onClick={() => handleApprove(proposal.id)}
                          disabled={actionLoading === `approve-${proposal.id}`}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition"
                        >
                          <ThumbsUp className="h-3 w-3 text-indigo-400" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(proposal.id)}
                          disabled={actionLoading === `reject-${proposal.id}`}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition"
                        >
                          <ThumbsDown className="h-3 w-3 text-rose-400" />
                          Reject
                        </button>
                      </>
                    )}

                    {proposal.status !== "applied" ? (
                      <button
                        onClick={() => handleApply(proposal.id)}
                        disabled={!canApply || actionLoading === `apply-${proposal.id}`}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition ${
                          canApply
                            ? "bg-emerald-600 hover:bg-emerald-500 cursor-pointer shadow-emerald-600/30"
                            : "bg-slate-800 cursor-not-allowed text-slate-500 border border-slate-700"
                        }`}
                        title={
                          !isVerifiedFixed
                            ? "Patch must be verified as fixed before applying"
                            : proposal.status !== "approved"
                            ? "Proposal must be approved first"
                            : "Apply patch to codebase with backup"
                        }
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {actionLoading === `apply-${proposal.id}` ? "Applying..." : "Apply to Codebase"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRollback(proposal.id)}
                        disabled={actionLoading === `rollback-${proposal.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-950/40 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-900/50 disabled:opacity-50 transition"
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
                        {actionLoading === `rollback-${proposal.id}` ? "Rolling back..." : "Rollback Patch"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
