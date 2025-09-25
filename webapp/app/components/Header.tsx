"use client"
import Connect from "./Connect"
export default function Header(){
  return (
    <div className="w-full px-4 py-3 flex items-center justify-between border-b">
      <div className="text-xl font-semibold">LightChallenge</div>
      <Connect/>
    </div>
  )
}
