"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast, Toaster } from "sonner";
import { useNotificationStore } from "../hooks/useNotificationStore";
import { notificationIcon } from "../lib/notificationIcons";
import type { Notification } from "../notifications";

const TOAST_POSITION_KEY = "toast-position";
const TOAST_DURATION_KEY = "toast-duration";

export type ToastPosition = "top-left" | "top-right" | "top-center" | "bottom-left" | "bottom-right" | "bottom-center";

const DEFAULT_POSITION: ToastPosition = "bottom-right";
const DEFAULT_DURATION = 5;

export function getToastPosition(): ToastPosition {
  if (typeof window === "undefined") return DEFAULT_POSITION;
  const v = localStorage.getItem(TOAST_POSITION_KEY);
  const valid: ToastPosition[] = ["top-left", "top-right", "top-center", "bottom-left", "bottom-right", "bottom-center"];
  return valid.includes(v as ToastPosition) ? (v as ToastPosition) : DEFAULT_POSITION;
}

export function setToastPosition(pos: ToastPosition) {
  localStorage.setItem(TOAST_POSITION_KEY, pos);
}

export function getToastDuration(): number {
  if (typeof window === "undefined") return DEFAULT_DURATION;
  const v = Number(localStorage.getItem(TOAST_DURATION_KEY));
  return v > 0 && v <= 60 ? v : DEFAULT_DURATION;
}

export function setToastDuration(sec: number) {
  localStorage.setItem(TOAST_DURATION_KEY, String(sec));
}

// Color class → inline hex for sonner (Tailwind classes don't apply inside sonner toasts)
const colorMap: Record<string, string> = {
  "text-emerald-400": "#34d399",
  "text-red-400": "#f87171",
  "text-zinc-400": "#a1a1aa",
  "text-amber-400": "#fbbf24",
};

type NotificationContextValue = ReturnType<typeof useNotificationStore> & {
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  toastPosition: ToastPosition;
  toastDuration: number;
  updateToastPosition: (pos: ToastPosition) => void;
  updateToastDuration: (sec: number) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [panelOpen, setPanelOpen] = useState(false);
  const [toastPosition, _setToastPosition] = useState<ToastPosition>(DEFAULT_POSITION);
  const [toastDuration, _setToastDuration] = useState(DEFAULT_DURATION);

  // Load persisted settings on mount
  useEffect(() => {
    _setToastPosition(getToastPosition());
    _setToastDuration(getToastDuration());
  }, []);

  const updateToastPosition = useCallback((pos: ToastPosition) => {
    setToastPosition(pos);
    _setToastPosition(pos);
  }, []);

  const updateToastDuration = useCallback((sec: number) => {
    setToastDuration(sec);
    _setToastDuration(sec);
  }, []);

  const handleInsert = useCallback((n: Notification) => {
    const { icon, color } = notificationIcon(n.type);
    const hex = colorMap[color] ?? "#a1a1aa";
    const duration = getToastDuration() * 1000;

    toast.custom(
      (id) => (
        <div
          onClick={() => {
            toast.dismiss(id);
            if (n.link) router.push(n.link);
          }}
          style={{ cursor: n.link ? "pointer" : "default" }}
          className="flex items-start gap-3 w-[356px] rounded-lg border border-white/[0.08] bg-zinc-900/95 backdrop-blur-xl px-4 py-3 shadow-2xl shadow-black/40"
        >
          <div className="mt-0.5 shrink-0" style={{ color: hex }}>{icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-zinc-100 truncate">{n.title}</p>
            {n.body && (
              <p className="text-[12px] text-zinc-400 mt-0.5 line-clamp-2">{n.body}</p>
            )}
          </div>
        </div>
      ),
      { duration },
    );
  }, [router]);

  const store = useNotificationStore(handleInsert);

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  const value = useMemo(
    () => ({ ...store, panelOpen, openPanel, closePanel, toastPosition, toastDuration, updateToastPosition, updateToastDuration }),
    [store, panelOpen, openPanel, closePanel, toastPosition, toastDuration, updateToastPosition, updateToastDuration],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Toaster
        position={toastPosition}
        toastOptions={{ unstyled: true }}
        gap={8}
      />
    </NotificationContext.Provider>
  );
}

export function useNotificationContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationContext must be used within NotificationProvider");
  return ctx;
}
