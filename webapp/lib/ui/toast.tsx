"use client"
import { create } from "zustand"

type Toast = { id: number; text: string }
type Store = { list: Toast[]; push: (t: string)=>void; pop: (id:number)=>void }

export const useToasts = create<Store>((set,get)=>({
  list: [],
  push: (text) => set({ list: [...get().list, { id: Date.now(), text }] }),
  pop: (id) => set({ list: get().list.filter(t => t.id !== id) })
}))

export function Toasts() {
  const { list, pop } = useToasts()
  return (
    <div className="fixed top-3 right-3 space-y-2 z-50">
      {list.map(t=>(
        <div key={t.id} className="rounded-2xl bg-black/80 border border-white/10 px-4 py-2 cursor-pointer"
             onClick={()=>pop(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
