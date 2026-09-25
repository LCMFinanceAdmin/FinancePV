// Loaded with --import so the hooks are in place before any test runs.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./hooks.mjs", pathToFileURL(import.meta.filename));
