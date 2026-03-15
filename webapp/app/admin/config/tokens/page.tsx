"use client";

import { useReadContract } from "wagmi";
import { ABI, ADDR } from "@/lib/contracts";
import AdminPageHeader from "../../components/AdminPageHeader";
import { useAdmin } from "../../components/AdminContext";
import { TokensPanel } from "../../panels/TokensPanel";

export default function TokensPage() {
  const { cpWrite } = useAdmin();

  const { data: useTokenAllowlist } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "useTokenAllowlist" });

  return (
    <>
      <AdminPageHeader
        title="Token Allowlist"
        description="Manage which tokens can be used in challenges"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Config", href: "/admin/config" },
          { label: "Tokens" },
        ]}
      />
      <TokensPanel
        current={{ useAllowlist: !!useTokenAllowlist }}
        onWrite={cpWrite}
      />
    </>
  );
}
