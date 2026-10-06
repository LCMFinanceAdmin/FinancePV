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
import { readFile } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = path.resolve(import.meta.dirname, "..", "..");
const here = (p) => pathToFileURL(path.join(root, p)).href;

const STUBS = {
  "next/server": "tests/helpers/stub-next-server.ts",
  "@/lib/supabase/server": "tests/helpers/stub-supabase.ts",
  "@/lib/notify": "tests/helpers/stub-notify.ts",
};

// The edge functions are Deno: they import each other by relative path and
// reach the outside world through two shared modules. Those are matched on
// where they resolve to rather than on how they were written, since the same
// file is "../_shared/supabase.ts" from every function.
// _shared/supabase.ts is NOT stubbed. It holds the rules these tests are
// about — who counts as the beneficiary of a voucher, how many signatures an
// amount needs, when a signatory's approval is the last one — and standing it
// in for would mean testing the stand-in. Only its network import is replaced,
// so the real module loads and its real logic runs.
const EDGE_STUBS = [
  ["supabase/functions/_shared/push.ts", "tests/helpers/stub-edge-push.ts"],
];

// The client the shared module builds at the top of the file.
const URL_IMPORTS = {
  "https://esm.sh/@supabase/supabase-js@2": "tests/helpers/stub-supabase-js.ts",
};

const hasExtension = (s) => /\.(ts|tsx|mts|mjs|js|json)$/.test(s);

/** ".ts" unless only a ".tsx" is there — lib/nav.tsx is the one that is. */
const withExtension = (rest) => {
  if (hasExtension(rest)) return rest;
  return existsSync(path.join(root, rest + ".ts")) ? rest + ".ts" : rest + ".tsx";
};

export async function resolve(specifier, context, next) {
  const stub = STUBS[specifier] ?? URL_IMPORTS[specifier];
  if (stub) return next(here(stub), context);
  if (specifier.startsWith("@/")) {
    const rest = specifier.slice(2);
    return next(here(withExtension(rest)), context);
  }

  const resolved = await next(specifier, context);
  for (const [tail, replacement] of EDGE_STUBS) {
    // split/join rather than a regex: a Windows path is full of backslashes
    // and escaping them here is how this line got broken once already.
    if (resolved.url.split("\\").join("/").endsWith(tail)) {
      return next(here(replacement), context);
    }
  }
  return resolved;
}

// lib/nav.tsx says who may open which page, and that rule is plain TypeScript:
// the only JSX in the file is one icon beside each entry. Node strips types but
// not JSX, so the icons are replaced with null on the way in and the rule itself
// is imported unmodified. Which glyph sits beside a menu entry is not something
// these tests have an opinion about.
//
// The guard matters more than the substitution. If a .tsx file ever holds real
// markup, blanking the icons would leave something that still parses and quietly
// means something else, so anything JSX-shaped that survives is an error rather
// than a silent mangling.
const ICON = /<([A-Z][A-Za-z0-9]*)\s+size=\{size\}\s*\/>/g;

export async function load(url, context, next) {
  if (!url.endsWith(".tsx")) return next(url, context);
  const source = (await readFile(fileURLToPath(url), "utf8")).replace(ICON, "null");
  if (source.includes("/>")) {
    throw new Error(
      `${url}: JSX this loader does not understand. It blanks "<Icon size={size} />" ` +
      `and nothing else; anything further would be silently rewritten.`);
  }
  return { format: "module-typescript", source, shortCircuit: true };
}
