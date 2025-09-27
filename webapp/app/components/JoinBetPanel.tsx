// components/JoinBetPanel.tsx
"use client";
import { useState, useMemo } from "react";
import { parseEther } from "viem";
import { useWriteContract } from "wagmi";
import { ABI, ADDR } from "@/lib/contracts";

export default function JoinBetPanel({ id, canJoin, canBet, joinWindowOpen, maxReached }:{
  id: bigint;
  canJoin: boolean;
  canBet: boolean;
  joinWindowOpen: boolean;
  maxReached: boolean;
}) {
  const { writeContractAsync } = useWriteContract();
  const [joinAmt, setJoinAmt] = useState("");
  const [betAmt, setBetAmt] = useState("");
  const [betSide, setBetSide] = useState<1|2>(1);
  const [busy, setBusy] = useState<string|null>(null);
  const [toast, setToast] = useState<string|null>(null);

  const disabledReason = useMemo(() => {
    if (!joinWindowOpen) return "Join window closed";
    if (maxReached) return "Cap reached";
    return null;
  }, [joinWindowOpen, maxReached]);

  async function tx(label:string, fn: string, args: any[], value?: bigint) {
    try {
      setBusy(label);
      await writeContractAsync({ abi: ABI.ChallengePay, address: ADDR.ChallengePay, functionName: fn as any, args, value });
      setToast(`${label} submitted`);
    } catch (e:any) {
      setToast(e?.shortMessage || e?.message || "Transaction failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl p-4 border border-white/10 space-y-4">
      <div className="text-sm font-semibold">Join / Bet</div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs text-white/70">Join (success side)</label>
          <input className="w-full bg-white/5 rounded-xl px-3 py-2"
                 placeholder="0.0" value={joinAmt}
                 onChange={(e)=>setJoinAmt(e.target.value)} />
          <button
            disabled={!canJoin || !!disabledReason || busy==="join"}
            onClick={()=>{
              const v = safeParse(joinAmt); if(v==null){setToast("Enter a valid amount"); return;}
              tx("join","joinChallenge",[id],v);
            }}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40">
            {busy==="join"?"Joining...":"Join"}
          </button>
          {disabledReason && <div className="text-xs text-yellow-400">{disabledReason}</div>}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-white/70">Bet (choose side)</label>
          <div className="flex gap-2">
            <button onClick={()=>setBetSide(1)}
              className={`px-3 py-2 rounded-xl ${betSide===1?"bg-white/20":"bg-white/5"}`}>Success</button>
            <button onClick={()=>setBetSide(2)}
              className={`px-3 py-2 rounded-xl ${betSide===2?"bg-white/20":"bg-white/5"}`}>Fail</button>
          </div>
          <input className="w-full bg-white/5 rounded-xl px-3 py-2"
                 placeholder="0.0" value={betAmt}
                 onChange={(e)=>setBetAmt(e.target.value)} />
          <button
            disabled={!canBet || !!disabledReason || busy==="bet"}
            onClick={()=>{
              const v = safeParse(betAmt); if(v==null){setToast("Enter a valid amount"); return;}
              tx("bet","betOn",[id, betSide], v);
            }}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40">
            {busy==="bet"?"Betting...":"Bet"}
          </button>
        </div>
      </div>

      {toast && <div className="text-xs text-white/80">{toast}</div>}
    </div>
  );
}

function safeParse(s:string){ try{ const v = parseEther(s as `${number}`); return v; }catch{return null;}}