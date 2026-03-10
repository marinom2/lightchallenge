// lib/ui/useInterval.ts
"use client";
import { useEffect, useRef } from "react";

export function useInterval(callback: () => void, delayMs: number) {
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);
  useEffect(() => {
    if (!delayMs && delayMs !== 0) return;
    const id = setInterval(() => saved.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}