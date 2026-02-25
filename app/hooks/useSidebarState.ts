"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const COLLAPSED_KEY = "sidebar-collapsed";
const WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 256;
const COLLAPSED_WIDTH = 56;
const MIN_WIDTH = 180;
const MAX_WIDTH = 480;

export function useSidebarState() {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedWidth, setExpandedWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Sync from localStorage after mount to avoid SSR hydration mismatch
  useEffect(() => {
    const storedCollapsed = localStorage.getItem(COLLAPSED_KEY) === "true";
    setCollapsed(storedCollapsed);

    const storedWidth = localStorage.getItem(WIDTH_KEY);
    if (storedWidth) {
      const parsed = parseInt(storedWidth, 10);
      if (Number.isFinite(parsed)) {
        setExpandedWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed)));
      }
    }
    setHydrated(true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  // ── Drag resize ──────────────────────────────────────────────────────────

  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const onDragMove = useCallback((e: MouseEvent) => {
    const delta = e.clientX - dragStartX.current;
    const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, dragStartWidth.current + delta));
    setExpandedWidth(newWidth);
  }, []);

  const onDragEnd = useCallback(() => {
    setIsDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    setExpandedWidth((w) => {
      localStorage.setItem(WIDTH_KEY, String(w));
      return w;
    });
  }, []);

  // Attach/detach mousemove/mouseup on drag state change
  useEffect(() => {
    if (!isDragging) return;

    const move = (e: MouseEvent) => onDragMove(e);
    const up = () => onDragEnd();

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      // Clean up body styles if component unmounts mid-drag
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, onDragMove, onDragEnd]);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartX.current = e.clientX;
      dragStartWidth.current = expandedWidth;
      setIsDragging(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [expandedWidth],
  );

  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : expandedWidth;

  return {
    collapsed,
    toggle,
    sidebarWidth,
    expandedWidth,
    isDragging,
    onDragStart,
    hydrated,
  } as const;
}
