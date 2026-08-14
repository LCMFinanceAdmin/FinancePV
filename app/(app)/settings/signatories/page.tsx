// Retired: access is now set on the person.
//
// This page kept a second copy of six facts the People Directory already held
// — name, designation, whether they are a pastor, which congregation, whether
// LCM employs them — and let you edit both, so the two could disagree with
// nothing to reconcile them. A login belongs to a human being, so it is
// managed where the human being is: the person's Access & Role tab.
//
// The route stays and redirects, because it is bookmarked, linked from
// Settings and the Control Center, and typed from memory.

import { redirect } from "next/navigation";

export default function SignatoriesRedirect() {
  redirect("/settings/access");
}
