"use client";
// "Install this app" — the free alternative to an app store.
//
// The app is already installable: it has a manifest and a service worker, so
// every phone can add it to the home screen with its own icon and no browser
// bar. But the browser's own prompt is easy to miss on Android and doesn't
// exist at all on iPhone, where it's buried behind the Share menu. Nobody who
// isn't already comfortable with phones will find it.
//
// So we ask plainly, and on iPhone we spell out the two taps. Installing also
// happens to be what makes push notifications work on iOS at all — Apple only
// delivers them to apps added to the home screen.

import { useState, useEffect } from "react";
import { Download, Share, PlusSquare, X, Check } from "lucide-react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED = "lcm-install-dismissed";

export function InstallApp() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(true); // assume yes until we know
  const [dismissed, setDismissed] = useState(true);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    // Already running as an installed app — nothing to offer.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const ua = window.navigator.userAgent;
    setIsIos(/iPad|iPhone|iPod/.test(ua) && !("MSStream" in window));

    try { setDismissed(!!localStorage.getItem(DISMISSED)); } catch { setDismissed(false); }

    const onPrompt = (e: Event) => {
      // Keep the event so the button can trigger the real browser dialog later.
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function hide() {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED, "1"); } catch { /* ignore */ }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  }

  // Nothing useful to say: already installed, previously dismissed, or a
  // browser that can't install (where the iPhone steps would be wrong).
  if (installed || dismissed) return null;
  if (!deferred && !isIos) return null;

  return (
    <div className="rounded-2xl border border-[#dbe9fb] bg-[linear-gradient(135deg,#f4f9ff,#f8f5ff)] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#1d4ed8] text-white">
          <Download size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-stone-800">Install LCM Finance on this device</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-stone-500">
            Adds an icon to your home screen so you can open it like any other app —
            no browser address to remember, and you&apos;ll get alerts when something needs you.
          </p>

          {isIos ? (
            showIosSteps ? (
              <ol className="mt-3 space-y-2">
                <li className="flex items-center gap-2.5 text-[14px] text-stone-700">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-[#1d4ed8]">1</span>
                  Tap <Share size={15} className="inline text-[#1d4ed8]" /> at the bottom of the screen
                </li>
                <li className="flex items-center gap-2.5 text-[14px] text-stone-700">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-[#1d4ed8]">2</span>
                  Scroll down and tap <PlusSquare size={15} className="inline text-[#1d4ed8]" /> Add to Home Screen
                </li>
                <li className="flex items-center gap-2.5 text-[14px] text-stone-700">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-[#1d4ed8]">3</span>
                  Tap Add — the icon appears with your other apps
                </li>
              </ol>
            ) : (
              <button onClick={() => setShowIosSteps(true)}
                className="mt-3 rounded-xl bg-[#1d4ed8] px-5 py-2.5 text-[15px] font-bold text-white">
                Show me how
              </button>
            )
          ) : (
            <button onClick={install}
              className="mt-3 rounded-xl bg-[#1d4ed8] px-5 py-2.5 text-[15px] font-bold text-white">
              Install app
            </button>
          )}
        </div>
        <button onClick={hide} aria-label="Not now"
          className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-white hover:text-stone-600">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/** Confirmation for someone who has already installed it. */
export function InstalledBadge() {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true,
    );
  }, []);
  if (!installed) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600">
      <Check size={12} /> Installed on this device
    </span>
  );
}
