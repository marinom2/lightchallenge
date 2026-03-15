"use client";

import { useReadContract } from "wagmi";
import { ABI, ADDR } from "@/lib/contracts";
import AdminPageHeader from "../../components/AdminPageHeader";
import { useAdmin } from "../../components/AdminContext";
import { FeesPanel } from "../../panels/FeesPanel";

export default function FeesPage() {
  const { cpWrite } = useAdmin();

  const { data: feeCaps } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "feeCaps" }) as { data?: { forfeitFeeMaxBps: bigint; cashbackMaxBps: bigint } };
  const { data: feeConfig } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "feeConfig" }) as { data?: { forfeitFeeBps: bigint; protocolBps: bigint; creatorBps: bigint; cashbackBps: bigint } };

  return (
    <>
      <AdminPageHeader
        title="Fee Configuration"
        description="Fee caps and distribution settings"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Config", href: "/admin/config" },
          { label: "Fees" },
        ]}
      />
      <FeesPanel
        caps={{ forfeit: feeCaps?.forfeitFeeMaxBps, cashback: feeCaps?.cashbackMaxBps }}
        cfg={{ forfeit: feeConfig?.forfeitFeeBps, protocol: feeConfig?.protocolBps, creator: feeConfig?.creatorBps, cashback: feeConfig?.cashbackBps }}
        onWrite={cpWrite}
      />
    </>
  );
}
