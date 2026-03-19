"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DotaIcon, CS2Icon, LoLIcon, ValorantIcon } from "./icons/BrandIcons";

/* ── Config ────────────────────────────────────────────────────────────────── */

interface OrbitGame {
  id: string;
  name: string;
  tag: string;
  icon: React.ReactNode;
  color: string;
  challenge: string;
  prize: string;
}

const GAMES: OrbitGame[] = [
  {
    id: "dota2",
    name: "Dota 2",
    tag: "DOTA",
    icon: <DotaIcon size={20} />,
    color: "#e74c3c",
    challenge: "10 Kills Challenge",
    prize: "$120",
  },
  {
    id: "cs2",
    name: "Counter-Strike 2",
    tag: "CS2",
    icon: <CS2Icon size={20} />,
    color: "#de9b35",
    challenge: "Ace Round",
    prize: "$85",
  },
  {
    id: "lol",
    name: "League of Legends",
    tag: "LOL",
    icon: <LoLIcon size={20} />,
    color: "#0bc4e2",
    challenge: "First Blood Race",
    prize: "$200",
  },
  {
    id: "val",
    name: "Valorant",
    tag: "VAL",
    icon: <ValorantIcon size={20} />,
    color: "#fd4556",
    challenge: "Clutch King",
    prize: "$150",
  },
];

const RX = 140; // Orbit X radius
const RY = 56; // Orbit Y radius (elliptical for 3D perspective)
const PERIOD = 30000; // 30s per full revolution
const CARD_INTERVAL = 8000; // 8s between cards
const CARD_SHOW = 5000; // 5s card visible

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function nodeStyle(i: number, angle: number = 0) {
  const a = angle + (i * Math.PI * 2) / 4;
  const x = Math.cos(a) * RX;
  const y = Math.sin(a) * RY;
  const depth = Math.sin(a); // -1 (back) to 1 (front)
  const scale = 0.78 + (depth + 1) * 0.14;
  const opacity = 0.5 + (depth + 1) * 0.25;
  return { x, y, scale, opacity, zIndex: depth > 0 ? 10 : 2 };
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function CompetitiveOrbit() {
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef(0);
  const t0Ref = useRef(0);
  const [activeCard, setActiveCard] = useState<number | null>(null);
  const [pulse, setPulse] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const h = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Orbit animation loop — updates transforms via refs (no re-renders)
  useEffect(() => {
    if (reduced) return;
    t0Ref.current = performance.now();

    const tick = (now: number) => {
      const angle = ((now - t0Ref.current) / PERIOD) * Math.PI * 2;
      nodeRefs.current.forEach((el, i) => {
        if (!el) return;
        const s = nodeStyle(i, angle);
        el.style.transform = `translate(${s.x}px, ${s.y}px) scale(${s.scale})`;
        el.style.opacity = String(s.opacity);
        el.style.zIndex = String(s.zIndex);
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [reduced]);

  // Challenge card cycle
  useEffect(() => {
    if (reduced) return;
    let idx = 0;

    const show = () => {
      setActiveCard(idx);
      setPulse(true);
      setTimeout(() => setPulse(false), 700);
      setTimeout(() => setActiveCard(null), CARD_SHOW);
      idx = (idx + 1) % GAMES.length;
    };

    const first = setTimeout(show, 3500);
    const interval = setInterval(show, CARD_INTERVAL);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [reduced]);

  return (
    <div className="orbit" aria-hidden="true">
      {/* Decorative orbit rings */}
      <div className="orbit__ring orbit__ring--1" />
      <div className="orbit__ring orbit__ring--2" />
      <div className="orbit__ring orbit__ring--3" />

      {/* Central core */}
      <div className={`orbit__core${pulse ? " orbit__core--pulse" : ""}`}>
        <div className="orbit__core-glow" />
      </div>

      {/* Pulse ring on card activation */}
      <AnimatePresence>
        {pulse && (
          <motion.div
            className="orbit__pulse-ring"
            initial={{ scale: 0.4, opacity: 0.5 }}
            animate={{ scale: 2.8, opacity: 0 }}
            exit={{}}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* Orbiting game nodes */}
      {GAMES.map((game, i) => {
        const init = nodeStyle(i);
        return (
          <div
            key={game.id}
            ref={(el) => {
              nodeRefs.current[i] = el;
            }}
            className="orbit__node"
            style={{
              transform: `translate(${init.x}px, ${init.y}px) scale(${init.scale})`,
              opacity: init.opacity,
              zIndex: init.zIndex,
            }}
          >
            <div className="orbit__node-icon">{game.icon}</div>
            <span className="orbit__node-tag">{game.tag}</span>
          </div>
        );
      })}

      {/* Floating challenge card */}
      <AnimatePresence mode="wait">
        {activeCard !== null && (
          <motion.div
            key={GAMES[activeCard].id}
            className="orbit__card"
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{
              duration: 0.4,
              ease: [0.2, 0.8, 0.2, 1] as const,
            }}
          >
            <span
              className="orbit__card-game"
              style={{ color: GAMES[activeCard].color }}
            >
              {GAMES[activeCard].name}
            </span>
            <div className="orbit__card-title">
              {GAMES[activeCard].challenge}
            </div>
            <div className="orbit__card-meta">
              <span className="orbit__card-prize">
                Prize: {GAMES[activeCard].prize}
              </span>
              <span className="orbit__card-joined">
                <span className="orbit__card-dots">
                  <span />
                  <span />
                  <span />
                </span>
                12 joined
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
