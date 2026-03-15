"use client";

import React, { useState } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
import { keccak256, toBytes, type Abi } from "viem";
// EventChallengeRouter address (not in main ADDR — loaded separately)
import AdminPageHeader from "../components/AdminPageHeader";
import { useAdmin } from "../components/AdminContext";
import { Panel, Card, Field } from "../components/ui";
import { okAddr } from "../lib/utils";

export default function EventsPage() {
  const { push, setBusy } = useAdmin();
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // Register event
  const [eventTitle, setEventTitle] = useState("");
  const [customEventId, setCustomEventId] = useState("");

  // Add outcome
  const [outcomeEventId, setOutcomeEventId] = useState("");
  const [outcomeName, setOutcomeName] = useState("");
  const [outcomeChallengeId, setOutcomeChallengeId] = useState("");
  const [outcomeSubject, setOutcomeSubject] = useState("");

  // Set URI
  const [uriEventId, setUriEventId] = useState("");
  const [uri, setUri] = useState("");

  const ROUTER_ADDR = "0x4c523C1eBdcD8FAAA27808f01F3Ec00B98Fb0f2D" as `0x${string}`;
  const [routerAbi, setRouterAbi] = useState<Abi | null>(null);

  // Try to load EventChallengeRouter ABI dynamically
  React.useEffect(() => {
    fetch("/abi/EventChallengeRouter.abi.json")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setRouterAbi(Array.isArray(data) ? data : data.abi); })
      .catch(() => {});
  }, []);

  const routerWrite = async (fn: string, args: any[], msg: string) => {
    if (!routerAbi) { push("EventChallengeRouter ABI not loaded", "bad"); return; }
    try {
      setBusy("Sending transaction…");
      const tx = await writeContractAsync({
        address: ROUTER_ADDR,
        abi: routerAbi,
        functionName: fn as any,
        args,
      });
      if (pc) await pc.waitForTransactionReceipt({ hash: tx });
      setBusy(null);
      push(msg, "ok");
    } catch (e: any) {
      setBusy(null);
      push(e?.shortMessage || e?.message || "Failed", "bad");
    }
  };

  const doRegister = () => {
    const id = customEventId || keccak256(toBytes(eventTitle.trim()));
    routerWrite("registerEvent", [id, eventTitle.trim()], `Event registered: ${eventTitle}`);
  };

  const doAddOutcome = () => {
    const subject = okAddr(outcomeSubject);
    if (!subject) return;
    routerWrite(
      "addOutcome",
      [outcomeEventId, outcomeName.trim(), BigInt(outcomeChallengeId || "0"), subject],
      `Outcome "${outcomeName}" added`
    );
  };

  const doSetUri = () => {
    routerWrite("setEventURI", [uriEventId, uri.trim()], "Event URI updated");
  };

  const hasRouterAbi = !!routerAbi;

  return (
    <>
      <AdminPageHeader
        title="Event Management"
        description="Register events, add outcomes, and set URIs on EventChallengeRouter"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Events" }]}
      />

      {!hasRouterAbi && (
        <div className="panel" style={{ marginBottom: "var(--lc-space-4)", borderColor: "var(--lc-warning)" }}>
          <div className="panel-body" style={{ padding: "var(--lc-space-3) var(--lc-space-4)", fontSize: "var(--lc-text-small)", color: "var(--lc-text-muted)" }}>
            EventChallengeRouter ABI not loaded. Ensure the contract is deployed and ABI is in <code>public/abi/</code>.
          </div>
        </div>
      )}

      <div className="space-y-6">
        <Panel title="Register Event">
          <Card title="New Event">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Event Title">
                <input className="input" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="e.g., Weekend Championship" />
              </Field>
              <Field label="Custom Event ID (optional, auto-derived from title)">
                <input className="input mono" value={customEventId} onChange={(e) => setCustomEventId(e.target.value)} placeholder="0x… (bytes32)" />
              </Field>
            </div>
            <button className="btn btn-primary btn-sm" onClick={doRegister} disabled={!eventTitle.trim()}>
              Register Event
            </button>
          </Card>
        </Panel>

        <Panel title="Add Outcome">
          <Card title="Link Challenge Outcome to Event">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Event ID (bytes32)">
                <input className="input mono" value={outcomeEventId} onChange={(e) => setOutcomeEventId(e.target.value)} placeholder="0x…" />
              </Field>
              <Field label="Outcome Name">
                <input className="input" value={outcomeName} onChange={(e) => setOutcomeName(e.target.value)} placeholder="e.g., Team A Wins" />
              </Field>
              <Field label="Challenge ID">
                <input className="input" value={outcomeChallengeId} onChange={(e) => setOutcomeChallengeId(e.target.value)} placeholder="42" />
              </Field>
              <Field label="Subject Address">
                <input className="input mono" value={outcomeSubject} onChange={(e) => setOutcomeSubject(e.target.value)} placeholder="0x…" />
              </Field>
            </div>
            <button className="btn btn-primary btn-sm" onClick={doAddOutcome} disabled={!outcomeEventId || !outcomeName.trim() || !okAddr(outcomeSubject)}>
              Add Outcome
            </button>
          </Card>
        </Panel>

        <Panel title="Set Event URI">
          <Card title="Metadata URI">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Event ID (bytes32)">
                <input className="input mono" value={uriEventId} onChange={(e) => setUriEventId(e.target.value)} placeholder="0x…" />
              </Field>
              <Field label="URI">
                <input className="input" value={uri} onChange={(e) => setUri(e.target.value)} placeholder="ipfs://… or https://…" />
              </Field>
            </div>
            <button className="btn btn-primary btn-sm" onClick={doSetUri} disabled={!uriEventId || !uri.trim()}>
              Set URI
            </button>
          </Card>
        </Panel>
      </div>
    </>
  );
}
