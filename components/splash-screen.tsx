"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

export function SplashScreen() {
  const [phase, setPhase] = useState<"hidden" | "visible" | "fading">("hidden");

  useEffect(() => {
    // Only show once per session
    if (sessionStorage.getItem("splashShown")) return;
    sessionStorage.setItem("splashShown", "1");

    setPhase("visible");
    const t1 = setTimeout(() => setPhase("fading"), 2200);
    const t2 = setTimeout(() => setPhase("hidden"), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none"
      style={{
        background: "linear-gradient(160deg, #1e3a6e 0%, #3D5FA0 55%, #4a6da7 100%)",
        opacity: phase === "fading" ? 0 : 1,
        transition: "opacity 0.6s ease",
      }}
    >
      {/* Logo */}
      <div
        className="mb-7"
        style={{
          animation: "splashPop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards",
        }}
      >
        <Image
          src="/lcm-logo.svg"
          alt="LCM Logo"
          width={110}
          height={110}
          priority
          style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.35))" }}
        />
      </div>

      {/* Wordmark */}
      <div
        className="text-center"
        style={{ animation: "splashFadeUp 0.5s 0.15s ease both" }}
      >
        <div
          className="text-[10px] tracking-[0.35em] font-semibold mb-1"
          style={{ color: "#F5C400" }}
        >
          LUTHERAN CHURCH IN MALAYSIA
        </div>
        <div className="text-4xl font-bold text-white tracking-tight leading-none">
          Finance
        </div>
        <div className="text-[13px] text-white/60 mt-1.5 tracking-wide">
          Finance Payment System
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[3px]"
        style={{ background: "rgba(255,255,255,0.12)" }}
      >
        <div
          className="h-full"
          style={{
            background: "#F5C400",
            animation: "splashProgress 2s linear forwards",
          }}
        />
      </div>

      <style>{`
        @keyframes splashPop {
          from { opacity: 0; transform: scale(0.78); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes splashFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashProgress {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
