"use client";

import AdminPageHeader from "../components/AdminPageHeader";
import { TreasuryPanel } from "../panels/TreasuryPanel";

export default function TreasuryPage() {
  return (
    <>
      <AdminPageHeader
        title="Treasury"
        description="Manage grants, sweeps, and allowances"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Treasury" }]}
      />
      <TreasuryPanel />
    </>
  );
}
