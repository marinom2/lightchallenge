"use client";

import { useEffect, useRef, useCallback } from "react";

/* ── Props ────────────────────────────────────────────────────────────────── */

interface ScrollCanvasProps {
  /** Path prefix, e.g. "/frames/orbit/frame_" */
  framePath: string;
  /** Total number of frames */
  frameCount: number;
  /** Number of zero-padded digits in filename, e.g. 4 → frame_0001.webp */
  padDigits?: number;
  /** File extension */
  ext?: string;
  /** Native width of frames */
  width: number;
  /** Native height of frames */
  height: number;
  /** How many viewports of scroll distance to map the animation across */
  scrollSpan?: number;
  /** CSS class on the outer (tall) container */
  className?: string;
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function ScrollCanvas({
  framePath,
  frameCount,
  padDigits = 4,
  ext = "webp",
  width,
  height,
  scrollSpan = 3,
  className = "",
}: ScrollCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);
  const currentFrameRef = useRef(0);
  const rafRef = useRef(0);

  /* ── Build frame URL ───────────────────────────────────────────────────── */
  const frameUrl = useCallback(
    (i: number) => {
      const num = String(i + 1).padStart(padDigits, "0");
      return `${framePath}${num}.${ext}`;
    },
    [framePath, padDigits, ext],
  );

  /* ── Preload frames ────────────────────────────────────────────────────── */
  useEffect(() => {
    const imgs: (HTMLImageElement | null)[] = new Array(frameCount).fill(null);
    imagesRef.current = imgs;

    // Priority: load first 30 frames immediately, then rest
    const loadFrame = (i: number) => {
      const img = new Image();
      img.src = frameUrl(i);
      img.onload = () => {
        imgs[i] = img;
        // Draw first frame once loaded
        if (i === 0 && canvasRef.current) {
          const ctx = canvasRef.current.getContext("2d");
          if (ctx) ctx.drawImage(img, 0, 0, width, height);
        }
      };
    };

    // First batch: frames 0-29 (immediate)
    const firstBatch = Math.min(30, frameCount);
    for (let i = 0; i < firstBatch; i++) loadFrame(i);

    // Second batch: rest (staggered to avoid network congestion)
    let idx = firstBatch;
    const interval = setInterval(() => {
      if (idx >= frameCount) {
        clearInterval(interval);
        return;
      }
      // Load 5 at a time
      const end = Math.min(idx + 5, frameCount);
      for (let i = idx; i < end; i++) loadFrame(i);
      idx = end;
    }, 50);

    return () => clearInterval(interval);
  }, [frameCount, frameUrl, width, height]);

  /* ── Scroll-driven rendering ───────────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const rect = container.getBoundingClientRect();
      const containerHeight = container.offsetHeight;
      const viewportHeight = window.innerHeight;

      // Progress: 0 when container top hits viewport top,
      // 1 when container bottom reaches viewport bottom
      const scrollableDistance = containerHeight - viewportHeight;
      const scrolled = -rect.top;
      const progress = Math.max(0, Math.min(1, scrolled / scrollableDistance));

      const frameIndex = Math.min(
        Math.floor(progress * frameCount),
        frameCount - 1,
      );

      if (frameIndex !== currentFrameRef.current) {
        currentFrameRef.current = frameIndex;
        const img = imagesRef.current[frameIndex];
        if (img) {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
        }
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [frameCount, width, height]);

  return (
    <div
      ref={containerRef}
      className={`scroll-canvas ${className}`}
      style={{ height: `${scrollSpan * 100}vh` }}
    >
      <div className="scroll-canvas__sticky">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="scroll-canvas__canvas"
        />
      </div>
    </div>
  );
}
