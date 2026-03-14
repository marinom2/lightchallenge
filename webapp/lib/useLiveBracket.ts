"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type BracketMatch = {
  id: string;
  round: number;
  match_number: number;
  bracket_type: string;
  participant_a: string | null;
  participant_b: string | null;
  score_a: number | null;
  score_b: number | null;
  winner: string | null;
  status: string;
  scheduled_at?: string | null;
  completed_at?: string | null;
};

/**
 * useLiveBracket — Connects to the SSE endpoint for a competition's
 * live bracket updates.
 *
 * Returns the full list of matches (merged from init + incremental updates)
 * and a `connected` flag.
 *
 * @param competitionId - The competition to subscribe to.
 * @param enabled       - Set to false to skip connecting (default true).
 */
export function useLiveBracket(competitionId: string, enabled = true) {
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const mergeUpdates = useCallback(
    (prev: BracketMatch[], incoming: BracketMatch[]): BracketMatch[] => {
      const updated = [...prev];
      for (const m of incoming) {
        const idx = updated.findIndex((u) => u.id === m.id);
        if (idx >= 0) {
          updated[idx] = m;
        } else {
          updated.push(m);
        }
      }
      return updated;
    },
    []
  );

  useEffect(() => {
    if (!enabled || !competitionId) return;

    const es = new EventSource(
      `/api/v1/competitions/${competitionId}/live`
    );
    esRef.current = es;

    es.addEventListener("init", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { matches: BracketMatch[] };
        setMatches(data.matches);
        setConnected(true);
      } catch {
        // Malformed init payload — ignore
      }
    });

    es.addEventListener("update", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { matches: BracketMatch[] };
        setMatches((prev) => mergeUpdates(prev, data.matches));
      } catch {
        // Malformed update payload — ignore
      }
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [competitionId, enabled, mergeUpdates]);

  return { matches, connected } as const;
}
