// supabase/functions/send-push/index.ts
//
// Fired by a Supabase Database Webhook on INSERT/UPDATE to kv_store.
// Only acts when the row that changed is the "app:requests" key — it diffs
// the old and new request lists the same way the client's own
// refreshFromServer() does, and pushes the matching people:
//   - a brand-new request -> every admin
//   - a request leaving "pending" -> the person who made it
//
// Deploy:   supabase functions deploy send-push
// Secrets:  supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
//             VAPID_SUBJECT=mailto:you@example.com \
//             SUPABASE_SERVICE_ROLE_KEY=...
// (SUPABASE_URL is already provided automatically to every edge function.)

import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase REST ${path} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function getSubscriptionsFor(usernames: string[]) {
  if (usernames.length === 0) return [];
  const filter = usernames.map((u) => `"${u}"`).join(",");
  return await sb(`push_subscriptions?username=in.(${filter})&select=*`);
}

async function notify(subs: any[], payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, body);
      } catch (err: any) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          // subscription is dead (uninstalled, expired) — clean it up
          await sb(`push_subscriptions?id=eq.${row.id}`, { method: "DELETE" });
        } else {
          console.error("push send failed for", row.username, err);
        }
      }
    })
  );
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record; // new row
    const oldRecord = payload.old_record; // null on INSERT

    if (!record || record.key !== "app:requests") {
      return new Response("ignored", { status: 200 });
    }

    const newList: any[] = record?.value?.list || [];
    const oldList: any[] = oldRecord?.value?.list || [];
    const oldById = new Map(oldList.map((r) => [r.id, r]));

    const usersRow = await sb(`kv_store?key=eq.app:users&select=value`);
    const users: any[] = usersRow?.[0]?.value || [];
    const adminUsernames = users.filter((u) => u.role === "admin").map((u) => u.username);

    for (const r of newList) {
      const prev = oldById.get(r.id);
      if (!prev) {
        const subs = await getSubscriptionsFor(adminUsernames);
        await notify(subs, {
          title: `${r.requestedByName} requested stock`,
          body: `${r.qty} × ${r.productName}${r.note ? ` — ${r.note}` : ""}`,
        });
      } else if (prev.status === "pending" && r.status === "fulfilled") {
        const subs = await getSubscriptionsFor([r.requestedByUsername]);
        await notify(subs, {
          title: "StockFlow",
          body: `Your request for ${r.productName} was fulfilled`,
        });
      }
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});
