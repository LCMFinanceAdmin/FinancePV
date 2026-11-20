// Loaded with --import so the hooks are in place before anything is imported.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./tsx-hooks.mjs", pathToFileURL(import.meta.filename));
