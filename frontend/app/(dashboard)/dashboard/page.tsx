"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProjects } from "@/lib/api";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      const token = localStorage.getItem("access_token");

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const data = await getProjects(token);

        if (cancelled) {
          return;
        }

        setProjects(data);
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load projects"
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProjects();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Dashboard
        </h1>

        <p className="mt-2 text-gray-500">
          Monitor your project&apos;s security posture.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-xl border bg-white p-6">
          <p className="text-gray-500">
            Loading projects...
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-red-600">
            {error}
          </p>
        </div>
      )}

      {/* No projects */}
      {!loading && !error && projects.length === 0 && (
        <div className="rounded-xl border bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            No projects yet
          </h2>

          <p className="mt-2 text-gray-500">
            Create your first project to start security analysis.
          </p>
        </div>
      )}

      {/* Projects */}
      {!loading && !error && projects.length > 0 && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Your Projects
            </h2>

            <p className="text-sm text-gray-500">
              {projects.length} project
              {projects.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="rounded-xl border bg-white p-6 shadow-sm"
              >
                <h3 className="text-lg font-semibold text-gray-900">
                  {project.name}
                </h3>

                <p className="mt-2 text-sm text-gray-500">
                  {project.description}
                </p>

                <div className="mt-4 text-xs text-gray-400">
                  Created{" "}
                  {new Date(
                    project.created_at
                  ).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}