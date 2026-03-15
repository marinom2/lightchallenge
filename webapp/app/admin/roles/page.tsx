"use client";

import AdminPageHeader from "../components/AdminPageHeader";
import { RolesPanel } from "../panels/RolesPanel";

export default function RolesPage() {
  return (
    <>
      <AdminPageHeader
        title="Role Management"
        description="Grant and revoke Treasury roles (Operator, Sweeper)"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Roles" }]}
      />
      <RolesPanel />
    </>
  );
}
