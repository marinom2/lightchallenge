"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import ThemeSwitcher from "./theme/ThemeIconToggle";
import { ADDR, ABI, ZERO_ADDR } from "@/lib/contracts";
import { AnimatePresence, motion } from "framer-motion";

type NavItem = { label: string; href: string };

const BASE_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Explore", href: "/explore" },
  { label: "Create", href: "/challenges/create" },
  { label: "Validators", href: "/validators" },
  { label: "Claims", href: "/claims" },
  { label: "Submit Proof", href: "/proofs/submit" },
  { label: "Linked Accounts", href: "/settings/linked-accounts" },
];

function RememberSwitch() {
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    import("@/lib/wallets").then(({ isWalletRemembered }) => setRemember(isWalletRemembered()));
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
      <span className="hidden xl:inline text-xs text-(--text-muted)">Remember</span>
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
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;

        if (!connected) {
          return (
            <button type="button" onClick={openConnectModal} className="btn btn-primary btn-sm">
              Connect
            </button>
          );
        }

        if (chain?.unsupported) {
          return (
            <button type="button" onClick={openChainModal} className="btn btn-outline btn-sm">
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

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { address } = useAccount();

  const CHALLENGEPAY_ADDR = (ADDR.ChallengePay ?? ZERO_ADDR) as `0x${string}`;

  const { data: owner } = useReadContract({
    address: CHALLENGEPAY_ADDR,
    abi: ABI.ChallengePay,
    functionName: "admin",
    query: {
      enabled: CHALLENGEPAY_ADDR !== ZERO_ADDR,
    },
  });

  const isAdmin =
    !!owner && !!address && (owner as string).toLowerCase() === address.toLowerCase();

  const navItems: NavItem[] = useMemo(
    () => (isAdmin ? [...BASE_NAV, { label: "Admin", href: "/admin" }] : BASE_NAV),
    [isAdmin]
  );

  const isActive = (href: string) =>
    pathname === href || (pathname?.startsWith(href + "/") ?? false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = open ? "hidden" : "";
    body.style.overflow = open ? "hidden" : "";
    return () => {
      html.style.overflow = "";
      body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="hdr" role="banner">
      <div className="container-narrow">
        <div className="navbar-row">
          <Link href="/" className="brand" aria-label="LightChallenge Home">
            <span className="brand-dot" aria-hidden />
            <span className="text-base font-semibold tracking-tight">
              <span className="h-gradient">Light</span>
              <span>Challenge</span>
            </span>
          </Link>

          <nav aria-label="Primary" className="hidden md:flex min-w-0 flex-1">
            <ul className="nav-pills no-scrollbar relative min-w-0 flex-1">
              {navItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href} className="relative shrink-0">
                    <Link
                      href={item.href}
                      className={`nav-pill ${active ? "is-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.label}
                    </Link>

                    <AnimatePresence>
                      {active && (
                        <motion.span
                          layoutId="nav-underline"
                          className="nav-underline"
                          initial={{ opacity: 0, scaleX: 0 }}
                          animate={{ opacity: 1, scaleX: 1, transformOrigin: "0% 100%" }}
                          exit={{ opacity: 0, scaleX: 0 }}
                          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                        />
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="hidden md:flex items-center gap-3 shrink-0">
            <ThemeSwitcher />
            <RememberSwitch />
            <WalletButton />
          </div>

          <button
            type="button"
            className="md:hidden btn btn-ghost btn-sm"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-nav-sheet"
            onClick={() => setOpen((v) => !v)}
            style={{ width: "var(--ctl-h)", padding: "0", justifyContent: "center" }}
          >
            {!open ? (
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                <path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M18.3 5.7 12 12 5.7 5.7 4.3 7.1 10.6 13.4 4.3 19.7 5.7 21.1 12 14.8l6.3 6.3 1.4-1.4L13.4 13.4 19.7 7.1z"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="md:hidden fixed inset-0 z-30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ background: "color-mix(in oklab, #000 55%, transparent)" }}
              aria-hidden="true"
            />

            <motion.div
              className="md:hidden fixed inset-x-0 top-[calc(var(--navbar-top)+12px)] z-40"
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              role="dialog"
              aria-modal="true"
              id="mobile-nav-sheet"
            >
              <div className="mobile-sheet mx-3 overflow-hidden">
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs tracking-widest uppercase text-(--text-muted)">
                      Navigation
                    </div>
                    <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">
                      Close
                    </button>
                  </div>

                  <div className="panel p-2 flex items-center justify-between">
                    <div className="text-xs text-(--text-muted)">Theme</div>
                    <ThemeSwitcher />
                  </div>

                  <div className="space-y-2">
                    {navItems.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={active ? "mobile-link is-active" : "mobile-link"}
                          aria-current={active ? "page" : undefined}
                        >
                          <span className="truncate">{item.label}</span>
                          {active ? <span aria-hidden className="active-dot" /> : null}
                        </Link>
                      );
                    })}
                  </div>

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