"use client";

import AdminPageHeader from "../components/AdminPageHeader";
import { useAdmin } from "../components/AdminContext";
import { ChallengesPanel } from "../panels/ChallengesPanel";

export default function ChallengesPage() {
  const { cpWrite } = useAdmin();

  return (
    <>
      <AdminPageHeader
        title="Challenge Management"
        description="Pause, cancel, and configure challenges"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Challenges" }]}
      />
      <ChallengesPanel onWrite={cpWrite} />
    </>
  );
}
