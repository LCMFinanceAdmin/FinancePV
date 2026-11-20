// Lets a script import the application's React components as they are written.
//
// Node strips types but will not transform JSX, so a .tsx file cannot simply
// be imported. The test loader beside this one (tests/helpers/hooks.mjs)
// deals with that by blanking the one icon it expects and refusing anything
// further — the right answer there, where JSX is incidental and silently
// rewriting markup would make a test lie about what it tested.
//
// This is for the other case: a component whose whole point is its markup. It
// hands the file to TypeScript's own transpiler, which is already a
// dependency, so what runs is what the application renders rather than an
// approximation of it. No type checking — `tsc --noEmit` and the build do
// that, and doing it twice would only make this slow.
//
// Two jobs beyond that: "@/lib/x" is a tsconfig path alias Node knows nothing
// about, and TypeScript's own relative imports are written without the
// extension that ESM requires.

import path from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..", "..");
const here = (p) => pathToFileURL(path.join(root, p)).href;

const hasExtension = (s) => /\.(tsx?|mts|mjs|jsx?|json|css)$/.test(s);

/** The file a bare specifier means: .ts unless only a .tsx is there. */
function withExtension(base) {
  if (hasExtension(base)) return base;
  for (const ext of [".ts", ".tsx", ".mts"]) if (existsSync(base + ext)) return base + ext;
  for (const ext of [".ts", ".tsx"]) {
    const index = path.join(base, "index" + ext);
    if (existsSync(index)) return index;
  }
  return base;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const target = withExtension(path.join(root, specifier.slice(2)));
    return next(pathToFileURL(target).href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../"))
      && !hasExtension(specifier) && context.parentURL?.startsWith("file:")) {
    const target = withExtension(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (existsSync(target)) return next(pathToFileURL(target).href, context);
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (!/\.tsx?$/.test(new URL(url).pathname)) return next(url, context);
  const file = fileURLToPath(url);
  const { outputText } = ts.transpileModule(await readFile(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      // The automatic runtime, so a component needs no React import — which
      // is how these files are written and how Next compiles them.
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      isolatedModules: true,
    },
  });
  return { format: "module", source: outputText, shortCircuit: true };
}

export { here };
