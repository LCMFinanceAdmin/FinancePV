import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyPeople } from "@/lib/notify";

// Tell the EXCO board that a change to an approved budget has been asked for.
//
// An approved budget is a decision of the board, so a request to change one is
// the board's business — not a private exchange between the ministry and
// whoever happens to open the budget page next. Without this the request sat
// in a panel that only someone already looking at that ministry would see.
//
// Recipients come from exco_board_contacts() (migration 167) rather than a
// query here, because an EXCO member cannot read the People directory and the
// join to get anybody's address would come back empty under their own session.

const CHANGE_WORDS: Record<string, string> = {
  add: "add a new line to",
  edit: "change a line in",
  delete: "remove a line from",
};

function money(v: unknown): string {
  const n = Number(v ?? 0);
  if (!n) return "";
  return `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { request_id } = await req.json() as { request_id?: string };
    if (!request_id) return NextResponse.json({ error: "Missing request_id" }, { status: 400 });

    const { data: cr } = await supabase
      .from("budget_change_requests")
      .select("id,ministry,change_type,proposed_data,requested_by,status")
      .eq("id", request_id)
      .maybeSingle();

    if (!cr) return NextResponse.json({ error: "Change request not found" }, { status: 404 });
    if (cr.requested_by !== user.email) {
      return NextResponse.json({ error: "Not your request" }, { status: 403 });
    }

    const { data: board, error: rpcErr } = await supabase.rpc("exco_board_contacts");
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

    const contacts = (board ?? []) as { name: string; email: string; office: string }[];
    // The person asking does not need telling, and seeing your own request
    // arrive as a board notification reads like it went to the wrong place.
    const to = contacts.filter(c => c.email.toLowerCase() !== (user.email ?? "").toLowerCase());
    if (to.length === 0) return NextResponse.json({ ok: true, notified: 0 });

    const proposed = (cr.proposed_data ?? {}) as Record<string, unknown>;
    const project = String(proposed.project_name ?? "").trim() || "an unnamed line";
    const amount = money(proposed.estimated_expenses) || money(proposed.estimated_income);
    const requester = contacts.find(c => c.email.toLowerCase() === (user.email ?? "").toLowerCase());
    const who = requester?.name ?? user.email ?? "An EXCO member";

    const result = await notifyPeople({
      supabase,
      to: to.map(c => ({ email: c.email, name: c.name })),
      type: "BUDGET_CHANGE_REQUESTED",
      ref: cr.ministry,
      urgent: false,
      subject: `Budget change requested — ${cr.ministry}`,
      lines: [
        `${who} has asked to ${CHANGE_WORDS[cr.change_type] ?? "change"} the approved ${cr.ministry} budget.`,
        `Line: ${project}${amount ? ` — ${amount}` : ""}.`,
        ...(proposed.special_notes ? [`Note given: ${String(proposed.special_notes)}`] : []),
        "The change is not in effect. It takes a decision from the Treasurer, General Manager, Bishop, Secretary or Finance Executive before the budget moves.",
      ],
      path: `/budget?ministry=${encodeURIComponent(cr.ministry)}`,
      cta: "Review the request",
    });

    return NextResponse.json({ ok: true, notified: result.recorded, emailed: result.emailed });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
