import { corsHeaders } from "../_shared/cors.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { gazette_url } = await req.json() as { gazette_url: string };
    if (!gazette_url) return json({ error: "gazette_url required" }, 400);
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not configured" }, 500);

    // Fetch the gazette file
    const fileResp = await fetch(gazette_url);
    if (!fileResp.ok) return json({ error: "Could not fetch gazette file" }, 400);

    const contentType = fileResp.headers.get("content-type") ?? "";
    const isPdf = contentType.includes("pdf") || gazette_url.toLowerCase().endsWith(".pdf");
    const isImage = contentType.startsWith("image/") ||
      /\.(jpg|jpeg|png|webp)$/i.test(gazette_url);

    if (!isPdf && !isImage) {
      return json({ error: "Unsupported file type — upload a PDF or image" }, 400);
    }

    const fileBuffer = await fileResp.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    // Convert to base64
    let base64 = "";
    const chunkSize = 8192;
    for (let i = 0; i < fileBytes.length; i += chunkSize) {
      base64 += String.fromCharCode(...fileBytes.slice(i, i + chunkSize));
    }
    base64 = btoa(base64);

    const mimeType = isPdf
      ? "application/pdf"
      : (contentType.startsWith("image/") ? contentType : "image/jpeg");

    const prompt = `This document is a Malaysian government gazette, circular, or notice regarding EPF (KWSP), SOCSO (PERKESO), or EIS (SIP) statutory contribution rates.

Extract the contribution rates and return ONLY a valid JSON object with these exact fields (use null for any field not found in this document):

{
  "epf_ee_under60": <EPF employee rate % for employees under 60, e.g. 11>,
  "epf_er_under60": <EPF employer rate % for employees under 60, e.g. 13>,
  "epf_ee_over60": <EPF employee rate % for employees aged 60 or above / on contract, e.g. 0>,
  "epf_er_over60": <EPF employer rate % for employees aged 60 or above / on contract, e.g. 4>,
  "epf_ee_orang_asli": <EPF employee rate % for Orang Asli, e.g. 11>,
  "epf_er_orang_asli": <EPF employer rate % for Orang Asli, e.g. 13>,
  "socso_ee": <SOCSO employee contribution rate %, typically 0.5>,
  "socso_er": <SOCSO employer contribution rate % (Employment Injury + Invalidity), typically 1.75>,
  "socso_er_over60": <SOCSO employer rate % for employees aged 60+ (Employment Injury Scheme only), typically 1.25>,
  "eis_rate": <EIS rate % applied to BOTH employee AND employer sides equally, typically 0.2>,
  "socso_ceiling": <SOCSO insured wage ceiling in RM, typically 6000>,
  "eis_ceiling": <EIS insured wage ceiling in RM, typically 6000>,
  "notes": <one sentence describing what this document is or what changed, max 120 chars>
}

Rules:
- Return rates as plain numbers (not fractions): 11 for 11%, not 0.11
- If SOCSO or EIS uses bracket tables, derive the effective percentage rate
- If a rate is unchanged or not mentioned, return null — do not guess
- Return ONLY the JSON object, no explanation text around it`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { maxOutputTokens: 512, temperature: 0 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return json({ error: `Gemini API error: ${response.status} — ${errText}` }, 502);
    }

    const geminiData = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return json({ error: "Could not extract rates from document", raw: rawText }, 422);

    const rates = JSON.parse(jsonMatch[0]);
    return json({ rates });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
