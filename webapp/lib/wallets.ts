// lib/wallets.ts
import { createConfig, http, createStorage, cookieStorage } from "wagmi";
import type { Config, Storage } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { lightchain } from "@/lib/lightchain";

/* ────────────────────────────────────────────────────────────────────────────
   Storage (session vs local) with "Remember this device" opt-in
   ─────────────────────────────────────────────────────────────────────────── */
const REMEMBER_KEY = "lc.wallet.remember";
const WAGMI_KEY = "wagmi.lightchallenge";

const WC_KEYS = [
  "walletconnect",
  "WALLETCONNECT_DEEPLINK_CHOICE",
  "wc@2:client:0.3//session",
  "wc@2:core:0.3//pairing",
  "wc@2:core:0.3//topic",
  "wc@2:client:0.4//session",
  "wc@2:core:0.4//pairing",
  "wc@2:core:0.4//topic",
];
const CB_KEYS = [
  "walletlink:https://www.walletlink.org:session:",
  "coinbaseWalletSDKSession",
];

function getRemember(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(REMEMBER_KEY) === "1"; } catch { return false; }
}
function setRemember(v: boolean) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(REMEMBER_KEY, v ? "1" : "0"); } catch {}
}

function makeAdapter(base: globalThis.Storage | null): Storage {
  return {
    key: WAGMI_KEY,
    getItem: ((key, def) => {
      try {
        const raw = base?.getItem(key);
        return (raw === null ? (def as any) : (raw as any));
      } catch { return def as any; }
    }) as Storage["getItem"],
    setItem: ((key, value) => {
      try {
        if (value == null) base?.removeItem(key);
        else base?.setItem(key, String(value as any));
      } catch {}
    }) as Storage["setItem"],
    removeItem: (key: string) => { try { base?.removeItem(key); } catch {} },
  };
}

const memoryStore: Record<string, string> = {};
const memoryAdapter: Storage = {
  key: WAGMI_KEY,
  getItem: ((key, def) =>
    (Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : def ?? null)
  ) as Storage["getItem"],
  setItem: ((key, value) => { if (value == null) delete memoryStore[key]; else memoryStore[key] = String(value as any); }) as Storage["setItem"],
  removeItem: (key: string) => { delete memoryStore[key]; },
};

const cookieAdapter: Storage = {
  key: WAGMI_KEY,
  getItem: cookieStorage.getItem as Storage["getItem"],
  setItem: cookieStorage.setItem as Storage["setItem"],
  removeItem: cookieStorage.removeItem,
};

function getSessionAdapter(): Storage {
  if (typeof window === "undefined") return cookieAdapter;
  try { return makeAdapter(window.sessionStorage); } catch { return memoryAdapter; }
}
function getLocalAdapter(): Storage {
  if (typeof window === "undefined") return cookieAdapter;
  try { return makeAdapter(window.localStorage); } catch { return memoryAdapter; }
}

const hybridStorage: Storage = {
  key: WAGMI_KEY,
  getItem: ((key, def) => (getRemember() ? getLocalAdapter() : getSessionAdapter()).getItem(key, def as any)) as Storage["getItem"],
  setItem: ((key, value) => (getRemember() ? getLocalAdapter() : getSessionAdapter()).setItem(key, value as any)) as Storage["setItem"],
  removeItem: (key: string) => (getRemember() ? getLocalAdapter() : getSessionAdapter()).removeItem(key),
};

const wagmiStore = createStorage({ storage: hybridStorage, key: WAGMI_KEY });

/* ────────────────────────────────────────────────────────────────────────────
   wagmi v2 Config (SSR-safe connectors)
   ─────────────────────────────────────────────────────────────────────────── */
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai";
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!process.env.NEXT_PUBLIC_RPC_URL && typeof window !== "undefined") {
  console.warn("[viem] NEXT_PUBLIC_RPC_URL not set — using fallback RPC:", RPC_URL);
}

const isServer = typeof window === "undefined";
const clientConnectors = !isServer
  ? [
      injected({ shimDisconnect: true }),
      ...(projectId
        ? [
            walletConnect({
              projectId,
              showQrModal: false,
              metadata: {
                name: "LightChallenge",
                description: "Challenges verified by decentralized AI.",
                url: "https://lightchallenge.app",
                icons: ["https://lightchallenge.app/icon.png"],
              },
            }),
          ]
        : []),
    ]
  : []; // SSR: avoid WalletConnect (IndexedDB)

export const wagmiConfig: Config = createConfig({
  chains: [lightchain],
  transports: { [lightchain.id]: http(RPC_URL) },
  connectors: clientConnectors,
  storage: wagmiStore,
  ssr: false, // avoid server-side eager behavior
});

/* ────────────────────────────────────────────────────────────────────────────
   Public helpers for Remember toggle
   ─────────────────────────────────────────────────────────────────────────── */
export function isWalletRemembered(): boolean { return getRemember(); }

function getOrNull(store: Storage, key: string): string | null {
  return store.getItem(key, null as any) as any;
}
function copyKey(from: Storage, to: Storage, key: string) {
  try { const v = getOrNull(from, key); if (v != null) to.setItem(key, String(v)); } catch {}
}
function removeKey(store: Storage, key: string) {
  try { store.removeItem(key); } catch {}
}

/** Toggle persistence & migrate keys so reconnect behavior is deterministic. */
export async function setWalletRemembered(remember: boolean) {
  if (typeof window === "undefined") { setRemember(remember); return; }

  const session = getSessionAdapter();
  const local   = getLocalAdapter();

  if (remember) {
    // Move wagmi + Web3Modal/WalletConnect hints to localStorage
    copyKey(session, local, WAGMI_KEY);
    for (const k of ["wagmi.store", ...WC_KEYS, ...CB_KEYS]) copyKey(session, local, k);
  } else {
    // Purge persistent hints from localStorage
    for (const k of [WAGMI_KEY, "wagmi.store", ...WC_KEYS, ...CB_KEYS]) removeKey(local, k);
  }

  setRemember(remember);
}

/** Hard reset everything (debug). */
export async function hardResetWalletState() {
  const { disconnect } = await import("wagmi/actions");
  try { await disconnect(wagmiConfig); } catch {}
  const local = getLocalAdapter();
  const session = getSessionAdapter();
  const keys = [WAGMI_KEY, "wagmi.store", ...WC_KEYS, ...CB_KEYS];
  for (const s of [local, session, cookieAdapter]) for (const k of keys) removeKey(s, k);
}

/** Purge persistent only (localStorage). */
export function purgePersistentWalletHints() {
  if (typeof window === "undefined") return;
  const local = getLocalAdapter();
  for (const k of [WAGMI_KEY, "wagmi.store", ...WC_KEYS, ...CB_KEYS]) removeKey(local, k);
}

/** Clear ephemeral (sessionStorage). */
export function clearEphemeralSession() {
  const session = getSessionAdapter();
  for (const k of [WAGMI_KEY, "wagmi.store", ...WC_KEYS, ...CB_KEYS]) removeKey(session, k);
}