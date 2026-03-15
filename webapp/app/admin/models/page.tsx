"use client";

import AdminPageHeader from "../components/AdminPageHeader";
import { ModelsPanel } from "../panels/ModelsPanel";

export default function ModelsPage() {
  return (
    <>
      <AdminPageHeader
        title="Models & Templates"
        description="Manage AIVM model catalog and challenge templates"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Models & Templates" }]}
      />
      <ModelsPanel />
    </>
  );
}
