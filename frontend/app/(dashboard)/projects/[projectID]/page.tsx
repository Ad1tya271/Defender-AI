"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  createScan,
  getProjects,
  getScans,
  getFindings,
  getFinding,
  uploadProject,
  explainFinding,
  remediateFinding,
  type Scan,
  type ScannerType,
  type Finding,
  type FindingDetail,
  type FindingExplanation,
  type RemediationSuggestion,
} from "@/lib/api";

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

  const [selectedScanner, setSelectedScanner] =
    useState<ScannerType>("all");

  const [startingScan, setStartingScan] = useState(false);

  // =========================
  // Upload state
  // =========================

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  // =========================
  // Findings state
  // =========================

  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFinding, setSelectedFinding] =
    useState<FindingDetail | null>(null);

  const [loadingFindings, setLoadingFindings] = useState(false);
  const [loadingFindingDetail, setLoadingFindingDetail] =
    useState(false);

  const [findingError, setFindingError] = useState("");

  // =========================
  // AI: Explain / Remediate state
  // =========================

  const [explanation, setExplanation] =
    useState<FindingExplanation | null>(null);
  const [loadingExplanation, setLoadingExplanation] =
    useState(false);
  const [explainError, setExplainError] = useState("");

  const [remediation, setRemediation] =
    useState<RemediationSuggestion | null>(null);
  const [loadingRemediation, setLoadingRemediation] =
    useState(false);
  const [remediateError, setRemediateError] = useState("");

  // Get project ID from URL
  const projectId =
    pathname.split("/").filter(Boolean).pop() || "";

  // =========================
  // Load project
  // =========================

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

        if (cancelled) {
          return;
        }

        const foundProject = projects.find(
          (item: Project) => item.id === projectId
        );

        if (!foundProject) {
          setError("Project not found");
          return;
        }

        setProject(foundProject);
        setError("");
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error("Failed to load project:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load project"
        );
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

  // =========================
  // Load scans
  // =========================

  useEffect(() => {
    let cancelled = false;

    async function loadScans() {
      if (!projectId || projectId === "projects") {
        if (!cancelled) {
          setLoadingScans(false);
        }
        return;
      }

      const token = localStorage.getItem("access_token");

      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const data = await getScans(token, projectId);

        if (cancelled) {
          return;
        }

        setScans(data);
        setScanError("");
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error("Failed to load scans:", err);

        setScanError(
          err instanceof Error
            ? err.message
            : "Failed to load scans"
        );
      } finally {
        if (!cancelled) {
          setLoadingScans(false);
        }
      }
    }

    loadScans();

    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  // =========================
  // Upload project source
  // =========================

  async function handleUpload() {
    if (!uploadFile || !projectId || projectId === "projects") {
      return;
    }

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

      setUploadSuccess(
        "Upload successful. You can now run a scan."
      );
      setUploadFile(null);
    } catch (err) {
      console.error("Failed to upload project:", err);

      setUploadError(
        err instanceof Error
          ? err.message
          : "Failed to upload project"
      );
    } finally {
      setUploading(false);
    }
  }

  // =========================
  // Start scan
  // =========================

  async function handleStartScan() {
    if (!projectId || projectId === "projects") {
      return;
    }

    try {
      setStartingScan(true);
      setScanError("");

      const token = localStorage.getItem("access_token");

      if (!token) {
        router.push("/login");
        return;
      }

      await createScan(
        token,
        projectId,
        selectedScanner
      );

      const updatedScans = await getScans(
        token,
        projectId
      );

      setScans(updatedScans);
      setLoadingScans(false);

      // Clear previously opened finding
      setSelectedScan(null);
      setFindings([]);
      setSelectedFinding(null);
      setFindingError("");
    } catch (err) {
      console.error("Failed to start scan:", err);

      setScanError(
        err instanceof Error
          ? err.message
          : "Failed to start scan"
      );
    } finally {
      setStartingScan(false);
    }
  }

  // =========================
  // Load findings for a scan
  // =========================

  async function handleViewFindings(scan: Scan) {
    if (scan.status !== "completed") {
      return;
    }

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

      const data = await getFindings(
        token,
        scan.id
      );

      setFindings(data);
    } catch (err) {
      console.error("Failed to load findings:", err);

      setFindingError(
        err instanceof Error
          ? err.message
          : "Failed to load findings"
      );
    } finally {
      setLoadingFindings(false);
    }
  }

  // =========================
  // Load finding details
  // =========================

  async function handleViewFinding(
    finding: Finding
  ) {
    const token = localStorage.getItem("access_token");

    if (!token) {
      router.push("/login");
      return;
    }

    // Reset AI panels whenever a different finding is selected
    setExplanation(null);
    setExplainError("");
    setRemediation(null);
    setRemediateError("");

    try {
      setLoadingFindingDetail(true);
      setFindingError("");

      const detail = await getFinding(
        token,
        finding.id
      );

      setSelectedFinding(detail);
    } catch (err) {
      console.error(
        "Failed to load finding details:",
        err
      );

      setFindingError(
        err instanceof Error
          ? err.message
          : "Failed to load finding details"
      );
    } finally {
      setLoadingFindingDetail(false);
    }
  }

  // =========================
  // AI: Explain finding
  // =========================

  async function handleExplainFinding() {
    if (!selectedFinding) {
      return;
    }

    try {
      setLoadingExplanation(true);
      setExplainError("");

      const token = localStorage.getItem("access_token");

      if (!token) {
        router.push("/login");
        return;
      }

      const result = await explainFinding(
        token,
        selectedFinding.id
      );

      setExplanation(result);
    } catch (err) {
      console.error("Failed to explain finding:", err);

      setExplainError(
        err instanceof Error
          ? err.message
          : "Failed to get AI explanation"
      );
    } finally {
      setLoadingExplanation(false);
    }
  }

  // =========================
  // AI: Suggest fix
  // =========================

  async function handleSuggestFix() {
    if (!selectedFinding) {
      return;
    }

    try {
      setLoadingRemediation(true);
      setRemediateError("");

      const token = localStorage.getItem("access_token");

      if (!token) {
        router.push("/login");
        return;
      }

      const result = await remediateFinding(
        token,
        selectedFinding.id
      );

      setRemediation(result);
    } catch (err) {
      console.error("Failed to generate remediation:", err);

      setRemediateError(
        err instanceof Error
          ? err.message
          : "Failed to generate AI remediation"
      );
    } finally {
      setLoadingRemediation(false);
    }
  }

  // =========================
  // Helpers
  // =========================

  function getScoreLabel(
    score: number | null | undefined
  ) {
    if (score === null || score === undefined) {
      return "Not scanned";
    }

    if (score >= 80) {
      return "Good";
    }

    if (score >= 50) {
      return "Needs attention";
    }

    return "At risk";
  }

  function getStatusClass(status: string) {
    switch (status.toLowerCase()) {
      case "completed":
        return "bg-green-50 text-green-700";

      case "running":
        return "bg-blue-50 text-blue-700";

      case "failed":
        return "bg-red-50 text-red-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  function getSeverityClass(count: number) {
    return count > 0
      ? "text-red-600"
      : "text-gray-400";
  }

  function getFindingSeverityClass(
    severity: string
  ) {
    switch (severity.toLowerCase()) {
      case "critical":
        return "bg-red-100 text-red-700";

      case "high":
        return "bg-orange-100 text-orange-700";

      case "medium":
        return "bg-yellow-100 text-yellow-700";

      case "low":
        return "bg-blue-100 text-blue-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  const latestScan =
    scans.length > 0 ? scans[0] : null;

  // =========================
  // Loading
  // =========================

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8">
        <p className="text-gray-500">
          Loading project...
        </p>
      </div>
    );
  }

  // =========================
  // Error
  // =========================

  if (error || !project) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.push("/projects")}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← Back to Projects
        </button>

        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-700">
            Unable to load project
          </h2>

          <p className="mt-2 text-sm text-red-600">
            {error || "Project not found"}
          </p>
        </div>
      </div>
    );
  }

  // =========================
  // Main UI
  // =========================

  return (
    <div className="space-y-8">

      {/* Back */}
      <button
        onClick={() => router.push("/projects")}
        className="text-sm text-gray-500 transition hover:text-gray-900"
      >
        ← Back to Projects
      </button>

      {/* Project Header */}
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {project.name}
          </h1>

          <p className="mt-2 max-w-2xl text-gray-500">
            {project.description ||
              "No description provided."}
          </p>
        </div>

        <div className="text-sm text-gray-400">
          Created{" "}
          {new Date(
            project.created_at
          ).toLocaleDateString()}
        </div>
      </div>

      {/* Upload Source */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">

          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Project Source
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Upload a .zip archive of the source code to scan.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">

            <input
              type="file"
              accept=".zip"
              onChange={(event) =>
                setUploadFile(
                  event.target.files?.[0] ?? null
                )
              }
              disabled={uploading}
              className="block text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
            />

            <button
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>

          </div>
        </div>

        {uploadSuccess && (
          <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-green-700">
              {uploadSuccess}
            </p>
          </div>
        )}

        {uploadError && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">
              {uploadError}
            </p>
          </div>
        )}
      </div>

      {/* Scan Controls */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">

          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Security Scan
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Run security analysis against this project.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">

            <div>
              <label
                htmlFor="scanner"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Scanner
              </label>

              <select
                id="scanner"
                value={selectedScanner}
                onChange={(event) =>
                  setSelectedScanner(
                    event.target.value as ScannerType
                  )
                }
                disabled={startingScan}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">
                  All scanners
                </option>

                <option value="semgrep">
                  Semgrep
                </option>

                <option value="trivy">
                  Trivy
                </option>
              </select>
            </div>

            <button
              onClick={handleStartScan}
              disabled={startingScan}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {startingScan
                ? "Running scan..."
                : "Start Scan"}
            </button>

          </div>
        </div>

        {startingScan && (
          <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-700">
              Security scan is running...
            </p>

            <p className="mt-1 text-xs text-blue-600">
              Semgrep and/or Trivy may take a few moments
              to complete.
            </p>
          </div>
        )}

        {scanError && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">
              {scanError}
            </p>
          </div>
        )}
      </div>

      {/* Latest Security Result */}
      <div>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Security Overview
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Latest security analysis for this project.
          </p>
        </div>

        {!latestScan ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <h3 className="text-lg font-semibold text-gray-900">
              No scans yet
            </h3>

            <p className="mt-2 text-sm text-gray-500">
              Run your first security scan to see
              vulnerabilities and security score.
            </p>
          </div>
        ) : (
          <div className="space-y-5">

            {/* Score */}
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
                <p className="text-sm text-gray-500">
                  Security Score
                </p>

                <div className="mt-3 flex items-end gap-3">
                  <span className="text-5xl font-bold text-gray-900">
                    {latestScan.security_score ?? "—"}
                  </span>

                  {latestScan.security_score !== null &&
                    latestScan.security_score !==
                      undefined && (
                      <span className="mb-2 text-sm text-gray-500">
                        / 100
                      </span>
                    )}
                </div>

                <p className="mt-2 text-sm text-gray-500">
                  {getScoreLabel(
                    latestScan.security_score
                  )}
                </p>
              </div>

              {/* Critical */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
                  Critical
                </p>

                <p
                  className={`mt-3 text-3xl font-bold ${getSeverityClass(
                    latestScan.critical_count
                  )}`}
                >
                  {latestScan.critical_count}
                </p>
              </div>

              {/* High */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
                  High
                </p>

                <p
                  className={`mt-3 text-3xl font-bold ${getSeverityClass(
                    latestScan.high_count
                  )}`}
                >
                  {latestScan.high_count}
                </p>
              </div>

              {/* Total */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
                  Total Findings
                </p>

                <p className="mt-3 text-3xl font-bold text-gray-900">
                  {latestScan.total_findings}
                </p>
              </div>
            </div>

            {/* Medium / Low */}
            <div className="grid gap-5 md:grid-cols-2">

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
                  Medium
                </p>

                <p
                  className={`mt-3 text-3xl font-bold ${getSeverityClass(
                    latestScan.medium_count
                  )}`}
                >
                  {latestScan.medium_count}
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">
                  Low
                </p>

                <p
                  className={`mt-3 text-3xl font-bold ${getSeverityClass(
                    latestScan.low_count
                  )}`}
                >
                  {latestScan.low_count}
                </p>
              </div>

            </div>

            {/* Summary */}
            {latestScan.summary && (
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-gray-700">
                  Scan Summary
                </p>

                <p className="mt-2 text-sm leading-6 text-gray-500">
                  {latestScan.summary}
                </p>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Scan History */}
      <div>
        <div className="mb-4 flex items-center justify-between">

          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Scan History
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Previous security scans for this project.
            </p>
          </div>

          <span className="text-sm text-gray-500">
            {scans.length}{" "}
            {scans.length === 1 ? "scan" : "scans"}
          </span>

        </div>

        {loadingScans ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            Loading scans...
          </div>
        ) : scans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm text-gray-500">
              No scan history available.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">

                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-5 py-4 font-medium text-gray-600">
                      Scanner
                    </th>

                    <th className="px-5 py-4 font-medium text-gray-600">
                      Status
                    </th>

                    <th className="px-5 py-4 font-medium text-gray-600">
                      Score
                    </th>

                    <th className="px-5 py-4 font-medium text-gray-600">
                      Findings
                    </th>

                    <th className="px-5 py-4 font-medium text-gray-600">
                      Date
                    </th>

                    <th className="px-5 py-4 font-medium text-gray-600">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">

                  {scans.map((scan) => (
                    <tr
                      key={scan.id}
                      className="transition hover:bg-gray-50"
                    >

                      <td className="px-5 py-4">
                        <span className="font-medium text-gray-900">
                          {scan.scanner || "Unknown"}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClass(
                            scan.status
                          )}`}
                        >
                          {scan.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 font-medium text-gray-900">
                        {scan.security_score ?? "—"}
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {scan.total_findings}
                      </td>

                      <td className="px-5 py-4 text-gray-500">
                        {new Date(
                          scan.created_at
                        ).toLocaleString()}
                      </td>

                      <td className="px-5 py-4">
                        {scan.status === "completed" &&
                        scan.total_findings > 0 ? (
                          <button
                            onClick={() =>
                              handleViewFindings(scan)
                            }
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50"
                          >
                            View Findings
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">
                            No findings
                          </span>
                        )}
                      </td>

                    </tr>
                  ))}

                </tbody>

              </table>
            </div>

          </div>
        )}
      </div>

      {/* Findings Section */}
      {selectedScan && (
        <div className="space-y-5">

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Findings
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Findings from the{" "}
                {selectedScan.scanner || "selected"} scan.
              </p>
            </div>

            <button
              onClick={() => {
                setSelectedScan(null);
                setFindings([]);
                setSelectedFinding(null);
                setFindingError("");
              }}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              Close
            </button>
          </div>

          {findingError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">
                {findingError}
              </p>
            </div>
          )}

          {loadingFindings ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
              Loading findings...
            </div>
          ) : findings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
              <p className="text-sm text-gray-500">
                No findings found for this scan.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">

              {/* Finding list */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">

                <div className="border-b border-gray-200 px-5 py-4">
                  <h3 className="font-semibold text-gray-900">
                    Security Findings
                  </h3>

                  <p className="mt-1 text-xs text-gray-500">
                    {findings.length} finding
                    {findings.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="divide-y divide-gray-100">

                  {findings.map((finding) => (
                    <button
                      key={finding.id}
                      onClick={() =>
                        handleViewFinding(finding)
                      }
                      className={`w-full px-5 py-4 text-left transition hover:bg-gray-50 ${
                        selectedFinding?.id === finding.id
                          ? "bg-gray-50"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">

                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">
                            {finding.title}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            {finding.scanner}
                            {finding.file_path
                              ? ` • ${finding.file_path}`
                              : ""}
                            {finding.start_line
                              ? ` • Line ${finding.start_line}`
                              : ""}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${getFindingSeverityClass(
                            finding.severity
                          )}`}
                        >
                          {finding.severity}
                        </span>

                      </div>
                    </button>
                  ))}

                </div>
              </div>

              {/* Finding Details */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">

                <div className="border-b border-gray-200 px-5 py-4">
                  <h3 className="font-semibold text-gray-900">
                    Finding Details
                  </h3>
                </div>

                {!selectedFinding ? (
                  <div className="p-8 text-center">
                    <p className="text-sm text-gray-500">
                      Select a finding to view its details.
                    </p>
                  </div>
                ) : loadingFindingDetail ? (
                  <div className="p-8 text-center">
                    <p className="text-sm text-gray-500">
                      Loading finding details...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6 p-5">

                    {/* Title */}
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h4 className="text-lg font-semibold text-gray-900">
                          {selectedFinding.title}
                        </h4>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${getFindingSeverityClass(
                            selectedFinding.severity
                          )}`}
                        >
                          {selectedFinding.severity}
                        </span>
                      </div>
                    </div>

                    {/* AI Actions */}
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={handleExplainFinding}
                        disabled={loadingExplanation}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loadingExplanation
                          ? "Analyzing..."
                          : "Explain with AI"}
                      </button>

                      <button
                        onClick={handleSuggestFix}
                        disabled={loadingRemediation}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loadingRemediation
                          ? "Generating fix..."
                          : "Suggest Fix"}
                      </button>
                    </div>

                    {loadingExplanation && (
                      <p className="text-xs text-gray-500">
                        The local AI model is analyzing this
                        finding — this can take up to a few
                        minutes on the first run.
                      </p>
                    )}

                    {explainError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                        <p className="text-sm text-red-700">
                          {explainError}
                        </p>
                      </div>
                    )}

                    {loadingRemediation && (
                      <p className="text-xs text-gray-500">
                        The local AI model is generating and
                        validating a fix — this can take a
                        few minutes.
                      </p>
                    )}

                    {remediateError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                        <p className="text-sm text-red-700">
                          {remediateError}
                        </p>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="grid gap-4 sm:grid-cols-2">

                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                          Scanner
                        </p>

                        <p className="mt-1 text-sm text-gray-900">
                          {selectedFinding.scanner}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                          Rule ID
                        </p>

                        <p className="mt-1 break-all text-sm text-gray-900">
                          {selectedFinding.rule_id ||
                            "Not provided"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                          File
                        </p>

                        <p className="mt-1 break-all text-sm text-gray-900">
                          {selectedFinding.file_path ||
                            "Not provided"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                          Line
                        </p>

                        <p className="mt-1 text-sm text-gray-900">
                          {selectedFinding.start_line
                            ? selectedFinding.end_line &&
                              selectedFinding.end_line !==
                                selectedFinding.start_line
                              ? `${selectedFinding.start_line}-${selectedFinding.end_line}`
                              : selectedFinding.start_line
                            : "Not provided"}
                        </p>
                      </div>

                    </div>

                    {/* Description */}
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        Description
                      </p>

                      <p className="mt-2 text-sm leading-6 text-gray-600">
                        {selectedFinding.description ||
                          "No description provided."}
                      </p>
                    </div>

                    {/* Code Snippet */}
                    {selectedFinding.code_snippet && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                          Code Snippet
                        </p>

                        <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-950 p-4 text-xs leading-6 text-gray-100">
                          <code>
                            {selectedFinding.code_snippet}
                          </code>
                        </pre>
                      </div>
                    )}

                    {/* AI Explanation */}
                    {explanation && (
                      <div className="space-y-4 rounded-lg border border-indigo-200 bg-indigo-50 p-5">
                        <p className="text-sm font-semibold text-indigo-900">
                          AI Explanation
                        </p>

                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-indigo-400">
                            Root Cause
                          </p>
                          <p className="mt-1 text-sm text-indigo-900">
                            {explanation.root_cause}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-indigo-400">
                            Attack Vector
                          </p>
                          <p className="mt-1 text-sm text-indigo-900">
                            {explanation.attack_vector}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-indigo-400">
                            Impact
                          </p>
                          <p className="mt-1 text-sm text-indigo-900">
                            {explanation.impact}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-indigo-400">
                            Recommendation
                          </p>
                          <p className="mt-1 text-sm text-indigo-900">
                            {explanation.recommendation}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* AI Remediation */}
                    {remediation && (
                      <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-5">
                        <p className="text-sm font-semibold text-emerald-900">
                          AI Suggested Fix
                        </p>

                        <p className="text-sm text-emerald-900">
                          {remediation.explanation}
                        </p>

                        {remediation.patch ? (
                          <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-950 p-4 text-xs leading-6 text-gray-100">
                            <code>{remediation.patch}</code>
                          </pre>
                        ) : (
                          <p className="text-xs italic text-emerald-700">
                            No patch was provided — this
                            suggestion requires manual review.
                          </p>
                        )}

                        <p className="text-xs text-emerald-700">
                          This patch is AI-generated and has
                          not been applied. Review it carefully
                          before making any changes yourself.
                        </p>
                      </div>
                    )}

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