"use client";

import * as React from "react";

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-(--border) ${className}`} aria-hidden />;
}

export function HeroSummarySkeleton() {
  return (
    <div className="hero-banner relative overflow-hidden rounded-2xl">
      <div className="relative z-10 p-3 sm:p-4 space-y-3">
        <SkeletonLine className="h-3 w-40" />
        <SkeletonLine className="h-10 w-56" />
        <div className="grid grid-cols-2 gap-2">
          <SkeletonLine className="h-16 w-full" />
          <SkeletonLine className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}

export function PrimaryActionSkeleton() {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="w-full space-y-2">
          <SkeletonLine className="h-4 w-40" />
          <SkeletonLine className="h-3 w-64" />
        </div>
      </div>
      <div className="panel-body">
        <SkeletonLine className="h-10 w-full" />
        <div className="mt-2">
          <SkeletonLine className="h-9 w-28" />
        </div>
      </div>
    </div>
  );
}
