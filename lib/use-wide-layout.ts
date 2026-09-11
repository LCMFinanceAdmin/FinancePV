// Whether there is room to put the voucher beside the queue.
//
// Finance Activity is three panes on a wide screen — queue, record, document —
// and on a narrow one those panes stack, so choosing a voucher put its details
// below the entire list. On a phone that is a long scroll past everything you
// did not pick to reach the one you did, and nothing on screen says the tap
// worked.
//
// Below this width the card expands in place instead. Which of the two is
// rendered is a question about the viewport, and CSS cannot answer it here:
// hiding one with a class still mounts it, which would build the document
// twice and fetch every attachment twice on the connection least able to
// afford it.
//
// null until mounted, because the server has no viewport and guessing produces
// a layout that visibly rearranges itself a moment after it appears.

"use client";

import { useEffect, useState } from "react";

export function useWideLayout(query = "(min-width: 1024px)"): boolean | null {
  const [wide, setWide] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [query]);

  return wide;
}
