"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import ThemeSwitcher from "./theme/ThemeIconToggle";
import NetworkStatus from "./NetworkStatus";
import { ADDR, ABI, ZERO_ADDR } from "@/lib/contracts";
import { AnimatePresence, motion } from "framer-motion";

/* ── SVG Icons (inline, no deps) ──────────────────────────────────────────── */

const Icons = {
  explore: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  ),
  create: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  myChallenges: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  proof: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  claims: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  competitions: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  ),
  createTournament: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  achievements: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="7" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </svg>
  ),
  docs: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  external: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  admin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  chevron: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="nav-chevron">
      <path fill="currentColor" d="M5 6.5 1 2.5h8z" />
    </svg>
  ),
  linkedAccounts: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
};

/* ── Nav structure ─────────────────────────────────────────────────────────── */

type MegaItem = {
  label: string;
  href: string;
  description: string;
  icon: React.ReactNode;
  external?: boolean;
};

type NavGroup = {
  label: string;
  href?: string; // if set, the pill itself is a link (no dropdown)
  external?: boolean;
  items?: MegaItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Explore",
    href: "/explore",
  },
  {
    label: "Challenges",
    items: [
      {
        label: "Create Challenge",
        href: "/challenges/create",
        description: "Launch a new challenge",
        icon: Icons.create,
      },
      {
        label: "My Challenges",
        href: "/me/challenges",
        description: "Track your active challenges",
        icon: Icons.myChallenges,
      },
      {
        label: "Submit Proof",
        href: "/proofs",
        description: "Upload evidence for verification",
        icon: Icons.proof,
      },
      {
        label: "Claims",
        href: "/claims",
        description: "Claim rewards and refunds",
        icon: Icons.claims,
      },
    ],
  },
  {
    label: "Compete",
    items: [
      {
        label: "Competitions",
        href: "/competitions",
        description: "Browse live tournaments",
        icon: Icons.competitions,
      },
      {
        label: "Create Tournament",
        href: "/competitions/create",
        description: "Host your own competition",
        icon: Icons.createTournament,
      },
      {
        label: "Achievements",
        href: "/me/achievements",
        description: "View badges and milestones",
        icon: Icons.achievements,
      },
    ],
  },
  {
    label: "Docs",
    href: "https://uat.docs.lightchallenge.app",
    external: true,
  },
];

/* Extra items shown only in mobile */
const MOBILE_EXTRA: MegaItem[] = [
  {
    label: "Linked Accounts",
    href: "/settings/linked-accounts",
    description: "Manage connected platforms",
    icon: Icons.linkedAccounts,
  },
];

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function RememberSwitch() {
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    import("@/lib/wallets").then(({ isWalletRemembered }) =>
      setRemember(isWalletRemembered()),
    );
  }, []);

  async function toggle(v: boolean) {
    setRemember(v);
    const { setWalletRemembered } = await import("@/lib/wallets");
    await setWalletRemembered(v);
  }

  return (
    <label
      title="Remember wallet session on this device"
      className="group inline-flex items-center gap-2 select-none"
    >
      <span className="hidden xl:inline text-xs text-(--text-muted)">
        Remember
      </span>
      <button
        type="button"
        aria-pressed={remember}
        onClick={() => toggle(!remember)}
        className={remember ? "switch is-on" : "switch"}
      />
    </label>
  );
}

function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const connected = mounted && account && chain;

        if (!connected) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className="btn btn-primary btn-sm"
            >
              Connect
            </button>
          );
        }

        if (chain?.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className="btn btn-outline btn-sm"
            >
              Wrong network
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={openAccountModal}
            className="btn btn-ghost btn-sm"
            title={account?.displayName}
          >
            <span className="font-semibold">{account?.displayName}</span>
            {account?.displayBalance ? (
              <span className="ml-2 opacity-80">{account.displayBalance}</span>
            ) : null}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

/* ── Mega dropdown ─────────────────────────────────────────────────────────── */

function MegaDropdown({
  group,
  isActive,
  openKey,
  setOpenKey,
}: {
  group: NavGroup;
  isActive: (href: string) => boolean;
  openKey: string | null;
  setOpenKey: (k: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isOpen = openKey === group.label;
  const hasActiveChild = group.items?.some((i) => isActive(i.href)) ?? false;
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setOpenKey(group.label);
  }, [group.label, setOpenKey]);

  const scheduleClose = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setOpenKey(null);
    }, 150);
  }, [setOpenKey]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpenKey(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, setOpenKey]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenKey(null);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, setOpenKey]);

  return (
    <div
      ref={ref}
      className="relative shrink-0"
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className={`nav-pill nav-pill--glow ${hasActiveChild ? "is-active" : ""} ${isOpen ? "is-open" : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={() => setOpenKey(isOpen ? null : group.label)}
      >
        {group.label}
        {Icons.chevron}

        <AnimatePresence>
          {hasActiveChild && (
            <motion.span
              layoutId="nav-underline"
              className="nav-underline"
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1, transformOrigin: "0% 100%" }}
              exit={{ opacity: 0, scaleX: 0 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 30,
                mass: 0.8,
              }}
            />
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {isOpen && group.items && (
          <motion.div
            className="nav-mega"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            role="menu"
          >
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-mega-item ${isActive(item.href) ? "is-active" : ""}`}
                role="menuitem"
                onClick={() => setOpenKey(null)}
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                <span className="nav-mega-item__icon">{item.icon}</span>
                <span className="nav-mega-item__content">
                  <span className="nav-mega-item__label">{item.label}</span>
                  <span className="nav-mega-item__desc">{item.description}</span>
                </span>
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Mobile section ────────────────────────────────────────────────────────── */

function MobileSection({
  title,
  items,
  isActive,
  onClose,
}: {
  title: string;
  items: MegaItem[];
  isActive: (href: string) => boolean;
  onClose: () => void;
}) {
  return (
    <div className="mobile-section">
      <div className="mobile-section__title">{title}</div>
      <div className="space-y-0.5">
        {items.map((item) => {
          const active = !item.external && isActive(item.href);
          return item.external ? (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="mobile-link mobile-link--icon"
            >
              <span className="mobile-link__icon">{item.icon}</span>
              <span className="mobile-link__text">
                <span className="truncate">{item.label}</span>
                <span className="mobile-link__desc">{item.description}</span>
              </span>
              <span className="mobile-link__ext">{Icons.external}</span>
            </a>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`mobile-link mobile-link--icon ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="mobile-link__icon">{item.icon}</span>
              <span className="mobile-link__text">
                <span className="truncate">{item.label}</span>
                <span className="mobile-link__desc">{item.description}</span>
              </span>
              {active && <span aria-hidden className="active-dot" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Navbar ──────────────────────────────────────────────────────────── */

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const { address } = useAccount();

  const CHALLENGEPAY_ADDR = (ADDR.ChallengePay ?? ZERO_ADDR) as `0x${string}`;

  const { data: owner } = useReadContract({
    address: CHALLENGEPAY_ADDR,
    abi: ABI.ChallengePay,
    functionName: "admin",
    query: { enabled: CHALLENGEPAY_ADDR !== ZERO_ADDR },
  });

  const isAdmin =
    !!owner &&
    !!address &&
    (owner as string).toLowerCase() === address.toLowerCase();

  const isActive = useCallback(
    (href: string) =>
      pathname === href || (pathname?.startsWith(href + "/") ?? false),
    [pathname],
  );

  // Build mobile nav groups
  const mobileGroups = useMemo(() => {
    const groups: { title: string; items: MegaItem[] }[] = [];

    // Explore as a standalone item
    groups.push({
      title: "Discover",
      items: [
        {
          label: "Explore",
          href: "/explore",
          description: "Discover challenges",
          icon: Icons.explore,
        },
      ],
    });

    // The dropdown groups
    for (const g of NAV_GROUPS) {
      if (g.items) {
        groups.push({ title: g.label, items: g.items });
      }
    }

    // Extra items
    const extras: MegaItem[] = [...MOBILE_EXTRA];
    if (isAdmin) {
      extras.push({
        label: "Admin",
        href: "/admin",
        description: "System administration",
        icon: Icons.admin,
      });
    }
    extras.push({
      label: "Docs",
      href: "https://uat.docs.lightchallenge.app",
      description: "Developer documentation",
      icon: Icons.docs,
      external: true,
    });
    groups.push({ title: "More", items: extras });

    return groups;
  }, [isAdmin]);

  // Close on route change
  useEffect(() => {
    setMobileOpen(false);
    setOpenDropdown(null);
  }, [pathname]);

  // Close on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  // Body scroll lock
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = mobileOpen ? "hidden" : "";
    body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      html.style.overflow = "";
      body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Scroll detection
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`hdr ${scrolled ? "hdr--scrolled" : ""}`}
      role="banner"
    >
      <div className="container-narrow">
        <div className="navbar-row">
          {/* Brand */}
          <Link href="/" className="brand" aria-label="LightChallenge Home">
            <span className="brand-dot" aria-hidden />
            <span className="text-base font-semibold tracking-tight">
              <span className="h-gradient">Light</span>
              <span>Challenge</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav aria-label="Primary" className="hidden md:flex min-w-0 flex-1">
            <ul className="nav-pills no-scrollbar relative min-w-0 flex-1 overflow-visible">
              {NAV_GROUPS.map((group) => {
                // Simple link pill (no dropdown)
                if (!group.items) {
                  const external = group.external ?? false;
                  const active = !external && isActive(group.href!);
                  return (
                    <li key={group.label} className="relative shrink-0">
                      {external ? (
                        <a
                          href={group.href!}
                          target="_blank"
                          rel="noreferrer"
                          className="nav-pill nav-pill--glow"
                        >
                          {group.label}
                          <span className="nav-pill__ext">{Icons.external}</span>
                        </a>
                      ) : (
                        <Link
                          href={group.href!}
                          className={`nav-pill nav-pill--glow ${active ? "is-active" : ""}`}
                          aria-current={active ? "page" : undefined}
                        >
                          {group.label}
                        </Link>
                      )}
                      <AnimatePresence>
                        {active && (
                          <motion.span
                            layoutId="nav-underline"
                            className="nav-underline"
                            initial={{ opacity: 0, scaleX: 0 }}
                            animate={{
                              opacity: 1,
                              scaleX: 1,
                              transformOrigin: "0% 100%",
                            }}
                            exit={{ opacity: 0, scaleX: 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 400,
                              damping: 30,
                              mass: 0.8,
                            }}
                          />
                        )}
                      </AnimatePresence>
                    </li>
                  );
                }

                // Dropdown pill
                return (
                  <li key={group.label} className="relative shrink-0">
                    <MegaDropdown
                      group={group}
                      isActive={isActive}
                      openKey={openDropdown}
                      setOpenKey={setOpenDropdown}
                    />
                  </li>
                );
              })}

              {/* Admin link */}
              {isAdmin && (
                <li className="relative shrink-0">
                  <Link
                    href="/admin"
                    className={`nav-pill nav-pill--glow ${isActive("/admin") ? "is-active" : ""}`}
                    aria-current={isActive("/admin") ? "page" : undefined}
                  >
                    <span className="nav-pill__admin-icon">{Icons.admin}</span>
                    Admin
                  </Link>
                  <AnimatePresence>
                    {isActive("/admin") && (
                      <motion.span
                        layoutId="nav-underline"
                        className="nav-underline"
                        initial={{ opacity: 0, scaleX: 0 }}
                        animate={{
                          opacity: 1,
                          scaleX: 1,
                          transformOrigin: "0% 100%",
                        }}
                        exit={{ opacity: 0, scaleX: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 30,
                          mass: 0.8,
                        }}
                      />
                    )}
                  </AnimatePresence>
                </li>
              )}
            </ul>
          </nav>

          {/* Desktop right controls */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <NetworkStatus />
            <ThemeSwitcher />
            <RememberSwitch />
            <WalletButton />
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="md:hidden btn btn-ghost btn-sm"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-sheet"
            onClick={() => setMobileOpen((v) => !v)}
            style={{
              width: "var(--ctl-h)",
              padding: "0",
              justifyContent: "center",
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {!mobileOpen ? (
                <motion.svg
                  key="hamburger"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  aria-hidden
                  initial={{ opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 90 }}
                  transition={{ duration: 0.15 }}
                >
                  <path
                    fill="currentColor"
                    d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"
                  />
                </motion.svg>
              ) : (
                <motion.svg
                  key="close"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  aria-hidden
                  initial={{ opacity: 0, rotate: 90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: -90 }}
                  transition={{ duration: 0.15 }}
                >
                  <path
                    fill="currentColor"
                    d="M18.3 5.7 12 12 5.7 5.7 4.3 7.1 10.6 13.4 4.3 19.7 5.7 21.1 12 14.8l6.3 6.3 1.4-1.4L13.4 13.4 19.7 7.1z"
                  />
                </motion.svg>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="md:hidden fixed inset-0 z-30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              style={{
                background: "color-mix(in oklab, #000 55%, transparent)",
              }}
              aria-hidden="true"
            />

            <motion.div
              className="md:hidden fixed inset-x-0 top-[calc(var(--navbar-top)+12px)] bottom-0 z-40 overflow-y-auto"
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              role="dialog"
              aria-modal="true"
              id="mobile-nav-sheet"
            >
              <div className="mobile-sheet mx-3 mb-6 overflow-hidden">
                <div className="p-3 space-y-1">
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs tracking-widest uppercase text-(--text-muted)">
                      Navigation
                    </div>
                    <button
                      type="button"
                      onClick={() => setMobileOpen(false)}
                      className="btn btn-ghost btn-sm"
                    >
                      Close
                    </button>
                  </div>

                  {/* Theme row */}
                  <div className="panel p-2 flex items-center justify-between">
                    <div className="text-xs text-(--text-muted)">Theme</div>
                    <ThemeSwitcher />
                  </div>

                  {/* Nav sections */}
                  {mobileGroups.map((section, idx) => (
                    <div key={section.title}>
                      {idx > 0 && (
                        <div className="mobile-nav-divider" aria-hidden />
                      )}
                      <MobileSection
                        title={section.title}
                        items={section.items}
                        isActive={isActive}
                        onClose={() => setMobileOpen(false)}
                      />
                    </div>
                  ))}

                  {/* Wallet row */}
                  <div className="mobile-nav-divider" aria-hidden />
                  <div className="panel flex items-center justify-between gap-3 p-3">
                    <RememberSwitch />
                    <WalletButton />
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
