"use client";

import { useState } from "react";
import AdminPageHeader from "../../components/AdminPageHeader";
import { useAdmin } from "../../components/AdminContext";
import { Panel, Card, Field } from "../../components/ui";
import { okAddr } from "../../lib/utils";

export default function ForwarderPage() {
  const { cpWrite } = useAdmin();
  const [addr, setAddr] = useState("");

  const doSet = () => {
    const a = okAddr(addr);
    if (!a) return;
    cpWrite("setTrustedForwarder", [a], `Trusted forwarder set to ${a}`);
  };

  return (
    <>
      <AdminPageHeader
        title="Trusted Forwarder"
        description="Configure EIP-2771 gasless transaction relay"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Config", href: "/admin/config" },
          { label: "Forwarder" },
        ]}
      />
      <Panel title="Set Trusted Forwarder">
        <Card title="Forwarder Address">
          <Field label="Address (0x…)">
            <input className="input" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x…" />
          </Field>
          <button className="btn btn-primary btn-sm" onClick={doSet} disabled={!okAddr(addr)}>
            Set Forwarder
          </button>
        </Card>
      </Panel>
    </>
  );
}
