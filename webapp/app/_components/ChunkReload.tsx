"use client";
import { useEffect } from "react";

export default function ChunkReload() {
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const msg = String((e?.reason?.message ?? e?.reason ?? "") as any);
      const name = String((e?.reason?.name ?? "") as any);
      if (
        name === "ChunkLoadError" ||
        msg.includes("Loading chunk") ||
        msg.includes("_next/static/chunks")
      ) {
        console.warn("[ChunkReload] Detected chunk load error → reloading");
        // Give the dev server a moment to finish rebuilding
        setTimeout(() => window.location.reload(), 150);
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);
  return null;
}