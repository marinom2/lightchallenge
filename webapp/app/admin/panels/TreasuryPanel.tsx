import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Abi, Address, Hex, Log } from "viem";
import { formatUnits, getAddress, isAddress, keccak256, parseUnits, toBytes } from "viem";
import { ABI, ADDR } from "@/lib/contracts";
import { ZERO, okAddr, short, cn } from "../lib/utils";
import { Panel, Card, Field, Toast, Busy, seg } from "../components/ui";

export function TreasuryPanel() {
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { address } = useAccount();

  const [toast, setToast] = useState<{ kind: "info" | "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const push = (text: string, kind: "info" | "ok" | "bad" = "info") => {
    setToast({ kind, text }); setTimeout(() => setToast(null), 3600);
  };
  const waitReceipt = async (hash: Hex) => {
    if (!pc) return;
    setBusy("Waiting for confirmation…");
    await pc.waitForTransactionReceipt({ hash });
    setBusy(null);
  };

  // local token tracker
  const TOKENS_KEY = "lc.admin.tokens";
  const [tokenList, setTokenList] = useState<Address[]>([]);
  const [newToken, setNewToken] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TOKENS_KEY);
      const arr: string[] = raw ? JSON.parse(raw) : [];
      const clean = arr.filter((v): v is Address => isAddress(v)).map(getAddress);
      setTokenList(clean);
    } catch { setTokenList([]); }
  }, []);
  const saveTokens = (next: Address[]) => {
    setTokenList(next);
    try { localStorage.setItem(TOKENS_KEY, JSON.stringify(next)); } catch {}
  };

  const ERC20_ABI = ABI.ERC20 as Abi;
  const [erc20, setErc20] = useState<Array<{ addr: Address; symbol: string; decimals: number; balance: bigint }>>([]);
  useEffect(() => {
    let stop = false;
    (async () => {
      if (!pc || tokenList.length === 0) { setErc20([]); return; }
      const out: Array<{ addr: Address; symbol: string; decimals: number; balance: bigint }> = [];
      for (const t of tokenList) {
        try {
          const [dec, sym, bal] = await Promise.all([
            pc.readContract({ address: t, abi: ERC20_ABI, functionName: "decimals" }) as Promise<number>,
            pc.readContract({ address: t, abi: ERC20_ABI, functionName: "symbol" }) as Promise<string>,
            pc.readContract({ address: t, abi: ERC20_ABI, functionName: "balanceOf", args: [ADDR.Treasury] }) as Promise<bigint>,
          ]);
          out.push({ addr: t, symbol: sym, decimals: Number(dec), balance: bal });
        } catch {/* ignore */}
      }
      if (!stop) setErc20(out);
    })();
    return () => { stop = true; };
  }, [pc, tokenList]);

  // grants
  const [grantToken, setGrantToken] = useState<Address | "">("");
  const [grantTo, setGrantTo] = useState("");
  const [grantAmt, setGrantAmt] = useState("");

  const doGrant = async () => {
    const token = grantToken ? getAddress(grantToken) : undefined;
    const to = okAddr(grantTo);
    if (!token || !to) return push("Enter token & recipient", "bad");
    const meta = erc20.find(x => x.addr.toLowerCase() === token.toLowerCase());
    const dec = meta?.decimals ?? 18;
    let amt: bigint;
    try { amt = parseUnits(grantAmt || "0", dec); } catch { return push("Invalid amount", "bad"); }
    try {
      setBusy("Sending transaction…");
      const tx = await writeContractAsync({
        address: ADDR.Treasury,
        abi: ABI.Treasury as Abi,
        functionName: "grantERC20",
        args: [token, to, amt],
      });
      await waitReceipt(tx);
      push("Grant sent", "ok");
    } catch (e: any) {
      setBusy(null);
      push(e?.shortMessage || e?.message || "Grant failed", "bad");
    }
  };

  // sweep
  const [sweepKind, setSweepKind] = useState<"native" | Address>("native");
  const [sweepTo, setSweepTo] = useState("");
  const [sweepAmt, setSweepAmt] = useState("");

  const doSweep = async () => {
    const to = okAddr(sweepTo); if (!to) return push("Enter recipient", "bad");
    const isNative = sweepKind === "native";
    const tokenAddr = isNative ? ZERO : (sweepKind as Address);
    const meta = isNative ? undefined : erc20.find(x => x.addr.toLowerCase() === tokenAddr.toLowerCase());
    const dec = isNative ? 18 : (meta?.decimals ?? 18);
    let amt: bigint;
    try { amt = parseUnits(sweepAmt || "0", dec); } catch { return push("Invalid amount", "bad"); }
    try {
      setBusy("Sending transaction…");
      const tx = await writeContractAsync({
        address: ADDR.Treasury,
        abi: ABI.Treasury as Abi,
        functionName: "sweep",
        args: [tokenAddr, to, amt],
      });
      await waitReceipt(tx);
      push("Sweep complete", "ok");
    } catch (e: any) {
      setBusy(null);
      push(e?.shortMessage || e?.message || "Sweep failed", "bad");
    }
  };

  // Allowance viewer
  const [scanBlocks, setScanBlocks] = useState<number>(120_000);
  const [allowances, setAllowances] = useState<{ token: Address | "native"; recipient: Address; amount: bigint }[]>([]);
  const scanAllowances = async () => {
    if (!pc) return;
    try {
      const current = await pc.getBlockNumber();
      const from = current - BigInt(Math.max(1_000, scanBlocks));
      const to = current;

      const tGrant20 = keccak256(toBytes("GrantERC20(address,address,uint256,address)"));
      const tGrantETH = keccak256(toBytes("GrantETH(address,uint256,address)"));
      const tClaim20 = keccak256(toBytes("ClaimedERC20(address,address,uint256)"));
      const tClaimETH = keccak256(toBytes("ClaimedETH(address,uint256)"));
      const tDepFor = keccak256(toBytes("ReceivedERC20For(address,address,address,uint256)"));

      const logs = await pc.getLogs({ address: ADDR.Treasury, fromBlock: from, toBlock: to });

      const map = new Map<string, bigint>();
      const add = (k: string, v: bigint) => map.set(k, (map.get(k) ?? 0n) + v);
      const sub = (k: string, v: bigint) => map.set(k, (map.get(k) ?? 0n) - v);

      for (const l of logs as readonly Log[]) {
        const sig = (l.topics?.[0] ?? "") as Hex;
        const dataAmt = l.data && l.data !== "0x" ? BigInt(l.data as Hex) : 0n;

        if (sig === tGrant20 && l.topics.length >= 4) {
          const token = ("0x" + l.topics[1]!.slice(26)) as Address;
          const toR = ("0x" + l.topics[2]!.slice(26)) as Address;
          add(`${token}|${toR}`, dataAmt);
        } else if (sig === tGrantETH && l.topics.length >= 3) {
          const toR = ("0x" + l.topics[1]!.slice(26)) as Address;
          add(`native|${toR}`, dataAmt);
        } else if (sig === tClaim20 && l.topics.length >= 3) {
          const token = ("0x" + l.topics[1]!.slice(26)) as Address;
          const toR = ("0x" + l.topics[2]!.slice(26)) as Address;
          sub(`${token}|${toR}`, dataAmt);
        } else if (sig === tClaimETH && l.topics.length >= 2) {
          const toR = ("0x" + l.topics[1]!.slice(26)) as Address;
          sub(`native|${toR}`, dataAmt);
        } else if (sig === tDepFor && l.topics.length >= 4) {
          const token = ("0x" + l.topics[1]!.slice(26)) as Address;
          const creditedTo = ("0x" + l.topics[3]!.slice(26)) as Address;
          add(`${token}|${creditedTo}`, dataAmt);
        }
      }

      const rows: { token: Address | "native"; recipient: Address; amount: bigint }[] = [];
      for (const [k, v] of map) {
        if (v <= 0n) continue;
        const [tokenStr, who] = k.split("|");
        rows.push({
          token: tokenStr === "native" ? "native" : (tokenStr as Address),
          recipient: who as Address,
          amount: v,
        });
      }
      setAllowances(rows);
      push(`Scanned ~${scanBlocks.toLocaleString()} blocks → ${rows.length} active allowances`, "ok");
    } catch (e: any) {
      push(e?.shortMessage || e?.message || "Scan failed", "bad");
    }
  };

  return (
    <Panel title="Treasury">
      {toast && <Toast kind={toast.kind} text={toast.text} />}
      {busy && <Busy text={busy} />}

      <Card title="Tracked Tokens">
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Add ERC-20 address (0x…)" value={newToken} onChange={(e) => setNewToken(e.target.value)} />
          <button
            className="btn btn-ghost"
            onClick={() => {
              const a = okAddr(newToken);
              if (!a) return push("Enter a valid ERC-20 address", "bad");
              if (tokenList.some(t => t.toLowerCase() === a.toLowerCase())) return push("Already added", "bad");
              saveTokens([a, ...tokenList]); setNewToken("");
            }}
          >
            Add
          </button>
        </div>

        {erc20.length === 0 ? (
          <div className="empty mt-3">No tokens tracked. Add an ERC-20 above.</div>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="table table--compact" style={{ minWidth: 720 }}>
              <thead>
                <tr><th>Token</th><th>Symbol</th><th>Decimals</th><th>Treasury Balance</th><th /></tr>
              </thead>
              <tbody>
                {erc20.map((t) => (
                  <tr key={t.addr}>
                    <td className="mono">
                      <Link className="link" href={`https://testnet.lightscan.app/address/${t.addr}`} target="_blank">
                        {t.addr}
                      </Link>
                    </td>
                    <td>{t.symbol}</td>
                    <td>{t.decimals}</td>
                    <td>{formatUnits(t.balance, t.decimals)}</td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => saveTokens(tokenList.filter((x) => x.toLowerCase() !== t.addr.toLowerCase()))}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Grant ERC-20 Allowance">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs opacity-70 mb-1">Token</div>
            <select className="input" value={grantToken || ""} onChange={(e) => setGrantToken(e.target.value ? getAddress(e.target.value as Address) : "")}>
              <option value="">— select token —</option>
              {erc20.map((t) => (
                <option key={t.addr} value={t.addr}>{t.symbol} — {short(t.addr)}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs opacity-70 mb-1">Recipient (0x…)</div>
            <input className="input" value={grantTo} onChange={(e) => setGrantTo(e.target.value)} placeholder="0x…" />
          </div>
          <div>
            <div className="text-xs opacity-70 mb-1">Amount (tokens)</div>
            <input className="input" value={grantAmt} onChange={(e) => setGrantAmt(e.target.value)} placeholder="0.0" />
          </div>
          <div className="sm:col-span-3">
            <button className="btn btn-primary" onClick={doGrant}>Grant</button>
          </div>
        </div>
      </Card>

      <Card title="Sweep Funds">
        <div className="flex flex-wrap gap-2">
          <button className={seg(sweepKind === "native")} onClick={() => setSweepKind("native")}>Native</button>
          {erc20.map((t) => (
            <button key={t.addr} className={seg(sweepKind === t.addr)} onClick={() => setSweepKind(t.addr)}>
              {t.symbol}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3 mt-3">
          <Field label="Recipient (0x…)"><input className="input" value={sweepTo} onChange={(e) => setSweepTo(e.target.value)} /></Field>
          <Field label="Amount"><input className="input" value={sweepAmt} onChange={(e) => setSweepAmt(e.target.value)} /></Field>
          <div className="flex items-end">
            <button className="btn btn-warn" onClick={doSweep}>Sweep</button>
          </div>
        </div>
      </Card>

      <Card title="Allowance Viewer">
        <div className="flex items-center gap-2">
          <input className="input w-36" type="number" min={1000} step={1000} value={scanBlocks} onChange={(e) => setScanBlocks(Number(e.target.value))} />
          <button className="btn btn-ghost" onClick={scanAllowances}>Scan</button>
        </div>
        {allowances.length === 0 ? (
          <div className="empty mt-3">Run a scan to reconstruct recent allowances.</div>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="table table--compact" style={{ minWidth: 880 }}>
              <thead><tr><th>Token</th><th>Symbol</th><th>Recipient</th><th>Allowance</th></tr></thead>
              <tbody>
                {allowances.map((row, i) => {
                  const isNative = row.token === "native";
                  const meta = !isNative ? erc20.find(t => t.addr.toLowerCase() === (row.token as Address).toLowerCase()) : undefined;
                  const sym = isNative ? "LCAI" : (meta?.symbol ?? "ERC20");
                  const dec = isNative ? 18 : (meta?.decimals ?? 18);
                  return (
                    <tr key={`${row.token}-${row.recipient}-${i}`}>
                      <td className="mono">{isNative ? <span className="chip chip--info">Native</span> : short(row.token as string)}</td>
                      <td>{sym}</td>
                      <td className="mono">{row.recipient}</td>
                      <td>{formatUnits(row.amount, dec)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Panel>
  );
}
