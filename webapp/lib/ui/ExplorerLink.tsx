"use client"
import Link from "next/link"

export default function ExplorerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className="underline underline-offset-2 hover:brightness-110" href={href} target="_blank" rel="noreferrer">
      {children}
    </Link>
  )
}
