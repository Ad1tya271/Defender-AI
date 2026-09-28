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
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white shadow-sm">
      {/* Brand Logo */}
      <div className="flex h-16 items-center border-b border-gray-200 px-6">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white shadow-sm group-hover:bg-indigo-600 transition">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-gray-900 block leading-tight">
              DefenderAI
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 block">
              Security Platform
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-6">
        <div>
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">
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
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-indigo-400" : "text-gray-500"}`} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            System
          </p>
          <Link
            href="/settings"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              pathname === "/settings"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Settings className={`h-4 w-4 ${pathname === "/settings" ? "text-indigo-400" : "text-gray-500"}`} />
            Settings & Diagnostics
          </Link>
        </div>
      </nav>

      {/* Bottom Profile & Logout */}
      <div className="border-t border-gray-200 p-3 space-y-2">
        <div className="flex items-center justify-between rounded-lg bg-gray-50 p-2.5 border border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              DA
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-900 leading-none">Security Analyst</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Local Workstation</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Log out of DefenderAI"
            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}