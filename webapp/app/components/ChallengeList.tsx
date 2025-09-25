"use client"
import { useEffect, useState } from "react"
import deployments from "../../public/deployments/lightchain.json"
import cpAbi from "../../public/abi/ChallengePay.abi.json"
import { Hex } from "viem"
import { useReadContract } from "wagmi"

export default function ChallengeList() {
  const [list, setList] = useState<any[]>([])

  // TODO: Replace with real ChallengePay.getAllChallenges() once ABI exposed
  useEffect(() => {
    async function load() {
      setList([{ id:1, goal:5000, stake:"0.01 LCAI"}])
    }
    load()
  },[])

  return (
    <div className="p-4 border rounded">
      <h2 className="font-bold">Challenges</h2>
      <ul>
        {list.map(c=>(
          <li key={c.id} className="border-b py-1">
            ID {c.id} – Goal {c.goal} steps – Stake {c.stake}
          </li>
        ))}
      </ul>
    </div>
  )
}
