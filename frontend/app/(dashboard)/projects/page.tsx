"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createProject, getProjects } from "@/lib/api";

type Project = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
};

export default function ProjectsPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreateForm, setShowCreateForm] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function loadProjects() {
    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("access_token");

      if (!token) {
        throw new Error("You are not logged in");
      }

      const data = await getProjects(token);
      setProjects(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load projects"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function handleCreateProject(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!name.trim()) {
      setError("Project name is required");
      return;
    }

    try {
      setCreating(true);
      setError("");

      const token = localStorage.getItem("access_token");

      if (!token) {
        throw new Error("You are not logged in");
      }

      await createProject(token, name, description);

      setName("");
      setDescription("");
      setShowCreateForm(false);

      await loadProjects();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create project"
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Projects
          </h1>

          <p className="mt-1 text-gray-500">
            Manage your security projects.
          </p>
        </div>

        <button
          onClick={() => {
            setShowCreateForm(true);
            setError("");
          }}
          className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          + New Project
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Create Project Form */}
      {showCreateForm && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-gray-900">
              Create New Project
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Add a project to your DefenderAI workspace.
            </p>
          </div>

          <form
            onSubmit={handleCreateProject}
            className="space-y-5"
          >
            {/* Project Name */}
            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Project Name
              </label>

              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My Web Application"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="description"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Description
              </label>

              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your project..."
                rows={4}
                className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Form Buttons */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setName("");
                  setDescription("");
                  setError("");
                }}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Project"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Projects */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Your Projects
          </h2>

          <span className="text-sm text-gray-500">
            {projects.length}{" "}
            {projects.length === 1 ? "project" : "projects"}
          </span>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          /* Empty State */
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900">
              No projects yet
            </h3>

            <p className="mt-2 text-sm text-gray-500">
              Create your first security project to get started.
            </p>

            <button
              onClick={() => setShowCreateForm(true)}
              className="mt-5 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              Create Project
            </button>
          </div>
        ) : (
          /* Project Cards */
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() =>
                  router.push(`/projects/${project.id}`)
                }
                className="cursor-pointer rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <h3 className="text-lg font-semibold text-gray-900">
                  {project.name}
                </h3>

                <p className="mt-2 min-h-[48px] text-sm leading-6 text-gray-500">
                  {project.description ||
                    "No description provided."}
                </p>

                <div className="mt-5 border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-400">
                    Created{" "}
                    {new Date(
                      project.created_at
                    ).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}