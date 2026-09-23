"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getProjects } from "@/lib/api";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [scanStatus, setScanStatus] = useState<
    "idle" | "starting"
  >("idle");

  useEffect(() => {
    async function loadProject() {
      try {
        setLoading(true);
        setError("");

        // Get project ID directly from the URL
        const parts = pathname.split("/").filter(Boolean);
        const projectId = parts[parts.length - 1];

        console.log("Current pathname:", pathname);
        console.log("Project ID:", projectId);

        if (!projectId || projectId === "projects") {
          setError("Project ID is missing");
          return;
        }

        const token = localStorage.getItem("access_token");

        if (!token) {
          setError("You are not authenticated. Please sign in again.");
          return;
        }

        const projects = await getProjects(token);

        console.log("Projects from API:", projects);

        const foundProject = projects.find(
          (item: Project) => item.id === projectId
        );

        if (!foundProject) {
          setError("Project not found");
          return;
        }

        setProject(foundProject);
      } catch (err) {
        console.error("Failed to load project:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load project"
        );
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [pathname]);

  function handleStartScan() {
    setScanStatus("starting");

    /*
      The real scan API will be connected in the next step.

      We intentionally do not make a fake API request here.
      The backend scan endpoint will be created next.
    */

    setTimeout(() => {
      setScanStatus("idle");
      alert("Scan engine will be connected in the next step.");
    }, 500);
  }

  return (
    <div className="space-y-6">

      {/* Back Button */}
      <button
        onClick={() => router.push("/projects")}
        className="text-sm text-gray-500 transition hover:text-gray-900"
      >
        ← Back to Projects
      </button>

      {/* Loading State */}
      {loading && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <p className="text-gray-500">
            Loading project...
          </p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-700">
            Unable to load project
          </h2>

          <p className="mt-2 text-sm text-red-600">
            {error}
          </p>
        </div>
      )}

      {/* Project */}
      {!loading && !error && project && (
        <div className="space-y-6">

          {/* Project Header */}
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">

            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">

              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  {project.name}
                </h1>

                <p className="mt-2 max-w-2xl text-gray-500">
                  {project.description}
                </p>
              </div>

              {/* Start Scan Button */}
              <button
                onClick={handleStartScan}
                disabled={scanStatus === "starting"}
                className="shrink-0 rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {scanStatus === "starting"
                  ? "Preparing Scan..."
                  : "Start Security Scan"}
              </button>

            </div>

            {/* Project Information */}
            <div className="mt-8 grid gap-4 md:grid-cols-2">

              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-500">
                  Project ID
                </p>

                <p className="mt-1 break-all font-mono text-sm text-gray-900">
                  {project.id}
                </p>
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-500">
                  Created
                </p>

                <p className="mt-1 text-sm text-gray-900">
                  {new Date(
                    project.created_at
                  ).toLocaleDateString()}
                </p>
              </div>

            </div>
          </div>

          {/* Security Overview */}
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">

            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Security Analysis
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Monitor vulnerabilities, security findings,
                and AI-powered analysis for this project.
              </p>
            </div>

            {/* Security Statistics */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

              {/* Security Score */}
              <div className="rounded-lg border border-gray-200 p-5">
                <p className="text-sm text-gray-500">
                  Security Score
                </p>

                <p className="mt-2 text-3xl font-bold text-gray-900">
                  --
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  No scan available
                </p>
              </div>

              {/* Critical */}
              <div className="rounded-lg border border-gray-200 p-5">
                <p className="text-sm text-gray-500">
                  Critical
                </p>

                <p className="mt-2 text-3xl font-bold text-red-600">
                  0
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  Vulnerabilities
                </p>
              </div>

              {/* High */}
              <div className="rounded-lg border border-gray-200 p-5">
                <p className="text-sm text-gray-500">
                  High
                </p>

                <p className="mt-2 text-3xl font-bold text-orange-500">
                  0
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  Vulnerabilities
                </p>
              </div>

              {/* Total */}
              <div className="rounded-lg border border-gray-200 p-5">
                <p className="text-sm text-gray-500">
                  Total Findings
                </p>

                <p className="mt-2 text-3xl font-bold text-gray-900">
                  0
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  Awaiting first scan
                </p>
              </div>

            </div>
          </div>

          {/* Scan Types */}
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">

            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Security Scans
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                DefenderAI will analyze your project using
                multiple security checks.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">

              {/* Dependency Scan */}
              <div className="rounded-lg border border-gray-200 p-5">

                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  #
                </div>

                <h3 className="mt-4 font-semibold text-gray-900">
                  Dependency Scan
                </h3>

                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Detect vulnerable third-party packages
                  and outdated dependencies.
                </p>

              </div>

              {/* Secret Scan */}
              <div className="rounded-lg border border-gray-200 p-5">

                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                  !
                </div>

                <h3 className="mt-4 font-semibold text-gray-900">
                  Secret Detection
                </h3>

                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Identify exposed API keys, passwords,
                  tokens, and other secrets.
                </p>

              </div>

              {/* AI Analysis */}
              <div className="rounded-lg border border-gray-200 p-5">

                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  AI
                </div>

                <h3 className="mt-4 font-semibold text-gray-900">
                  AI Security Analysis
                </h3>

                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Use AI to explain vulnerabilities and
                  generate remediation recommendations.
                </p>

              </div>

            </div>
          </div>

          {/* Scan History */}
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">

            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Scan History
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Previous security scans for this project
                will appear here.
              </p>
            </div>

            <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">

              <p className="font-medium text-gray-700">
                No scans yet
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Start your first security scan to analyze
                this project.
              </p>

              <button
                onClick={handleStartScan}
                disabled={scanStatus === "starting"}
                className="mt-5 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {scanStatus === "starting"
                  ? "Preparing..."
                  : "Start First Scan"}
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}