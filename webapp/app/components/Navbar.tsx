"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  Compass,
  PlusCircle,
  LayoutDashboard,
  FileText,
  DollarSign,
  Trophy,
  Star,
  Medal,
  BookOpen,
  ExternalLink,
  Settings,
  Link2,
  User,
  LogOut,
  ChevronDown,
} from "lucide-react";
import ThemeSwitcher from "./theme/ThemeIconToggle";
import NetworkStatus from "./NetworkStatus";
import { ADDR, ABI, ZERO_ADDR } from "@/lib/contracts";
import { AnimatePresence, motion } from "framer-motion";

/* ── Icons (lucide-react, consistent 16px nav size) ──────────────────────── */

const Icons = {
  explore: <Compass size={16} strokeWidth={1.8} />,
  create: <PlusCircle size={16} strokeWidth={1.8} />,
  myChallenges: <LayoutDashboard size={16} strokeWidth={1.8} />,
  proof: <FileText size={16} strokeWidth={1.8} />,
  claims: <DollarSign size={16} strokeWidth={1.8} />,
  competitions: <Trophy size={16} strokeWidth={1.8} />,
  createTournament: <Star size={16} strokeWidth={1.8} />,
  achievements: <Medal size={16} strokeWidth={1.8} />,
  docs: <BookOpen size={16} strokeWidth={1.8} />,
  external: <ExternalLink size={10} strokeWidth={2} />,
  admin: <Settings size={16} strokeWidth={1.8} />,
  chevron: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="nav-chevron">
      <path fill="currentColor" d="M5 6.5 1 2.5h8z" />
    </svg>
  ),
  linkedAccounts: <Link2 size={16} strokeWidth={1.8} />,
  profile: <User size={16} strokeWidth={1.8} />,
  logout: <LogOut size={16} strokeWidth={1.8} />,
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
    label: "Tournaments",
    items: [
      {
        label: "Browse Tournaments",
        href: "/competitions",
        description: "Browse live tournaments & leagues",
        icon: Icons.competitions,
      },
      {
        label: "Create Tournament",
        href: "/competitions/create",
        description: "Host your own competition",
        icon: Icons.createTournament,
      },
    ],
  },
  {
    label: "Achievements",
    href: "/me/achievements",
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

function WalletButton({ onConnect }: { onConnect?: () => void } = {}) {
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
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none" as const, userSelect: "none" as const },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    type="button"
                    onClick={() => {
                      onConnect?.();
                      openConnectModal?.();
                    }}
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
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

/* ── Profile dropdown (desktop) ───────────────────────────────────────────── */

function ProfileDropdown({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { address, isConnected } = useAccount();

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

  return (
    <div className="profile-dropdown" ref={ref}>
      <button
        type="button"
        className="profile-dropdown__trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Profile menu"
      >
        <span className="profile-dropdown__avatar">
          <User size={16} strokeWidth={1.8} />
        </span>
        <ChevronDown size={12} className={`profile-dropdown__chevron${open ? " is-open" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="profile-dropdown__menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {isConnected && address && (
              <div className="profile-dropdown__wallet-info">
                <span className="profile-dropdown__addr mono">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
              </div>
            )}

            <div className="profile-dropdown__section">
              <Link href="/me/challenges" className="profile-dropdown__item" onClick={() => setOpen(false)}>
                {Icons.myChallenges}
                <span>My Challenges</span>
              </Link>
              <Link href="/me/achievements" className="profile-dropdown__item" onClick={() => setOpen(false)}>
                {Icons.achievements}
                <span>Achievements</span>
              </Link>
              <Link href="/claims" className="profile-dropdown__item" onClick={() => setOpen(false)}>
                {Icons.claims}
                <span>Claims</span>
              </Link>
            </div>

            <div className="profile-dropdown__divider" />

            <div className="profile-dropdown__section">
              <Link href="/settings/linked-accounts" className="profile-dropdown__item" onClick={() => setOpen(false)}>
                {Icons.linkedAccounts}
                <span>Linked Accounts</span>
              </Link>
              {isAdmin && (
                <Link href="/admin" className="profile-dropdown__item" onClick={() => setOpen(false)}>
                  {Icons.admin}
                  <span>Admin Console</span>
                </Link>
              )}
            </div>

            <div className="profile-dropdown__divider" />

            <div className="profile-dropdown__section">
              <div className="profile-dropdown__item profile-dropdown__item--row">
                <span className="text-xs color-muted">Theme</span>
                <ThemeSwitcher />
              </div>
              <RememberSwitch />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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

    // Standalone top-level links
    groups.push({
      title: "Discover",
      items: [
        {
          label: "Explore",
          href: "/explore",
          description: "Discover challenges",
          icon: Icons.explore,
        },
        {
          label: "Achievements",
          href: "/me/achievements",
          description: "Badges, milestones & reputation",
          icon: Icons.achievements,
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
    <>
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
                          className="nav-pill nav-pill--glow nav-pill--external"
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

              {/* Admin link moved to profile dropdown */}
            </ul>
          </nav>

          {/* Desktop right controls */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <NetworkStatus />
            <WalletButton />
            <ProfileDropdown isAdmin={isAdmin} />
          </div>

          {/* Mobile right controls */}
          <div className="md:hidden flex items-center gap-2 shrink-0">
            <WalletButton onConnect={() => setMobileOpen(false)} />

            {/* Hamburger */}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-sheet"
              onClick={() => setMobileOpen((v) => !v)}
              style={{ width: "var(--ctl-h)", padding: "0", justifyContent: "center" }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {!mobileOpen ? (
                  <motion.svg key="hamburger" width="20" height="20" viewBox="0 0 24 24" aria-hidden
                    initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 90 }} transition={{ duration: 0.15 }}
                  >
                    <path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
                  </motion.svg>
                ) : (
                  <motion.svg key="close" width="20" height="20" viewBox="0 0 24 24" aria-hidden
                    initial={{ opacity: 0, rotate: 90 }} animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: -90 }} transition={{ duration: 0.15 }}
                  >
                    <path fill="currentColor" d="M18.3 5.7 12 12 5.7 5.7 4.3 7.1 10.6 13.4 4.3 19.7 5.7 21.1 12 14.8l6.3 6.3 1.4-1.4L13.4 13.4 19.7 7.1z" />
                  </motion.svg>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </div>
    </header>

      {/* Mobile drawer — outside header to avoid backdrop-filter containing block */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="md:hidden fixed inset-0 z-85"
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
              className="md:hidden fixed inset-x-0 z-90 overflow-y-auto"
              style={{
                top: "calc(var(--navbar-top) + env(safe-area-inset-top, 0px))",
                bottom: "0",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
              }}
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              role="dialog"
              aria-modal="true"
              id="mobile-nav-sheet"
            >
              <div className="mobile-sheet mx-3 mb-6">
                <div className="mobile-sheet__inner">
                  {/* Wallet — primary action at top */}
                  <div className="mobile-wallet-row">
                    <WalletButton onConnect={() => setMobileOpen(false)} />
                  </div>

                  <div className="mobile-nav-divider" aria-hidden />

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

                  {/* Settings footer */}
                  <div className="mobile-nav-divider" aria-hidden />
                  <div className="mobile-settings-row">
                    <div className="mobile-settings-item">
                      <span className="mobile-settings-label">Theme</span>
                      <ThemeSwitcher />
                    </div>
                    <div className="mobile-settings-item">
                      <RememberSwitch />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
