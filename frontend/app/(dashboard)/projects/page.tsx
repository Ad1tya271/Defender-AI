"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FolderKanban, Plus, ArrowRight, Calendar, AlertCircle } from "lucide-react";
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
        if (!cancelled) {
          setProjects(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load projects"
          );
        }
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

  async function loadProjectsAfterCreate() {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      const data = await getProjects(token);
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    }
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
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
        router.replace("/login");
        return;
      }

      await createProject(token, name.trim(), description.trim());
      setName("");
      setDescription("");
      setShowCreateForm(false);
      await loadProjectsAfterCreate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Security Projects
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage your monitored codebases, repositories, and automated security scans.
          </p>
        </div>

        <button
          onClick={() => {
            setShowCreateForm(true);
            setError("");
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 transition"
        >
          <Plus className="h-4 w-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs sm:text-sm text-rose-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Create Project Modal / Card */}
      {showCreateForm && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl backdrop-blur-xl animate-fade-in">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-white">Create New Project</h2>
            <p className="mt-1 text-xs text-slate-400">
              Add a codebase or microservice repository to your workspace for triage.
            </p>
          </div>

          <form onSubmit={handleCreateProject} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Project Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. backend-api-service"
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Description (Optional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Core backend authentication and payment handling services..."
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setName("");
                  setDescription("");
                  setError("");
                }}
                className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition"
              >
                {creating ? "Creating..." : "Create Project"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Projects Grid */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">All Monitored Projects</h2>
          <span className="text-xs text-slate-400 font-mono">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </span>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400 text-sm">
            <div className="mx-auto h-6 w-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-3" />
            Loading project workspace...
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
            <FolderKanban className="mx-auto h-12 w-12 text-slate-600 mb-3" />
            <h3 className="text-base font-bold text-white">No projects yet</h3>
            <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
              Create your first project to upload code archives, run Semgrep/Trivy scans, and view AI-validated fixes.
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Create First Project
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => router.push(`/projects/${project.id}`)}
                className="group cursor-pointer rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm hover:border-indigo-500/50 hover:bg-slate-900/90 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600/15 border border-indigo-500/30 text-indigo-400 group-hover:scale-105 transition-transform">
                      <FolderKanban className="h-4.5 w-4.5" />
                    </div>
                    <span className="rounded-full bg-slate-800 p-1.5 text-slate-400 group-hover:bg-indigo-600/20 group-hover:text-indigo-300 transition">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>

                  <h3 className="mt-3 font-bold text-white group-hover:text-indigo-400 transition truncate">
                    {project.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {project.description || "No description provided."}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(project.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-indigo-400 font-semibold group-hover:underline">
                    Open Console &rarr;
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}