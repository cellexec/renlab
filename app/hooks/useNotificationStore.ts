"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getSupabase } from "../lib/supabase";
import type { Notification, NotificationMetadata } from "../notifications";

const UNREAD_COUNT_KEY = "notification-unread-count";

function toNotification(row: Record<string, unknown>): Notification {
  const meta = (row.metadata ?? {}) as Partial<NotificationMetadata>;
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? null,
    projectId: (row.project_id as string) ?? null,
    type: row.type as Notification["type"],
    title: row.title as string,
    body: (row.body as string) ?? null,
    link: (row.link as string) ?? null,
    isRead: row.is_read as boolean,
    createdAt: row.created_at as string,
    metadata: meta,
  };
}

export function useNotificationStore(onInsert?: (n: Notification) => void) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Keep onInsert ref stable across renders
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;

  // Ref for optimistic rollback — always has latest notifications
  const notificationsRef = useRef<Notification[]>(notifications);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // Derived unread count
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  // Persist unread count to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(UNREAD_COUNT_KEY, String(unreadCount));
  }, [unreadCount]);

  // Initial load + realtime subscription
  useEffect(() => {
    let sb: ReturnType<typeof getSupabase>;
    try {
      sb = getSupabase();
    } catch {
      // Supabase not configured — skip notification loading
      setLoaded(true);
      return;
    }

    sb.from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setNotifications(data ? data.map(toNotification) : []);
        setLoaded(true);
      });

    const channel = sb
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const n = toNotification(payload.new);
          setNotifications((prev) => [n, ...prev]);
          onInsertRef.current?.(n);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        (payload) => {
          const updated = toNotification(payload.new);
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n)),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications" },
        (payload) => {
          const id = (payload.old as { id: string }).id;
          setNotifications((prev) => prev.filter((n) => n.id !== id));
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    const { error } = await getSupabase()
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);
    if (error) {
      // Rollback
      setNotifications(notificationsRef.current);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const prev = notificationsRef.current;
    setNotifications((cur) => cur.map((n) => ({ ...n, isRead: true })));
    const unreadIds = prev.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const { error } = await getSupabase()
      .from("notifications")
      .update({ is_read: true })
      .in("id", unreadIds);
    if (error) {
      setNotifications(prev);
    }
  }, []);

  const dismiss = useCallback(async (id: string) => {
    const prev = notificationsRef.current;
    setNotifications((cur) => cur.filter((n) => n.id !== id));
    const { error } = await getSupabase()
      .from("notifications")
      .delete()
      .eq("id", id);
    if (error) {
      setNotifications(prev);
    }
  }, []);

  const dismissAll = useCallback(async () => {
    const prev = notificationsRef.current;
    const ids = prev.map((n) => n.id);
    if (ids.length === 0) return;
    setNotifications([]);
    const { error } = await getSupabase()
      .from("notifications")
      .delete()
      .in("id", ids);
    if (error) {
      setNotifications(prev);
    }
  }, []);

  return {
    notifications,
    loaded,
    unreadCount,
    markRead,
    markAllRead,
    dismiss,
    dismissAll,
  };
}
