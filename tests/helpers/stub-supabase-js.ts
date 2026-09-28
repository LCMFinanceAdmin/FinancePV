// The Supabase client the edge functions build. Replacing this one import is
// enough to load supabase/functions/_shared/supabase.ts for real, so the rules
// it holds are the ones under test rather than a restatement of them.
import { pvClient } from "./pv-world.ts";

export function createClient(_url?: string, _key?: string, _options?: unknown) {
  return pvClient();
}
