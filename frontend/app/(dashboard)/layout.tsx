"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isTokenExpired, handleSessionExpired } from "@/lib/api";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    function verifySession() {
      if (typeof window === "undefined") return;

      const token = localStorage.getItem("access_token");
      if (!token || isTokenExpired(token)) {
        setIsAuthenticated(false);
        handleSessionExpired();
        router.replace("/login?expired=true");
        return;
      }

      setIsAuthenticated(true);
      setVerifying(false);
    }

    // Verify immediately on mount and route change
    verifySession();

    // Check periodically every 15 seconds for token expiration
    const interval = setInterval(() => {
      const token = localStorage.getItem("access_token");
      if (!token || isTokenExpired(token)) {
        setIsAuthenticated(false);
        handleSessionExpired();
        router.replace("/login?expired=true");
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [router, pathname]);

  if (verifying && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex items-center gap-2 text-sm">
          <div className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <span>Verifying security session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}