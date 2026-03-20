import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyWallet, requireAuth } from "@/lib/auth";

type InviteMethod = "email" | "wallet" | "steam";

type InvitePayload = {
  challengeId: number;
  method: InviteMethod;
  value: string;
};

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isWallet(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isSteam(value: string) {
  return /^[0-9]{5,32}$/.test(value);
}

function validate(body: Partial<InvitePayload>): string | null {
  if (!Number.isInteger(body.challengeId) || Number(body.challengeId) <= 0) {
    return "challengeId must be a positive integer.";
  }

  if (body.method !== "email" && body.method !== "wallet" && body.method !== "steam") {
    return "method must be one of: email, wallet, steam.";
  }

  const value = String(body.value || "").trim();
  if (!value) return "value is required.";

  if (body.method === "email" && !isEmail(value)) return "Invalid email address.";
  if (body.method === "wallet" && !isWallet(value)) return "Invalid wallet address.";
  if (body.method === "steam" && !isSteam(value)) return "Invalid Steam ID.";

  return null;
}

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is missing.");
  }
  return neon(url);
}

export async function POST(req: NextRequest) {
  try {
    // Auth: require any authenticated wallet (no subject check)
    const authWallet = await verifyWallet(req);
    const authErr = requireAuth(authWallet);
    if (authErr) return authErr;

    const body = (await req.json()) as Partial<InvitePayload>;
    const error = validate(body);

    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 400 });
    }

    const sql = db();
    const id = crypto.randomUUID();
    const challengeId = Number(body.challengeId);
    const method = body.method as InviteMethod;
    const value = String(body.value).trim();

    const inviterAddr = authWallet!.address.toLowerCase();

    // For wallet invites, process immediately (create notification + mark sent)
    // instead of waiting for the background worker to poll.
    if (method === "wallet") {
      // Get challenge title for the notification
      const titleRows = await sql`
        SELECT title FROM public.challenges WHERE id = ${challengeId}
      `;
      const challengeTitle = (titleRows as any)[0]?.title || `Challenge #${challengeId}`;
      const inviterLabel = `${inviterAddr.slice(0, 6)}…${inviterAddr.slice(-4)}`;

      // Insert as 'sent' directly
      await sql`
        INSERT INTO public.challenge_invites (
          id, challenge_id, method, value, status, inviter_wallet
        ) VALUES (
          ${id}, ${challengeId}, ${method}, ${value}, 'sent', ${inviterAddr}
        )
      `;

      // Create notification for the target wallet
      const notifId = crypto.randomUUID();
      const notifTitle = `You've been invited to "${challengeTitle}"`;
      const notifBody = `${inviterLabel} invited you to join "${challengeTitle}".`;
      const notifData = JSON.stringify({
        challengeId: String(challengeId),
        inviteId: id,
        deepLink: `lightchallengeapp://challenge/${challengeId}`,
      });

      await sql`
        INSERT INTO public.notifications (
          id, wallet, type, title, body, data, read, created_at
        ) VALUES (
          ${notifId}, lower(${value}), 'invite_received', ${notifTitle}, ${notifBody}, ${notifData}::jsonb, false, now()
        )
      `;

      return NextResponse.json({
        ok: true,
        invite: { id, challengeId, method, value, status: "sent" },
        message: "Invite sent.",
      });
    }

    // For email/steam: queue for background worker
    await sql`
      INSERT INTO public.challenge_invites (
        id, challenge_id, method, value, status, inviter_wallet
      ) VALUES (
        ${id}, ${challengeId}, ${method}, ${value}, 'queued', ${inviterAddr}
      )
    `;

    return NextResponse.json({
      ok: true,
      invite: { id, challengeId, method, value, status: "queued" },
      message: "Invite queued successfully.",
    });
  } catch (err) {
    console.error("[invites POST]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const sql = db();
    const challengeIdRaw = req.nextUrl.searchParams.get("challengeId");

    if (!challengeIdRaw) {
      const rows = await sql`
        select
          id,
          challenge_id as "challengeId",
          method,
          value,
          status,
          extract(epoch from created_at)::bigint as "createdAt"
        from public.challenge_invites
        order by created_at desc
        limit 100
      `;

      rows.forEach((r: any) => {
        if (r.value && r.value.includes("@")) {
          r.value = r.value.replace(/(.{2}).+@/, "$1***@");
        }
      });

      return NextResponse.json({ ok: true, invites: rows });
    }

    const challengeId = Number(challengeIdRaw);
    if (!Number.isInteger(challengeId) || challengeId <= 0) {
      return NextResponse.json(
        { ok: false, error: "challengeId must be a positive integer." },
        { status: 400 }
      );
    }

    const rows = await sql`
      select
        id,
        challenge_id as "challengeId",
        method,
        value,
        status,
        extract(epoch from created_at)::bigint as "createdAt"
      from public.challenge_invites
      where challenge_id = ${challengeId}
      order by created_at desc
    `;

    rows.forEach((r: any) => {
      if (r.value && r.value.includes("@")) {
        r.value = r.value.replace(/(.{2}).+@/, "$1***@");
      }
    });

    return NextResponse.json({ ok: true, invites: rows });
  } catch (err) {
    console.error("[invites GET]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}