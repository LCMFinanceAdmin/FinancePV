"use client";
import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

interface NotifData {
  id: number;
  title: string;
  body: string;
  url: string;
}

export function NotificationBanner() {
  const [notifications, setNotifications] = useState<NotifData[]>([]);
  const idRef = { current: 0 };

  useEffect(() => {
    function onNotif(e: Event) {
      const { title, body, url } = (e as CustomEvent).detail;
      const id = ++idRef.current;
      setNotifications(prev => [...prev, { id, title, body, url }]);
      setTimeout(() => dismiss(id), 6000);
    }
    window.addEventListener("lcm-notification", onNotif);
    return () => window.removeEventListener("lcm-notification", onNotif);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss(id: number) {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {notifications.map(n => (
        <div
          key={n.id}
          className="pointer-events-auto bg-white border border-stone-200 shadow-xl rounded-xl overflow-hidden flex items-start gap-3 p-3 animate-in slide-in-from-right-4 fade-in duration-300"
        >
          <div className="shrink-0 mt-0.5 bg-violet-100 rounded-full p-1.5">
            <Bell size={14} className="text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-stone-800 leading-snug">{n.title}</p>
            {n.body && (
              <p className="text-[12px] text-stone-500 mt-0.5 leading-snug line-clamp-2">{n.body}</p>
            )}
            {n.url && n.url !== "/" && (
              <a
                href={n.url}
                className="text-[11px] text-violet-600 hover:underline mt-1 inline-block font-medium"
                onClick={() => dismiss(n.id)}
              >
                View →
              </a>
            )}
          </div>
          <button
            onClick={() => dismiss(n.id)}
            className="shrink-0 text-stone-400 hover:text-stone-600 transition-colors mt-0.5"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
