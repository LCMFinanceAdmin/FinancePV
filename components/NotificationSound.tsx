"use client";
import { useEffect, useRef } from "react";

export function NotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Pre-load the audio so it's ready instantly when needed
    const audio = new Audio("/sounds/mighty-fortress.mp3");
    audio.preload = "auto";
    audioRef.current = audio;

    function playSound() {
      const a = audioRef.current;
      if (!a) return;
      a.currentTime = 0;
      a.play().catch(() => {
        // Autoplay blocked (browser policy before first user interaction).
        // The system notification sound will have already played in this case.
      });
    }

    // Listen for messages from the service worker
    function onSwMessage(e: MessageEvent) {
      if (e.data?.type === "LCM_NOTIFICATION_SOUND") playSound();
    }

    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onSwMessage);
  }, []);

  return null;
}
