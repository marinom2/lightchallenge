"use client";

import { useReadContract } from "wagmi";
import { ABI, ADDR } from "@/lib/contracts";
import AdminPageHeader from "../../components/AdminPageHeader";
import { useAdmin } from "../../components/AdminContext";
import { GovernancePanel } from "../../panels/GovernancePanel";

export default function GovernancePage() {
  const { cpWrite } = useAdmin();

  const { data: globalPaused } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "globalPaused" });
  const { data: minLeadTime } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "minLeadTime" });
  const { data: maxLeadTime } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "maxLeadTime" });

  return (
    <>
      <AdminPageHeader
        title="Governance"
        description="Global pause, lead time bounds, admin transfer"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Config", href: "/admin/config" },
          { label: "Governance" },
        ]}
      />
      <GovernancePanel
        values={{
          globalPaused: !!globalPaused,
          minLeadTime: minLeadTime as bigint | undefined,
          maxLeadTime: maxLeadTime as bigint | undefined,
        }}
        onWrite={cpWrite}
      />
    </>
  );
}
