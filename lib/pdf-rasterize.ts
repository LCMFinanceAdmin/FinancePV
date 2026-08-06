// Renders the pages of a PDF to PNG data URIs.
//
// The print view embeds PDF attachments in an <iframe>. That is fine on screen,
// but a browser's print engine captures the PDF *viewer widget* rather than the
// document inside it — so printing a payment voucher produced a page showing a
// miniature PDF reader instead of the payslip. Turning each page into an image
// makes the attachment part of the page itself, so it prints in full.

/** A rendered page, sized so the print stylesheet can preserve its shape. */
export interface RasterPage {
  dataUri: string;
  width: number;
  height: number;
}

/**
 * @param scale Render multiplier. 2 keeps small print legible on paper without
 *              producing data URIs large enough to choke the print window.
 */
export async function rasterizePdf(url: string, scale = 2): Promise<RasterPage[]> {
  const pdfjs = await import("pdfjs-dist");
  // The worker is served from the same origin by Next, so no CDN is involved
  // and the strict CSP on this app is satisfied.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch attachment (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: RasterPage[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    // Payslips are mostly white; without this, transparent PDF backgrounds
    // rasterize to black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    pages.push({
      dataUri: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    });
  }

  await doc.cleanup();
  return pages;
}

/** Rasterizes several PDFs, skipping any that fail rather than losing them all. */
export async function rasterizePdfs(
  urls: string[],
  scale = 2,
): Promise<{ url: string; pages: RasterPage[] }[]> {
  const out: { url: string; pages: RasterPage[] }[] = [];
  for (const url of urls) {
    try {
      out.push({ url, pages: await rasterizePdf(url, scale) });
    } catch (err) {
      console.warn("Could not rasterize attachment", url, err);
      out.push({ url, pages: [] });
    }
  }
  return out;
}
