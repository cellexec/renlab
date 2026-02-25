"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function SessionsPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`h-full bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full overflow-auto">
        <div className="max-w-full px-6 py-6">
          {/* Breadcrumb + header */}
          <div className="mb-6 animate-fade-in-up stagger-1">
            <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
              <span className="hover:text-zinc-300 cursor-pointer transition-colors">Home</span>
              <span>/</span>
              <span className="text-zinc-300">Sessions</span>
            </div>
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Sessions</h1>
          </div>

          <div className="flex flex-col items-center justify-center py-20 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
            <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-12 text-center">
              <svg className="h-12 w-12 text-zinc-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <h2 className="text-lg font-semibold text-zinc-200 mt-4">Sessions</h2>
              <p className="mt-2 text-[13px] text-zinc-500">
                Dedicated session browser is coming soon.
              </p>
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 mt-6 px-4 py-2 text-[13px] font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors duration-200"
              >
                View sessions in Chat
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
