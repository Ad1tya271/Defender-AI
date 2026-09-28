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
      const res: VerificationResult = await verifyRemediation(token, proposalId);
      if (res.status === "verified_fixed") {
        setFeedbackMessage({
          type: "success",
          text: "Verification SUCCESS: Vulnerability resolved with zero regressions!",
        });
      } else if (res.status === "still_vulnerable") {
        setFeedbackMessage({
          type: "error",
          text: "Verification WARNING: Scanner still detected the vulnerability after patch.",
        });
      } else if (res.status === "new_findings_introduced") {
        setFeedbackMessage({
          type: "error",
          text: `Verification REGRESSION: Patch introduced ${res.new_findings_count} new security finding(s)!`,
        });
      } else {
        setFeedbackMessage({
          type: "error",
          text: "Verification failed to complete or patch could not be applied.",
        });
      }
      await loadProposals();
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Verification execution failed",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (proposalId: string) => {
    if (!token) return;
    try {
      setActionLoading(`approve-${proposalId}`);
      await approveRemediation(token, proposalId);
      setFeedbackMessage({ type: "success", text: "Proposal approved." });
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
      await rejectRemediation(token, proposalId);
      setFeedbackMessage({ type: "info", text: "Proposal rejected." });
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
      const res = await applyRemediation(token, proposalId);
      setFeedbackMessage({
        type: "success",
        text: `Patch applied successfully! Safety backup created for ${res.modified_files.length} file(s).`,
      });
      await loadProposals();
    } catch (err) {
      setFeedbackMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to apply patch to source",
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
        text: "Patch safely rolled back! Original source file restored from backup.",
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
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            <Clock className="h-3 w-3" /> Under Review
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
            <XCircle className="h-3 w-3" /> Rejected
          </span>
        );
      case "applied":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
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
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          <FlaskConical className="h-3 w-3 text-slate-400" /> Not verified yet
        </span>
      );
    }
    switch (result.status) {
      case "verified_fixed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Verified Fixed (0 remaining)
          </span>
        );
      case "still_vulnerable":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
            <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
            Still Vulnerable
          </span>
        );
      case "new_findings_introduced":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            Regression ({result.new_findings_count} new)
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
            <XCircle className="h-3.5 w-3.5 text-red-600" />
            Verification Failed
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 pt-4 border-t border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            Remediation & Patch Pipeline
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Review diffs, run isolated scanner verifications, and apply approved fixes.
          </p>
        </div>
      </div>

      {/* Global feedback message toast */}
      {feedbackMessage && (
        <div
          className={`rounded-lg p-3 text-xs font-medium flex items-center gap-2 ${
            feedbackMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : feedbackMessage.type === "error"
              ? "bg-rose-50 text-rose-800 border border-rose-200"
              : "bg-blue-50 text-blue-800 border border-blue-200"
          }`}
        >
          {feedbackMessage.type === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
          {feedbackMessage.type === "error" && <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />}
          {feedbackMessage.type === "info" && <RotateCcw className="h-4 w-4 text-blue-600 shrink-0" />}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* AI Suggestion Promotion Card (if available and not yet saved as proposal) */}
      {suggestedRemediation && proposals.length === 0 && (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-b from-indigo-50/50 to-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
              AI Generated Fix Proposal
            </span>
            <button
              onClick={handleSaveAsProposal}
              disabled={actionLoading === "save"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition"
            >
              {actionLoading === "save" ? "Saving..." : "Save as Formal Proposal"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-gray-600">{suggestedRemediation.explanation}</p>
          <DiffViewer patch={suggestedRemediation.patch} targetFile={filePath} />
        </div>
      )}

      {/* Existing Proposals Pipeline */}
      {loading ? (
        <p className="text-xs text-gray-400 italic">Loading remediation proposals...</p>
      ) : proposals.length === 0 && !suggestedRemediation ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
          <p className="text-xs text-gray-500">
            No remediation proposals yet. Click &quot;Suggest Fix&quot; above to generate an AI patch.
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
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3"
              >
                {/* Header & Status */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(proposal.status)}
                    {getVerificationBadge(latestVerification)}
                  </div>
                  <span className="text-[11px] text-gray-400 font-mono">
                    {new Date(proposal.created_at).toLocaleString()}
                  </span>
                </div>

                {/* Explanation */}
                <p className="text-xs text-gray-700">{proposal.explanation}</p>

                {/* Diff Viewer */}
                <DiffViewer
                  patch={proposal.patch}
                  targetFile={proposal.target_file || filePath}
                />

                {/* Action Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                  {/* Left: Verification button */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleVerify(proposal.id)}
                      disabled={actionLoading === `verify-${proposal.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 transition"
                      title="Run isolated re-scan in ephemeral sandbox"
                    >
                      <FlaskConical className="h-3.5 w-3.5 text-emerald-600" />
                      {actionLoading === `verify-${proposal.id}`
                        ? "Verifying in Sandbox..."
                        : "Verify Patch"}
                    </button>
                  </div>

                  {/* Right: Approval & Apply actions */}
                  <div className="flex items-center gap-2">
                    {proposal.status === "proposed" && (
                      <>
                        <button
                          onClick={() => handleApprove(proposal.id)}
                          disabled={actionLoading === `approve-${proposal.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <ThumbsUp className="h-3 w-3 text-blue-600" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(proposal.id)}
                          disabled={actionLoading === `reject-${proposal.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <ThumbsDown className="h-3 w-3 text-rose-600" />
                          Reject
                        </button>
                      </>
                    )}

                    {proposal.status !== "applied" ? (
                      <button
                        onClick={() => handleApply(proposal.id)}
                        disabled={!canApply || actionLoading === `apply-${proposal.id}`}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition ${
                          canApply
                            ? "bg-emerald-600 hover:bg-emerald-500 cursor-pointer"
                            : "bg-gray-300 cursor-not-allowed text-gray-500"
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
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition"
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-amber-700" />
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
