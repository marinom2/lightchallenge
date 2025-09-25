"use client"
import { useEffect, useMemo, useState } from "react"
import { useAccount, useReadContract, useWriteContract } from "wagmi"
import type { Abi, AbiFunction } from "viem"
import { getAbi, getDeployments } from "../lib/contracts"

function parseValue(raw: string, solidityType: string): any {
  const t = solidityType.replace(/\s+/g,"")
  if (t.startsWith("uint") || t.startsWith("int")) {
    if (raw.startsWith("0x")) return BigInt(raw)
    if (raw.includes(".")) throw new Error("Decimals not allowed for uint/int")
    return BigInt(raw)
  }
  if (t === "address" || t.startsWith("bytes")) return raw
  if (t === "bool") return raw === "true" || raw === "1"
  if (t.endsWith("[]")) {
    const inner = t.slice(0, t.length-2)
    const arr = JSON.parse(raw)
    return arr.map((v:any)=>parseValue(String(v), inner))
  }
  return raw
}

export default function ContractUI() {
  const { address } = useAccount()
  const [dep, setDep] = useState<{ ChallengePay:`0x${string}` }|null>(null)
  const [abi, setAbi] = useState<Abi|null>(null)
  const [fnName, setFnName] = useState<string>("")
  const [inputs, setInputs] = useState<Record<string,string>>({})
  const [txHash, setTxHash] = useState<string>("")
  const [callResult, setCallResult] = useState<any>(null)

  useEffect(() => { getDeployments().then(d=>setDep({ChallengePay:d.ChallengePay})) }, [])
  useEffect(() => { getAbi("ChallengePay").then(setAbi as any) }, [])

  const nonViewFns = useMemo(() => (abi||[]).filter(
    (x:any)=>x.type==="function" && x.stateMutability!=="view" && x.stateMutability!=="pure"
  ) as AbiFunction[], [abi])

  const viewFns = useMemo(() => (abi||[]).filter(
    (x:any)=>x.type==="function" && (x.stateMutability==="view" || x.stateMutability==="pure")
  ) as AbiFunction[], [abi])

  const currentFn = useMemo(() => nonViewFns.find(f=>f.name===fnName) || null, [nonViewFns, fnName])
  const { writeContractAsync, isPending } = useWriteContract()

  async function runWrite() {
    if (!dep || !abi || !currentFn) return
    const args = (currentFn.inputs||[]).map((i)=>parseValue(inputs[i.name] ?? "", i.type))
    const tx = await writeContractAsync({
      abi, address: dep.ChallengePay, functionName: currentFn.name as any, args
    })
    setTxHash(tx as any)
  }

  // Quick helpers for popular flows (try to auto-fill names if exist)
  const guess = {
    create: nonViewFns.find(f=>/create.*challenge/i.test(f.name))?.name,
    join:   nonViewFns.find(f=>/join/i.test(f.name))?.name,
    bet:    nonViewFns.find(f=>/bet/i.test(f.name))?.name,
    submit: nonViewFns.find(f=>/submit.*proof/i.test(f.name))?.name,
    final:  nonViewFns.find(f=>/finaliz/i.test(f.name))?.name,
  }

  return (
    <div className="lc-grid" style={{gap:16}}>
      <div className="lc-card">
        <div className="font-semibold mb-2">Quick Actions</div>
        <div className="lc-grid" style={{gridTemplateColumns:"repeat(auto-fit, minmax(180px,1fr))", gap:8}}>
          {Object.entries(guess).map(([k,v])=>(
            <button key={k} disabled={!v} className="lc-btn" onClick={()=>setFnName(v!)}>{k.toUpperCase()}{v?` → ${v}`:" (not in ABI)"}</button>
          ))}
        </div>
      </div>

      <div className="lc-card">
        <div className="font-semibold mb-3">Write (transactions)</div>
        <select className="lc-input w-full" value={fnName} onChange={e=>{ setFnName(e.target.value); setInputs({}) }}>
          <option value="" disabled>Select function</option>
          {nonViewFns.map(fn=>(
            <option key={fn.name} value={fn.name}>{fn.name}({fn.inputs?.map(i=>i.type).join(", ")})</option>
          ))}
        </select>

        {currentFn && (
          <div className="mt-3 lc-grid">
            {currentFn.inputs?.map((i,idx)=>(
              <div key={idx} className="lc-grid">
                <label className="lc-label">{i.name}: <span className="lc-sub">{i.type}</span></label>
                <input className="lc-input" placeholder={`value for ${i.type}`} value={inputs[i.name]??""}
                  onChange={(e)=>setInputs(s=>({...s,[i.name]:e.target.value}))}/>
              </div>
            ))}
            <button className="lc-btn" onClick={runWrite} disabled={isPending || !address}>
              {isPending?"Sending…":"Send Transaction"}
            </button>
            {txHash && (
              <div className="lc-sub break-words">tx: {txHash}</div>
            )}
          </div>
        )}
      </div>

      <ViewPanel abi={abi} address={dep?.ChallengePay}/>
    </div>
  )
}

function ViewPanel({ abi, address }:{abi:Abi|null, address?:`0x${string}`}) {
  const [fn, setFn] = useState<AbiFunction|null>(null)
  const [inputs, setInputs] = useState<Record<string,string>>({})
  const [args, setArgs] = useState<any[]|undefined>(undefined)

  useEffect(()=>{ if(fn){ setArgs((fn.inputs||[]).map(i=>parseValue(inputs[i.name]??"", i.type))) }}, [fn, inputs])

  const { data, refetch, isFetching } = useReadContract({
    abi: (abi||[]) as any,
    address,
    functionName: fn?.name as any,
    args,
    query: { enabled: !!fn && !!address && !!args?.length || (fn && (fn.inputs?.length??0)===0) }
  } as any)

  const views = useMemo(()=> (abi||[]).filter(
    (x:any)=>x.type==="function" && (x.stateMutability==="view"||x.stateMutability==="pure")
  ) as AbiFunction[], [abi])

  return (
    <div className="lc-card">
      <div className="font-semibold mb-3">Read (no spend)</div>
      <select className="lc-input w-full" value={fn?.name||""} onChange={e=>{
        const f = views.find(v=>v.name===e.target.value) || null
        setFn(f); setInputs({}); }}>
        <option value="" disabled>Select function</option>
        {views.map(f=>(
          <option key={f.name} value={f.name}>{f.name}({f.inputs?.map(i=>i.type).join(", ")}) ▸ {f.outputs?.map(o=>o.type).join(", ")}</option>
        ))}
      </select>

      {fn && (
        <div className="mt-3 lc-grid">
          {fn.inputs?.map((i,idx)=>(
            <div key={idx} className="lc-grid">
              <label className="lc-label">{i.name}: <span className="lc-sub">{i.type}</span></label>
              <input className="lc-input" value={inputs[i.name]??""} onChange={(e)=>setInputs(s=>({...s,[i.name]:e.target.value}))}/>
            </div>
          ))}
          <button className="lc-btn" onClick={()=>refetch()} disabled={isFetching || !address}>
            {isFetching?"Reading…":"Read"}
          </button>
          {data !== undefined && (
            <pre className="mt-2 text-xs whitespace-pre-wrap break-words">{JSON.stringify(data, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  )
}
