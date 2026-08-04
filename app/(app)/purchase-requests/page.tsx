import { redirect } from "next/navigation";

// "Purchase Requests" became "Payment Requests" when the approval chain was
// aligned with the church constitution. Existing links, bookmarks and older
// notification records still point here, so keep them working.
export default function PurchaseRequestsRedirect() {
  redirect("/payment-requests");
}
