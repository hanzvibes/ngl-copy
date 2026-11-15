// Uploads voice notes and reply photos to the public `ngl-media` bucket.
// Anyone may upload (voice notes come from anonymous senders); files are
// capped at 5 MB client-side and served back through the public URL.
import { getSupabaseBrowserClient } from "./supabase-browser";

const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

export async function uploadMedia(file: File, kind: "audio" | "image"): Promise<string> {
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error("File terlalu besar (maksimal 5 MB).");
  }
  const supabase = getSupabaseBrowserClient();
  const rawExt = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ext = kind === "audio" ? (rawExt === "webm" || rawExt === "mp4" ? rawExt : "webm") : rawExt || "jpg";
  const path = `${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("ngl-media").upload(path, file, {
    contentType: file.type || (kind === "audio" ? "audio/webm" : "image/jpeg"),
    upsert: false,
  });
  if (error) throw new Error("Upload gagal. Coba lagi.");
  const { data } = supabase.storage.from("ngl-media").getPublicUrl(path);
  return data.publicUrl;
}
