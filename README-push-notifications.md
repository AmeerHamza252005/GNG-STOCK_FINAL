# Real OS notifications for StockFlow

Your app already popped a custom card + sound when it was **open**. What's
new here adds:

1. **A service worker (`sw.js`)** — routes notifications through the OS
   properly, which is what makes the native banner + sound show up on
   Windows/Mac/Android reliably, and is *required at all* on iOS.
2. **Real push** — a `push_subscriptions` table + a Supabase Edge Function
   so admins/requesters get notified even if StockFlow isn't open.

Two things you must do before this works — I can't do these for you since
they touch your Supabase project directly.

## 1. Create the table

Run `push_subscriptions.sql` in your Supabase SQL editor (same project as
`kv_store`).

## 2. Deploy the edge function

```
supabase functions deploy send-push
supabase secrets set \
  VAPID_PUBLIC_KEY="BMIB5xRHZLOAgT5807Y4Qz9LN5Wd4gv93ZFaa5dRpgSIh3PIx6hZqbvu2dC7vyXPbihOwKUTbb8gnN2wRrzoaXI" \
  VAPID_PRIVATE_KEY="OmhdMgPPiFXcGJQH4llDvgZJxyn-2zVtTgWksq-Xw6k" \
  VAPID_SUBJECT="mailto:you@yourcompany.com" \
  SUPABASE_SERVICE_ROLE_KEY="<service role key, from Settings → API>"
```

The public key is already dropped into `index.html`
(`VAPID_PUBLIC_KEY`) — you don't need to touch that. Keep the **private**
key only in the secret above; never put it in the HTML file.

Then in the Supabase dashboard: **Database → Webhooks → Create a new
webhook**
- Table: `kv_store`
- Events: `Insert`, `Update`
- Type: `Supabase Edge Function` → `send-push`

That's it — the function checks the row itself and only acts when the key
is `app:requests`, so it's safe to fire on every kv_store change.

## Files

| File | Where it goes |
|---|---|
| `index.html` | replaces your existing file |
| `sw.js` | same folder as `index.html`, must be served from the site root |
| `push_subscriptions.sql` | run once in the Supabase SQL editor |
| `supabase/functions/send-push/index.ts` | deploy with the Supabase CLI |

## Platform notes (worth knowing before you test)

- **Windows / Mac (Chrome, Edge, Firefox)** — works in a normal browser
  tab, no install needed. Permission prompt appears right after login.
- **Android (Chrome)** — works in a browser tab too, and even better if
  the person adds StockFlow to their home screen (Menu → Add to Home
  screen).
- **iPhone / iPad (Safari)** — Apple **only** allows web push for a PWA
  that's been added to the home screen (Share → Add to Home Screen), on
  iOS/iPadOS 16.4+. Opening it in a normal Safari tab will never show a
  permission prompt — this is an Apple platform restriction, not
  something fixable in code.
- **Desktop app installs** (Chrome "Install app") — same behavior as the
  browser tab, just in its own window.

Because of the iOS restriction, it's worth telling your team: "install
StockFlow to your home screen" if they're on iPhone/iPad and want
notifications at all.

## What happens without the backend piece

If you only ship the updated `index.html` + `sw.js` but skip steps 1–2,
notifications still work exactly as before — popping while the app is
open — just routed through the service worker instead of the raw
`Notification()` call, which is a bit more reliable and is what makes it
work on an installed iOS app. You just won't get notifications while the
app is fully closed until the table + function are wired up.
