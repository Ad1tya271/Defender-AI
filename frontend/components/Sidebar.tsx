"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  ShieldCheck,
  Settings,
  LogOut,
  Shield,
  ExternalLink,
} from "lucide-react";

const navigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Projects",
    href: "/projects",
    icon: FolderKanban,
  },
  {
    name: "Scans",
    href: "/scans",
    icon: ShieldCheck,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      router.push("/login");
    }
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-800/80 bg-slate-950/95 backdrop-blur-md sticky top-0 shrink-0">
      {/* Brand Logo */}
      <div className="flex h-16 items-center border-b border-slate-800/80 px-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-400 p-0.5 shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
            <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
              <Shield className="h-4.5 w-4.5 text-indigo-400" />
            </div>
          </div>
          <div>
            <span className="text-base font-extrabold tracking-tight text-white block leading-tight">
              DefenderAI
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400 block">
              Sovereign AppSec
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-6 overflow-y-auto">
        <div>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Workspace
          </p>

          <div className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-indigo-600/20 text-white border border-indigo-500/30 shadow-xs shadow-indigo-500/10"
                      : "text-slate-400 hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-indigo-400" : "text-slate-500"}`} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            System & Diagnostics
          </p>
          <Link
            href="/settings"
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              pathname === "/settings"
                ? "bg-indigo-600/20 text-white border border-indigo-500/30 shadow-xs shadow-indigo-500/10"
                : "text-slate-400 hover:bg-slate-900 hover:text-white"
            }`}
          >
            <Settings className={`h-4 w-4 ${pathname === "/settings" ? "text-indigo-400" : "text-slate-500"}`} />
            Diagnostics & Health
          </Link>
        </div>
      </nav>

      {/* Bottom Profile & Logout */}
      <div className="border-t border-slate-800/80 p-3 space-y-2 bg-slate-950">
        <div className="flex items-center justify-between rounded-xl bg-slate-900/70 p-2.5 border border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white shadow-xs">
              DA
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white leading-none truncate">Security Analyst</p>
              <p className="text-[10px] text-slate-400 mt-1 truncate">Local Workstation</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Log out of DefenderAI"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}