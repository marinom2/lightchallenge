"use client";

import { useState } from "react";
import AdminPageHeader from "../../components/AdminPageHeader";
import { useAdmin } from "../../components/AdminContext";
import { Panel, Card, Field } from "../../components/ui";
import { okAddr } from "../../lib/utils";

export default function ProtocolPage() {
  const { cpWrite } = useAdmin();
  const [addr, setAddr] = useState("");

  const doSet = () => {
    const a = okAddr(addr);
    if (!a) return;
    cpWrite("setProtocol", [a], `Protocol safe set to ${a}`);
  };

  return (
    <>
      <AdminPageHeader
        title="Protocol Safe"
        description="Set the protocol multisig/safe address for fee collection"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Config", href: "/admin/config" },
          { label: "Protocol" },
        ]}
      />
      <Panel title="Set Protocol Address">
        <Card title="Protocol Safe Address">
          <Field label="Address (0x…)">
            <input className="input" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x…" />
          </Field>
          <button className="btn btn-primary btn-sm" onClick={doSet} disabled={!okAddr(addr)}>
            Set Protocol Safe
          </button>
        </Card>
      </Panel>
    </>
  );
}
