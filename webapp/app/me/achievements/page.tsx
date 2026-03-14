"use client";

import React, { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Trophy, Award, Star, ChevronRight } from "lucide-react";
import Link from "next/link";

type Achievement = {
  token_id: string;
  challenge_id: string;
  recipient: string;
  achievement_type: string;
  tx_hash: string | null;
  minted_at: string;
  title: string | null;
  description: string | null;
};

type Reputation = {
  points: number;
  level: number;
  levelName: string;
  completions: number;
  victories: number;
};

const LEVEL_THRESHOLDS = [
  { min: 0, max: 100, level: 1 },
  { min: 100, max: 300, level: 2 },
  { min: 300, max: 800, level: 3 },
  { min: 800, max: 2000, level: 4 },
  { min: 2000, max: Infinity, level: 5 },
];

function progressPercent(points: number): number {
  const t = LEVEL_THRESHOLDS.find(
    (t) => points >= t.min && points < t.max
  );
  if (!t || t.max === Infinity) return 100;
  return Math.round(((points - t.min) / (t.max - t.min)) * 100);
}

export default function AchievementsPage() {
  const { address } = useAccount();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }

    Promise.all([
      fetch(`/api/me/achievements?address=${address}`).then((r) => r.json()),
      fetch(`/api/me/reputation?address=${address}`).then((r) => r.json()),
    ])
      .then(([achData, repData]) => {
        setAchievements(achData.achievements || []);
        setReputation(repData);
      })
      .finally(() => setLoading(false));
  }, [address]);

  if (!address) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Achievements</h1>
        <p className="text-(--text-muted)">Connect your wallet to view achievements.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Achievements</h1>
        <div className="animate-pulse space-y-4">
          <div className="h-24 rounded-xl bg-(--surface-card)" />
          <div className="h-16 rounded-xl bg-(--surface-card)" />
          <div className="h-16 rounded-xl bg-(--surface-card)" />
        </div>
      </div>
    );
  }

  const pct = reputation ? progressPercent(reputation.points) : 0;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Achievements</h1>

      {/* Reputation card */}
      {reputation && (
        <div className="rounded-xl border border-(--border-subtle) bg-(--surface-card) p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Star className="w-6 h-6 text-amber-400" />
              <div>
                <p className="font-semibold text-lg">
                  {reputation.levelName}
                </p>
                <p className="text-sm text-(--text-muted)">
                  Level {reputation.level} &middot; {reputation.points} pts
                </p>
              </div>
            </div>
            <div className="text-right text-sm text-(--text-muted)">
              <p>{reputation.completions} completions</p>
              <p>{reputation.victories} victories</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 rounded-full bg-(--surface-bg) overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Achievement list */}
      {achievements.length === 0 ? (
        <div className="text-center py-12 text-(--text-muted)">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No achievements yet.</p>
          <p className="text-sm mt-1">
            Complete challenges to earn soulbound tokens.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {achievements.map((a) => (
            <Link
              key={a.token_id}
              href={`/challenge/${a.challenge_id}`}
              className="flex items-center gap-3 p-4 rounded-xl border border-(--border-subtle) bg-(--surface-card) hover:bg-(--surface-hover) transition-colors"
            >
              {a.achievement_type === "victory" ? (
                <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
              ) : (
                <Award className="w-5 h-5 text-blue-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {a.achievement_type === "victory" ? "Victory" : "Completion"}
                  {a.title ? `: ${a.title}` : ` #${a.challenge_id}`}
                </p>
                <p className="text-xs text-(--text-muted)">
                  {new Date(a.minted_at).toLocaleDateString()}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-(--text-muted) shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
