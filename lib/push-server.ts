// Server-side Web Push sender. Reads the owner's subscriptions from
// ngl_push_subscriptions and sends one notification per device. Silently
// does nothing when the VAPID keys aren't configured yet (the owner adds
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in the Vercel dashboard).
import * as webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("https://ngl-copy-five.vercel.app", pub, priv);
  configured = true;
  return true;
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  if (!configure()) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase
    .from("ngl_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!data?.length) return;
  await Promise.all(
    data.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (e) {
        // The device uninstalled the app or revoked push: drop the dead row.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          await supabase.from("ngl_push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }),
  );
}
