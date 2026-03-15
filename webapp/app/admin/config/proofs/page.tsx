"use client";

import { useReadContract } from "wagmi";
import { ABI, ADDR } from "@/lib/contracts";
import AdminPageHeader from "../../components/AdminPageHeader";
import { useAdmin } from "../../components/AdminContext";
import { ProofsPanel } from "../../panels/ProofsPanel";

export default function ProofsPage() {
  const { cpWrite } = useAdmin();

  const { data: proofTightenOnly } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "proofTightenOnly" });

  return (
    <>
      <AdminPageHeader
        title="Proof Settings"
        description="Proof verification mode configuration"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Config", href: "/admin/config" },
          { label: "Proofs" },
        ]}
      />
      <ProofsPanel
        current={{ tightenOnly: !!proofTightenOnly }}
        onWrite={cpWrite}
      />
    </>
  );
}
