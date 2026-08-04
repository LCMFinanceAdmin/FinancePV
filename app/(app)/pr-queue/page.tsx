import { redirect } from "next/navigation";

// The GM now works from a single inbox. A Payment Request verified by its
// ministry EXCO lands directly in GM Claims (highlighted, awaiting acceptance),
// where accepting it is the instruction to Finance — so this separate queue is
// no longer needed. Kept as a redirect for existing links and notifications.
export default function RequestQueueRedirect() {
  redirect("/gm-claims");
}
