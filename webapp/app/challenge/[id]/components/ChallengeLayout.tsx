"use client";

import MobileLayout from "./MobileLayout";
import DesktopLayout from "./DesktopLayout";
import CompletionMoment from "./CompletionMoment";
import { useEffect, useState } from "react";

function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}

export default function ChallengeLayout({
  header,
  primaryAction,
  join,
  details,
  showCompletion,
}: any) {
  const isMobile = useIsMobile();

  return (
    <>
      <CompletionMoment show={showCompletion} />

      {isMobile ? (
        <MobileLayout
          header={header}
          primaryAction={primaryAction}
          join={join}
          details={details}
        />
      ) : (
        <DesktopLayout
          header={header}
          primaryAction={primaryAction}
          join={join}
          details={details}
        />
      )}
    </>
  );
}
