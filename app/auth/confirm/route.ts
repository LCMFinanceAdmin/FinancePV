import { completeSignIn } from "@/lib/auth/complete-sign-in";

// The path Supabase's own email templates point at. Same work as /auth/callback
// — both exist so an email sent before the templates were changed still lands
// somewhere that can finish the job.
export async function GET(request: Request) {
  return completeSignIn(request);
}
