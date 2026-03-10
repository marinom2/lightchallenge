"use client";

import * as React from "react";

const KEY = "lc_explore_favs_v1";

export function useFavorites() {
  const [setObj, setSetObj] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSetObj(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  const persist = (next: Set<string>) => {
    setSetObj(new Set(next));
    try {
      localStorage.setItem(KEY, JSON.stringify(Array.from(next)));
    } catch {}
  };

  const toggle = (id: string) => {
    setSetObj(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
      return next;
    });
  };

  const has = (id: string) => setObj.has(id);

  return { favorites: setObj, toggle, has };
}