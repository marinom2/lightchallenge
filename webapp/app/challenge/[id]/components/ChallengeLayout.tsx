"use client";

import CompletionMoment from "./CompletionMoment";

export default function ChallengeLayout({
  children,
  showCompletion,
}: {
  children: React.ReactNode;
  showCompletion?: boolean;
}) {
  return (
    <>
      <CompletionMoment show={showCompletion ?? false} />
      <div className="cd-page">
        {children}
      </div>
    </>
  );
}
