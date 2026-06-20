"use client";
import { useEffect } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// Fire OPTIONS preflight to each edge function so the Deno runtime wakes up
// before the user taps Approve/Reject. OPTIONS returns immediately with no auth
// or DB work, but it keeps the worker warm for the real call seconds later.
const EDGE_FUNCTIONS = [
  "signatory-action",
  "admin-action",
  "ministry-action",
  "bam-action",
];

function useEdgeWarmup() {
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return;
    EDGE_FUNCTIONS.forEach(fn => {
      fetch(`${base}/functions/v1/${fn}`, { method: "OPTIONS" }).catch(() => {});
    });
  }, []);
}

export function PushSetup() {
  usePushNotifications();
  useEdgeWarmup();
  return null;
}
