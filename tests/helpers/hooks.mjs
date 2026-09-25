// Lets the tests import application modules the way the application does.
//
// Two jobs. "@/lib/x" is a tsconfig path alias, which Node knows nothing
// about, so it is resolved against the repository root. And the three modules
// that reach outside the process — the Next response helper, the Supabase
// client and the mailer — are pointed at stand-ins, so a route handler can be
// run without a server, a database or an outbox.
//
// Nothing here reimplements application logic: the code under test is the real
// file, imported unmodified.
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..", "..");
const here = (p) => pathToFileURL(path.join(root, p)).href;

const STUBS = {
  "next/server": "tests/helpers/stub-next-server.ts",
  "@/lib/supabase/server": "tests/helpers/stub-supabase.ts",
  "@/lib/notify": "tests/helpers/stub-notify.ts",
};

export async function resolve(specifier, context, next) {
  const stub = STUBS[specifier];
  if (stub) return next(here(stub), context);
  if (specifier.startsWith("@/")) return next(here(specifier.slice(2) + ".ts"), context);
  return next(specifier, context);
}
