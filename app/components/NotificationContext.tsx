"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { useNotificationStore } from "../hooks/useNotificationStore";

type NotificationContextValue = ReturnType<typeof useNotificationStore> & {
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const store = useNotificationStore();
  const [panelOpen, setPanelOpen] = useState(false);

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  return (
    <NotificationContext.Provider value={{ ...store, panelOpen, openPanel, closePanel }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationContext must be used within NotificationProvider");
  return ctx;
}
