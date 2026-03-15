"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Flag,
  Trophy,
  Zap,
  Users,
  DollarSign,
  Settings,
  Shield,
  Box,
  Activity,
  BookOpen,
} from "lucide-react";
import { cn } from "../lib/utils";

/* ── Icons (lucide-react) ─────────────────────────────────────────────────── */

const I = {
  dashboard: <LayoutGrid size={16} strokeWidth={1.8} />,
  challenges: <Flag size={16} strokeWidth={1.8} />,
  competitions: <Trophy size={16} strokeWidth={1.8} />,
  events: <Zap size={16} strokeWidth={1.8} />,
  users: <Users size={16} strokeWidth={1.8} />,
  treasury: <DollarSign size={16} strokeWidth={1.8} />,
  config: <Settings size={16} strokeWidth={1.8} />,
  roles: <Shield size={16} strokeWidth={1.8} />,
  models: <Box size={16} strokeWidth={1.8} />,
  monitoring: <Activity size={16} strokeWidth={1.8} />,
  docs: <BookOpen size={16} strokeWidth={1.8} />,
};

/* ── Navigation structure ─────────────────────────────────────────────────── */

type NavItem = { label: string; href: string; icon: React.ReactNode };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/admin", icon: I.dashboard },
    ],
  },
  {
    title: "Management",
    items: [
      { label: "Challenges", href: "/admin/challenges", icon: I.challenges },
      { label: "Competitions", href: "/admin/competitions", icon: I.competitions },
      { label: "Events", href: "/admin/events", icon: I.events },
      { label: "Users", href: "/admin/users", icon: I.users },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Treasury", href: "/admin/treasury", icon: I.treasury },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Contract Config", href: "/admin/config", icon: I.config },
      { label: "Roles", href: "/admin/roles", icon: I.roles },
      { label: "Models & Templates", href: "/admin/models", icon: I.models },
      { label: "Monitoring", href: "/admin/monitoring", icon: I.monitoring },
    ],
  },
  {
    title: "Help",
    items: [
      { label: "Documentation", href: "/admin/docs", icon: I.docs },
    ],
  },
];

/* ── Component ────────────────────────────────────────────────────────────── */

export default function AdminSidebar({
  open,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="admin-sidebar-backdrop"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside className={cn("admin-sidebar", open && "is-open")}>
        <div className="admin-sidebar__brand">
          <span style={{ fontSize: "var(--lc-text-small)", fontWeight: 600, color: "var(--lc-text)" }}>
            Admin Console
          </span>
        </div>

        <nav className="admin-sidebar__nav">
          {NAV.map((group) => (
            <div key={group.title} className="admin-nav-group">
              <div className="admin-nav-label">{group.title}</div>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn("admin-nav-item", isActive(item.href) && "is-active")}
                >
                  <span className="admin-nav-item__icon">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
