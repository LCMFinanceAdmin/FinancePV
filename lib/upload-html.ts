import type { SupabaseClient } from "@supabase/supabase-js";

// Uploads an HTML document to Supabase Storage and returns its public URL.
// Bypasses supabase-js's storage .upload() wrapper on purpose: passing
// `{ contentType: "text/html" }` (and a Blob constructed with that same
// type) did not stick — the object ended up stored and served as
// text/plain regardless, which made every browser show the raw source
// instead of rendering the page. A raw request gives full, unambiguous
// control over the Content-Type header actually sent.
export async function uploadHtmlDoc(supabase: SupabaseClient, bucket: string, path: string, html: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !anonKey) throw new Error("Supabase config missing");

  const url = `${base}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/html",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": anonKey,
      "x-upsert": "true",
    },
    body: html,
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Upload failed (${resp.status}): ${detail.slice(0, 200)}`);
  }
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
  return publicUrl;
}
