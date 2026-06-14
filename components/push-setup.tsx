"use client";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function PushSetup() {
  usePushNotifications();
  return null;
}
