"use client";
// Rasterise an SVG in the page so it can be embedded as a data URI.
//
// Lived in components/pv/pv-pdf-download.tsx, which imports @react-pdf/renderer
// and pdf-lib at module scope. Anything wanting the church logo therefore had
// to drag a PDF engine into its bundle — fine for the Download button, absurd
// for a page that only wants to show a logo on screen.

export async function svgToPngDataUri(svgPath: string, size = 200): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (ctx) { ctx.drawImage(img, 0, 0, size, size); }
      resolve(canvas.toDataURL("image/png"));
    };
    // Resolves rather than rejects: a missing logo is a cosmetic loss, and
    // every caller would otherwise need a try/catch to say so.
    img.onerror = () => resolve("");
    img.src = svgPath;
  });
}
