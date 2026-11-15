// Web Push subscription, done from the browser. The public VAPID key is
// safe to ship in the client; the private key stays in the Vercel env
// (VAPID_PRIVATE_KEY) and is only used by the server sender.
export const VAPID_PUBLIC_KEY =
  "BAId5t5kqjODQ9Y7c7UzqVpoQefOjZzT0uOxbxuflXWh2_PKN7SxdBAQjUy1jvS6Idz5fIxsWfPSM5ZwNmRRlbg";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribePush(token: string): Promise<"subscribed" | "denied" | "failed"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!response.ok) {
      await subscription.unsubscribe();
      return "failed";
    }
    return "subscribed";
  } catch {
    return "failed";
  }
}

export async function unsubscribePush(token: string): Promise<void> {
  try {
    const subscription = await getPushSubscription();
    if (!subscription) return;
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  } catch {
    /* the subscription is gone either way */
  }
}
