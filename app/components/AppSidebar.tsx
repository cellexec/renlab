"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProjectContext } from "./ProjectContext";
import { ProjectDropdown } from "./ProjectDropdown";
import { useSidebarState } from "../hooks/useSidebarState";

const projectNavItems = [
  {
    label: "Dashboard",
    href: "/",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      </svg>
    ),
  },
  {
    label: "Specifications",
    href: "/specifications",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    action: {
      href: "/specifications/new",
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      ),
    },
  },
  {
    label: "Knowledge",
    href: "/knowledge",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
  {
    label: "Dev Server",
    href: "/dev-server",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    label: "Pipelines",
    href: "/pipelines",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

const globalNavItems = [
  {
    label: "Usage",
    href: "/usage",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    label: "Agents",
    href: "/agents",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.59.659H9.06a2.25 2.25 0 01-1.59-.659L5 14.5m14 0V17a2 2 0 01-2 2H7a2 2 0 01-2-2v-2.5" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/settings",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

// ── Tooltip wrapper for collapsed nav icons ─────────────────────────────────

let tooltipIdCounter = 0;

function NavTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const tooltipId = useRef(`nav-tooltip-${++tooltipIdCounter}`);

  const onEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
    }
    setShow(true);
  };

  return (
    <div ref={ref} onMouseEnter={onEnter} onMouseLeave={() => setShow(false)} className="relative" aria-describedby={show ? tooltipId.current : undefined}>
      {children}
      {show && (
        <div
          id={tooltipId.current}
          role="tooltip"
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 shadow-lg border border-white/[0.08]"
          style={{ top: pos.top, left: pos.left }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

// ── Brand header ────────────────────────────────────────────────────────────

function BrandHeader({ collapsed }: { collapsed: boolean }) {
  const [infoHover, setInfoHover] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`relative flex items-center gap-2 py-3 border-b border-white/[0.06] ${collapsed ? "justify-center px-0" : "px-1"}`}>
      <div className="shrink-0 overflow-hidden rounded-xl h-12 w-12 flex items-center justify-center">
        <Image
          src="/renlab_logo.png"
          alt="RenLab"
          width={72}
          height={72}
          className="h-[72px] w-[72px] object-cover"
        />
      </div>
      {!collapsed && (
        <>
          <span className="text-sm font-semibold text-zinc-100 tracking-tight">
            RenLab
          </span>
          <div
            ref={infoRef}
            className="relative"
            onMouseEnter={() => setInfoHover(true)}
            onMouseLeave={() => setInfoHover(false)}
          >
            <div className="p-1 rounded-md text-zinc-600 hover:text-zinc-400 transition-colors cursor-default">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            </div>
            {infoHover && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-52 backdrop-blur-xl bg-zinc-900/95 border border-white/[0.08] rounded-xl p-3.5 shadow-xl shadow-black/40">
                <p className="text-[13px] font-semibold text-zinc-100 mb-1.5">
                  Ren <span className="text-zinc-500 font-normal">(</span><span className="text-violet-400">&#x70BC;</span><span className="text-zinc-500 font-normal">)</span>
                </p>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Chinese for <span className="text-zinc-300">to refine, to forge</span>. Specs go in, polished code comes out &mdash; refined through AI-powered review loops.
                </p>
              </div>
            )}
          </div>
          <button
            className="ml-auto p-1 rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04] transition-colors"
            title="Notifications"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const pathname = usePathname();
  const { projects, activeProject, setActiveProjectId, deleteProject } = useProjectContext();
  const { collapsed, toggle, sidebarWidth, isDragging, onDragStart, hydrated } = useSidebarState();

  const renderNavItem = (
    item: { label: string; href: string; icon: React.ReactNode; action?: { href: string; icon: React.ReactNode } },
    active: boolean,
  ) => {
    const link = (
      <Link
        href={item.href}
        className={`flex items-center rounded-md px-2.5 py-2 text-sm transition-colors ${
          collapsed ? "justify-center" : "gap-3 min-w-0 flex-1"
        } ${
          active
            ? "bg-white/[0.06] text-zinc-100"
            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
        }`}
      >
        {item.icon}
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );

    if (collapsed) {
      return (
        <NavTooltip key={item.href} label={item.label}>
          {link}
        </NavTooltip>
      );
    }

    if (item.action) {
      return (
        <div key={item.href} className="flex items-center">
          {link}
          <Link
            href={item.action.href}
            className="shrink-0 ml-0.5 p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
          >
            {item.action.icon}
          </Link>
        </div>
      );
    }

    return <div key={item.href}>{link}</div>;
  };

  return (
    <aside
      className={`relative flex shrink-0 flex-col border-r border-white/[0.06] bg-zinc-950 overflow-hidden ${
        isDragging ? "" : "transition-[width] duration-200 ease-in-out"
      }`}
      style={{ width: sidebarWidth, visibility: hydrated ? "visible" : "hidden" }}
    >
      <BrandHeader collapsed={collapsed} />

      <div className="py-3 border-b border-white/[0.06]">
        <ProjectDropdown
          projects={projects}
          activeProject={activeProject}
          onSelect={setActiveProjectId}
          onDelete={deleteProject}
          collapsed={collapsed}
        />
      </div>

      <nav className={`flex flex-1 flex-col ${collapsed ? "px-1.5" : "px-3"}`}>
        {activeProject && (
          <>
            {!collapsed && (
              <p className="mt-3 mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                Project
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {projectNavItems.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return renderNavItem(item, active);
              })}
            </div>

            <div className="my-3 border-t border-white/[0.06]" />
          </>
        )}

        {!collapsed && (
          <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
            Global
          </p>
        )}
        <div className="flex flex-col gap-0.5">
          {globalNavItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return renderNavItem(item, active);
          })}
        </div>
      </nav>

      {/* Toggle button */}
      <div className={`border-t border-white/[0.06] ${collapsed ? "px-1.5" : "px-3"} py-3`}>
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`flex w-full items-center rounded-md px-2.5 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 ${
            collapsed ? "justify-center" : "gap-3"
          }`}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {collapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            )}
          </svg>
          {!collapsed && <span className="truncate">Collapse</span>}
        </button>
      </div>

      {/* Drag handle (expanded only) */}
      {!collapsed && (
        <div
          role="separator"
          aria-label="Resize sidebar"
          onMouseDown={onDragStart}
          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-violet-500/20 transition-colors"
        />
      )}
    </aside>
  );
}
