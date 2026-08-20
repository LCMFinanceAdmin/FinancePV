// How a form field looks in the directory.
//
// The same three strings had been copied into the people page and each of its
// panels, so the fields on one card could drift apart from the fields directly
// below them. They live here now: one edit changes the whole form.
//
// The border is deliberately dark and a little heavier than Tailwind's default.
// An empty box outlined in stone-200 is nearly invisible against a white card,
// which matters most to whoever is filling in forty of them.

export const fieldClass =
  "w-full rounded-lg border-2 border-stone-800 bg-white px-2.5 py-1 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-[#2f5b9c] disabled:border-stone-300 disabled:bg-stone-50 disabled:text-stone-500";

/** Sits directly above a field, so it carries its own small gap. */
export const labelClass = "mb-0.5 block text-[11px] font-medium text-stone-500";

/** The small capitalised heading that opens a section of the form. */
export const sectionClass = "mb-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-500";
