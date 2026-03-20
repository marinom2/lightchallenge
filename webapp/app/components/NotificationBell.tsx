"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
};

const POLL_MS = 60_000;

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

function notifHref(n: NotificationItem): string {
  const cid = n.data?.challengeId as string | undefined;
  if (!cid) return "/me/challenges";
  if (n.type === "proof_window_open" || n.type === "challenge_final_push") {
    return `/proofs/${cid}`;
  }
  return `/challenge/${cid}`;
}

export default function NotificationBell() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Fetch full list
  const fetchNotifications = useCallback(async () => {
    if (!isConnected || !address) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/notifications?wallet=${encodeURIComponent(address)}&limit=20`
      );
      if (res.ok) {
        const data = await res.json();
        setItems(data.data ?? []);
        setUnread(data.unread ?? 0);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [address, isConnected]);

  // Poll unread count
  useEffect(() => {
    if (!isConnected || !address) {
      setUnread(0);
      setItems([]);
      return;
    }
    // Initial fetch of count
    fetch(`/api/v1/notifications?wallet=${encodeURIComponent(address)}&limit=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setUnread(d.unread ?? 0); })
      .catch(() => {});

    const interval = setInterval(() => {
      fetch(`/api/v1/notifications?wallet=${encodeURIComponent(address)}&limit=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setUnread(d.unread ?? 0); })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [address, isConnected]);

  // Fetch full list when panel opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  const markRead = useCallback(
    async (id: string) => {
      if (!address) return;
      fetch(`/api/v1/notifications/${id}/read`, {
        method: "POST",
        headers: { "x-lc-address": address },
      }).catch(() => {});
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnread((prev) => Math.max(0, prev - 1));
    },
    [address]
  );

  const markAllRead = useCallback(async () => {
    if (!address) return;
    fetch("/api/v1/notifications/read-all", {
      method: "POST",
      headers: { "x-lc-address": address },
    }).catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }, [address]);

  const handleItemClick = useCallback(
    (n: NotificationItem) => {
      if (!n.read) markRead(n.id);
      setOpen(false);
      router.push(notifHref(n));
    },
    [markRead, router]
  );

  if (!isConnected) return null;

  return (
    <div className="notif-bell" ref={ref}>
      <button
        type="button"
        className="notif-bell__trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      >
        <Bell size={16} strokeWidth={1.8} />
        {unread > 0 && (
          <span className="notif-bell__badge">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="notif-bell__dropdown"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {/* Header */}
            <div className="notif-bell__header">
              <span className="notif-bell__title">Notifications</span>
              {unread > 0 && (
                <button
                  type="button"
                  className="notif-bell__mark-all"
                  onClick={markAllRead}
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="notif-bell__list">
              {loading && items.length === 0 && (
                <div className="notif-bell__empty">Loading...</div>
              )}
              {!loading && items.length === 0 && (
                <div className="notif-bell__empty">No notifications yet</div>
              )}
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`notif-bell__item${n.read ? "" : " notif-bell__item--unread"}`}
                  onClick={() => handleItemClick(n)}
                >
                  <div className="notif-bell__item-content">
                    <span className="notif-bell__item-title">{n.title}</span>
                    {n.body && (
                      <span className="notif-bell__item-body">
                        {n.body.length > 80 ? n.body.slice(0, 80) + "..." : n.body}
                      </span>
                    )}
                    <span className="notif-bell__item-time">
                      {relativeTime(n.created_at)}
                    </span>
                  </div>
                  {!n.read && <span className="notif-bell__dot" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
