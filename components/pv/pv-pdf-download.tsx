"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, Eye, X } from "lucide-react";
import type { PV, PVApproval } from "@/lib/types";
import { getLOATier, roleLabel } from "@/lib/utils";
import {
  pdf, Document, Page, Text, View, StyleSheet, Image,
} from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";

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
    img.onerror = () => resolve("");
    img.src = svgPath;
  });
}

const BANK_ABBR: Record<string, string> = {
  "maybank": "MBB", "cimb": "CIMB", "cimb bank": "CIMB",
  "public bank": "PBB", "rhb": "RHB", "hong leong bank": "HLB",
  "ambank": "AMB", "bank islam": "BIMB", "bank rakyat": "BPR",
  "ocbc": "OCBC", "standard chartered": "SCB", "affin bank": "AFFIN",
  "alliance bank": "ABB", "uob": "UOB", "bsn": "BSN",
};

function getBankAbbr(name: string) {
  return BANK_ABBR[(name || "").toLowerCase().trim()] ?? name;
}
function fmt(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// Font sizes: base +3pt from original
const s = StyleSheet.create({
  page:      { fontFamily: "Helvetica", fontSize: 12, padding: "10mm", color: "#000" },
  row:       { flexDirection: "row" },
  bold:      { fontFamily: "Helvetica-Bold" },
  border:    { border: "1pt solid #000" },
  borderT:   { borderTop: "1pt solid #000" },
  borderB:   { borderBottom: "1pt solid #000" },
  cell:      { padding: "4pt 6pt", border: "1pt solid #000" },
  headerBg:  { backgroundColor: "#f0f0f0" },
  center:    { textAlign: "center" },
  right:     { textAlign: "right" },
  tiny:      { fontSize: 10 },
  small:     { fontSize: 11 },
  finHeader: { backgroundColor: "#000", color: "#fff", textAlign: "center", fontSize: 11, fontFamily: "Helvetica-Bold", padding: "3pt" },
});

function SigBox({ approval, label, subtitle }: { approval?: PVApproval; label: string; subtitle?: string }) {
  return (
    <View style={{ flex: 1, padding: "6pt 8pt" }}>
      <View style={[s.borderB, { paddingBottom: 2, marginBottom: 4 }]}>
        <Text style={[s.bold, s.tiny]}>{label}</Text>
        {subtitle ? <Text style={s.tiny}>{subtitle}</Text> : null}
      </View>
      {approval?.signature_data ? (
        <Image src={approval.signature_data} style={{ height: 40, objectFit: "contain", objectPositionX: "left" }} />
      ) : (
        <View style={{ height: 40 }} />
      )}
      <View style={[s.borderT, { paddingTop: 3 }]}>
        {approval ? (
          <>
            <Text style={[s.bold, s.tiny]}>{approval.name || approval.email}</Text>
            <Text style={s.tiny}>Date: {fmtDate(approval.timestamp)}</Text>
          </>
        ) : (
          <Text style={[s.tiny, { color: "#bbb" }]}>Pending</Text>
        )}
      </View>
    </View>
  );
}

function PaidBanner({ pv }: { pv: PV }) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 12,
      border: "2pt solid #16a34a", borderRadius: 6,
      backgroundColor: "#f0fdf4", padding: "6pt 10pt",
    }}>
      <View style={{
        border: "3pt solid #16a34a", borderRadius: 4,
        padding: "4pt 10pt", transform: "rotate(-8deg)",
      }}>
        <Text style={{ fontSize: 19, fontFamily: "Helvetica-Bold", color: "#16a34a", letterSpacing: 3 }}>PAID</Text>
      </View>
      <View>
        <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: "#166534" }}>Payment Completed</Text>
        <Text style={{ fontSize: 11, color: "#15803d", marginTop: 2 }}>
          {[
            pv.payment_method,
            pv.payment_ref && `Ref: ${pv.payment_ref}`,
            pv.paid_at && fmtDate(pv.paid_at),
          ].filter(Boolean).join("  ·  ")}
        </Text>
        {pv.paid_by ? (
          <Text style={{ fontSize: 11, color: "#15803d", marginTop: 1 }}>
            Marked paid by {pv.paid_by} (Finance Executive)
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function PVDocument({ pv, logoDataUri }: { pv: PV; logoDataUri?: string }) {
  const items = pv.line_items ?? [];
  const approvals: PVApproval[] = pv.approvals ?? [];
  const total = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0) || pv.amount;
  const padRows = Math.max(0, 5 - items.length);
  const loa = getLOATier(pv.amount, pv.payment_type);

  const bankLine = pv.payment_method?.toLowerCase() === "jompay"
    ? `Biller: ${pv.biller_code ?? "—"} | Ref: ${pv.ref_no ?? "—"}`
    : pv.payee_bank_name
      ? `${getBankAbbr(pv.payee_bank_name)}${pv.payee_bank_acct ? " | " + pv.payee_bank_acct : ""}`
      : "";

  const projectLabel = [pv.ministry, pv.dept, pv.project].filter(Boolean).join(" / ");

  const financeApproval = approvals.find(a => a.role === "FINANCE_ADMIN" && a.action === "APPROVED");
  const gmApproval      = approvals.find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED");
  const sigApprovals    = approvals.filter(a =>
    ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED"
  );
  const excoApproval    = approvals.find(a => a.role === "MINISTRY_HEAD" && a.action === "APPROVED");

  const ministryVerified =
    String(pv.ministry_verified ?? "").toUpperCase() === "YES" ||
    String(pv.head_verified ?? "").toUpperCase() === "YES" ||
    !!excoApproval;

  const isPaid = pv.status === "PAID";

  const financeRoles = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];
  const isFinanceExecPV = financeRoles.includes(pv.submitted_by_role ?? "");
  const isExcoPV = pv.submitted_by_role === "MINISTRY_HEAD";
  const showApplicantSig = !isFinanceExecPV && !isExcoPV;
  const showExcoSection = true;

  // Ref shown in the FOR OFFICE USE ONLY box — Finance Exec can override via office_ref
  const displayRef = pv.office_ref?.trim() || pv.pv_no;

  return (
    <Document title={`PV ${pv.pv_no}`}>
      <Page size="A4" style={s.page}>

        {isPaid && <View style={{ marginBottom: 8 }}><PaidBanner pv={pv} /></View>}

        {/* Row 1: Logo + Office Use */}
        <View style={[s.row, { marginBottom: 6 }]}>
          <View style={{ flex: 1 }}>
            <View style={s.row}>
              <View style={{ width: 55 }}>
                {logoDataUri ? <Image src={logoDataUri} style={{ width: 50, height: 50 }} /> : null}
              </View>
              <View style={{ flex: 1, paddingLeft: 6 }}>
                <Text style={[s.bold, { fontSize: 14 }]}>LUTHERAN CHURCH IN MALAYSIA</Text>
                <Text style={[s.tiny, { color: "#555" }]}>(ROS: PPM-001-10-09031964)</Text>
                <Text style={[s.tiny, { marginTop: 2 }]}>Luther Centre, No. 6, Jalan Utara, 46200 Petaling Jaya, Selangor</Text>
                <Text style={s.tiny}>Tel: 03-7956 5992  Fax: 03-7957 6953  Email: finance@lcm.org.my</Text>
              </View>
            </View>
          </View>
          <View style={[s.border, { width: 140, padding: "5pt 8pt", alignItems: "center" }]}>
            <Text style={[s.bold, s.tiny, { borderBottom: "1pt solid #000", width: "100%", textAlign: "center", paddingBottom: 2, marginBottom: 3 }]}>FOR OFFICE USE ONLY</Text>
            {pv.pv_type === "BAM" ? (
              <View style={{ alignItems: "center" }}>
                <Text style={[s.bold, { fontSize: 22, letterSpacing: 2 }]}>BAM</Text>
                <Text style={[s.tiny, { borderTop: "1pt solid #000", width: "100%", textAlign: "center", paddingTop: 2, marginTop: 2 }]}>(MAYBANK)</Text>
              </View>
            ) : pv.pv_label ? (
              <Text style={[s.bold, { fontSize: 18, letterSpacing: 1 }]}>{pv.pv_label.split(" - ")[0]}</Text>
            ) : (
              <Text style={[s.tiny, { color: "#bbb", fontStyle: "italic" }]}>Not labelled</Text>
            )}
            <Text style={[s.tiny, { marginTop: 4, alignSelf: "flex-start" }]}>Ref: <Text style={s.bold}>{displayRef}</Text></Text>
            <Text style={[s.tiny, { marginTop: 3, alignSelf: "flex-start" }]}>A/C Code: <Text style={s.bold}>{pv.accounting_code ?? ""}</Text></Text>
          </View>
        </View>

        {/* Title — English only */}
        <Text style={[s.bold, s.center, { fontSize: 13, marginBottom: 1 }]}>LUTHERAN CHURCH IN MALAYSIA</Text>
        <Text style={[s.center, { fontSize: 12, marginBottom: 6 }]}>(REIMBURSEMENT CLAIM FORM / PAYMENT VOUCHER)</Text>

        {/* Info grid */}
        <View style={[s.border, { marginBottom: 6 }]}>
          <View style={s.row}>
            <View style={[s.cell, { flex: 2 }]}>
              <Text style={s.tiny}>Applicant:  <Text style={s.bold}>{pv.applicant_name || pv.submitted_by}</Text></Text>
            </View>
            <View style={[s.cell, { flex: 1 }]}>
              <Text style={s.tiny}>Date:  <Text style={s.bold}>{fmtDate(pv.date ?? pv.submitted_at)}</Text></Text>
            </View>
          </View>
          <View style={s.cell}><Text style={s.tiny}>Payable to:  <Text style={s.bold}>{pv.payee_name}</Text></Text></View>
          <View style={s.cell}><Text style={s.tiny}>Payee Bank A/C No:  {bankLine}</Text></View>
          <View style={s.cell}><Text style={s.tiny}>Project:  {projectLabel}</Text></View>
          <View style={s.cell}><Text style={s.tiny}>Purpose:  {pv.purpose}</Text></View>
          {pv.exco_resolution_ref ? (
            <View style={[s.cell, { backgroundColor: "#fef3c7" }]}>
              <Text style={[s.tiny, s.bold]}>EXCO Resolution Ref: {pv.exco_resolution_ref}{pv.exco_resolution_date ? `  dated ${pv.exco_resolution_date}` : ""}</Text>
            </View>
          ) : null}
        </View>

        {/* Line items */}
        <View style={[s.border, { marginBottom: 0 }]}>
          <View style={[s.row, s.headerBg]}>
            <View style={[s.cell, { width: 24, ...s.center }]}><Text style={[s.bold, s.tiny]}>#</Text></View>
            <View style={[s.cell, { width: 75 }]}><Text style={[s.bold, s.tiny]}>Date</Text></View>
            <View style={[s.cell, { flex: 1 }]}><Text style={[s.bold, s.tiny]}>PARTICULARS</Text></View>
            <View style={[s.cell, { width: 80, ...s.right }]}><Text style={[s.bold, s.tiny]}>Amount (RM)</Text></View>
          </View>
          {items.map((item, i) => (
            <View key={i} style={s.row}>
              <View style={[s.cell, { width: 24, ...s.center }]}><Text>{i + 1}</Text></View>
              <View style={[s.cell, { width: 75 }]}><Text>{item.date ? fmtDate(item.date) : ""}</Text></View>
              <View style={[s.cell, { flex: 1 }]}><Text>{item.description}</Text></View>
              <View style={[s.cell, { width: 80, ...s.right }]}><Text>{fmt(Number(item.amount) || 0)}</Text></View>
            </View>
          ))}
          {Array.from({ length: padRows }).map((_, i) => (
            <View key={`pad-${i}`} style={s.row}>
              <View style={[s.cell, { width: 24 }]}><Text> </Text></View>
              <View style={[s.cell, { width: 75 }]}><Text> </Text></View>
              <View style={[s.cell, { flex: 1 }]}><Text> </Text></View>
              <View style={[s.cell, { width: 80 }]}><Text> </Text></View>
            </View>
          ))}
          <View style={s.row}>
            <View style={[s.cell, { flex: 1, ...s.right }]}><Text style={s.bold}>Total:</Text></View>
            <View style={[s.cell, { width: 80, ...s.right }]}><Text style={s.bold}>RM {fmt(total)}</Text></View>
          </View>
        </View>

        {/* Applicant signature */}
        {showApplicantSig && (
          <View style={[s.border, { marginTop: 8, padding: "6pt 8pt" }]}>
            <Text style={[s.bold, s.tiny, { marginBottom: 3 }]}>{"Applicant's Signature:"}</Text>
            <View style={{ height: 40 }} />
            <View style={[s.borderT, { paddingTop: 3 }]}>
              <Text style={s.tiny}>Name: <Text style={s.bold}>{pv.sig_applicant_name || pv.applicant_name}</Text>    Date: {fmtDate(pv.submitted_at)}</Text>
            </View>
          </View>
        )}

        {/* EXCO / Ministry Head verification */}
        {showExcoSection && (
          <View style={[s.border, { marginTop: 6, padding: "6pt 8pt" }]}>
            <Text style={[s.bold, s.tiny, { marginBottom: 1 }]}>Verified by:</Text>
            <Text style={[s.tiny, { color: "#555", marginBottom: 4 }]}>(By EXCO Member / Dept Head in Charge)</Text>
            {excoApproval?.signature_data ? (
              <Image src={excoApproval.signature_data} style={{ height: 40, objectFit: "contain", objectPositionX: "left" }} />
            ) : (
              <View style={{ height: 40 }} />
            )}
            <View style={[s.borderT, { paddingTop: 3 }]}>
              {ministryVerified ? (
                <>
                  <Text style={[s.bold, s.tiny]}>
                    {excoApproval?.name ?? pv.ministry_verified_by ?? pv.dept_head_name ?? "EXCO Member"}
                  </Text>
                  <Text style={s.tiny}>
                    {pv.ministry}{"  "}Date:{" "}
                    {fmtDate(excoApproval?.timestamp ?? pv.ministry_verified_at ?? pv.head_verified_at)}
                  </Text>
                </>
              ) : (
                <Text style={s.tiny}>Name: _______________________________{"     "}Date: ___________</Text>
              )}
            </View>
          </View>
        )}

        {/* Finance section */}
        <View style={{ marginTop: 8 }}>
          <View style={s.finHeader}>
            <Text>FOR LCM FINANCE OFFICE ONLY</Text>
          </View>
          <View style={[s.row, s.border, { borderTop: "none" }]}>
            <View style={[{ flex: 1, borderRight: "1pt solid #000" }]}>
              <SigBox
                approval={financeApproval ?? (pv.finance_verified_by ? {
                  role: "FINANCE_ADMIN", email: "", name: pv.finance_verified_by,
                  action: "APPROVED", timestamp: pv.finance_verified_at, remarks: "",
                } : undefined)}
                label="Prepared by:"
                subtitle="(Finance Executive)"
              />
            </View>
            <View style={[{ flex: 1, borderRight: "1pt solid #000" }]}>
              <SigBox approval={gmApproval} label="Verified by:" subtitle="(General Manager)" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={[{ padding: "6pt 8pt" }]}>
                <View style={[s.borderB, { paddingBottom: 2, marginBottom: 4 }]}>
                  <Text style={[s.bold, s.tiny]}>Approved by:</Text>
                  <Text style={s.tiny}>(Bishop / Secretary / Treasurer)</Text>
                </View>
                <View style={s.row}>
                  {Array.from({ length: loa.required }).map((_, i) => {
                    const appr = sigApprovals[i];
                    return (
                      <View key={i} style={{ flex: 1, alignItems: "center", paddingHorizontal: 2 }}>
                        {appr?.signature_data ? (
                          <Image src={appr.signature_data} style={{ height: 40, width: "100%", objectFit: "contain" }} />
                        ) : (
                          <View style={{ height: 40 }} />
                        )}
                        <View style={[s.borderT, { paddingTop: 3, width: "100%", alignItems: "center" }]}>
                          {appr ? (
                            <>
                              <Text style={[s.bold, s.tiny]}>{appr.name || appr.email}</Text>
                              <Text style={s.tiny}>{roleLabel(appr.role)}</Text>
                              <Text style={s.tiny}>Date: {fmtDate(appr.timestamp)}</Text>
                            </>
                          ) : (
                            <Text style={[s.tiny, { color: "#ccc" }]}>___________</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Remarks */}
        {approvals.filter(a => a.remarks).length > 0 && (
          <View style={{ marginTop: 6 }}>
            <Text style={[s.bold, s.tiny, { marginBottom: 2 }]}>Remarks:</Text>
            {approvals.filter(a => a.remarks).map((a, i) => (
              <Text key={i} style={s.tiny}>{roleLabel(a.role)} ({a.name}): {a.remarks}</Text>
            ))}
          </View>
        )}

        {isPaid && <View style={{ marginTop: 10 }}><PaidBanner pv={pv} /></View>}

      </Page>
    </Document>
  );
}

/** Fetch a URL and return its bytes, or null on failure. */
export async function fetchBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const buf = await res.arrayBuffer();
    return { bytes: new Uint8Array(buf), contentType };
  } catch {
    return null;
  }
}

async function mergeAttachments(basePdfBytes: ArrayBuffer, attachmentUrls: string[]): Promise<Uint8Array> {
  const merged = await PDFDocument.load(basePdfBytes);
  for (const url of attachmentUrls) {
    const file = await fetchBytes(url);
    if (!file) continue;
    const isPdf  = file.contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf");
    const isJpeg = file.contentType.includes("jpeg") || file.contentType.includes("jpg") || url.toLowerCase().match(/\.(jpg|jpeg)$/) !== null;
    const isPng  = file.contentType.includes("png") || url.toLowerCase().endsWith(".png");
    if (isPdf) {
      const attachDoc = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(attachDoc, attachDoc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    } else if (isPng || isJpeg) {
      const img = isPng ? await merged.embedPng(file.bytes) : await merged.embedJpg(file.bytes);
      const { width, height } = img.scaleToFit(595, 842);
      const page = merged.addPage([595, 842]);
      page.drawImage(img, { x: (595 - width) / 2, y: (842 - height) / 2, width, height });
    }
  }
  return merged.save();
}

async function buildPdfBytes(pv: PV, logoDataUri: string): Promise<ArrayBuffer> {
  const baseBlob = await pdf(<PVDocument pv={pv} logoDataUri={logoDataUri} />).toBlob();
  const attachmentUrls = [
    ...(pv.attachments ?? []),
    ...(pv.payment_receipt_url ? [pv.payment_receipt_url] : []),
  ].filter(Boolean);
  let finalBytes: Uint8Array;
  if (attachmentUrls.length > 0) {
    const baseBuf = await baseBlob.arrayBuffer();
    finalBytes = await mergeAttachments(baseBuf, attachmentUrls);
  } else {
    finalBytes = new Uint8Array(await baseBlob.arrayBuffer());
  }
  return finalBytes.buffer.slice(finalBytes.byteOffset, finalBytes.byteOffset + finalBytes.byteLength) as ArrayBuffer;
}

export default function PVPdfDownload({ pv }: { pv: PV }) {
  const [viewLoading, setViewLoading] = useState(false);
  const [dlLoading, setDlLoading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [logoDataUri, setLogoDataUri] = useState("");
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null);

  useEffect(() => {
    svgToPngDataUri("/lcm-logo.svg", 200).then(setLogoDataUri);
  }, []);

  const getLogoUri = () => logoDataUri || svgToPngDataUri("/lcm-logo.svg", 200);

  async function openPreview() {
    setViewLoading(true);
    setError(null);
    try {
      const logo = await getLogoUri();
      const buf = await buildPdfBytes(pv, typeof logo === "string" ? logo : logoDataUri);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
      // Mobile browsers can't render PDFs in iframes — open in new tab instead
      const isMobile = window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 8000);
      } else {
        setPreviewUrl(url);
      }
    } catch {
      setError("Failed to generate PDF preview.");
    } finally {
      setViewLoading(false);
    }
  }

  async function download() {
    setDlLoading(true);
    setError(null);
    try {
      const logo = await getLogoUri();
      const buf = await buildPdfBytes(pv, typeof logo === "string" ? logo : logoDataUri);
      const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${pv.pv_no}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate PDF.");
    } finally {
      setDlLoading(false);
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  return (
    <>
      {/* Full-screen PDF preview overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-stone-900">
          <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-stone-200 shrink-0">
            <span className="text-sm font-semibold text-stone-700">{pv.pv_no}.pdf</span>
            <div className="flex items-center gap-2">
              <button
                onClick={download}
                disabled={dlLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-50 disabled:opacity-50 transition-colors"
              >
                <Download size={13} /> {dlLoading ? "Saving…" : "Download"}
              </button>
              <button
                onClick={closePreview}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-50 transition-colors"
              >
                <X size={13} /> Close
              </button>
            </div>
          </div>
          <iframe
            src={previewUrl}
            className="flex-1 w-full border-0"
            title={`${pv.pv_no} Preview`}
          />
        </div>
      )}

      <div className="inline-flex flex-col items-start gap-1">
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={openPreview} loading={viewLoading}>
            <Eye size={14} /> View PDF
          </Button>
          <button
            onClick={download}
            disabled={dlLoading}
            title="Download PDF"
            className="flex items-center justify-center w-8 h-8 border border-stone-200 rounded-lg text-stone-500 hover:bg-stone-50 disabled:opacity-50 transition-colors"
          >
            {dlLoading ? <span className="text-[10px]">…</span> : <Download size={14} />}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </>
  );
}
