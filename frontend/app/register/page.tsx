"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RegisterRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login?tab=register");
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
      <div className="flex items-center gap-2 text-sm">
        <div className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <span>Redirecting to registration...</span>
      </div>
    </div>
  );
}
