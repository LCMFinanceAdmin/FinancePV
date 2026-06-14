import type { Metadata, Viewport } from "next";
import { Lato } from "next/font/google";
import "./globals.css";

const lato = Lato({ subsets: ["latin"], weight: ["300", "400", "700"] });

export const metadata: Metadata = {
  title: "LCM Finance",
  description: "LCM Payment Voucher System",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "LCM Finance" },
};

export const viewport: Viewport = {
  themeColor: "#4a6da7",
  width: "device-width",
  initialScale: 1,
};

const splashStyles = `
  #lcm-splash{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(160deg,#1e3a6e 0%,#3D5FA0 55%,#4a6da7 100%);transition:opacity .6s ease;pointer-events:none}
  #lcm-splash.fading{opacity:0}
  #lcm-splash.gone{display:none}
  @keyframes spl-pop{from{opacity:0;transform:scale(.78)}to{opacity:1;transform:scale(1)}}
  @keyframes spl-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spl-bar{from{width:0}to{width:100%}}
  #lcm-splash-logo{animation:spl-pop .5s cubic-bezier(.175,.885,.32,1.275) forwards;margin-bottom:28px;filter:drop-shadow(0 4px 24px rgba(0,0,0,.35))}
  #lcm-splash-text{animation:spl-up .5s .15s ease both;text-align:center}
  #lcm-splash-bar{position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,.12)}
  #lcm-splash-fill{height:100%;background:#F5C400;animation:spl-bar 2.2s linear forwards}
`;

const splashScript = `
(function(){
  var el=document.getElementById('lcm-splash');
  if(!el)return;
  setTimeout(function(){
    el.classList.add('fading');
    setTimeout(function(){el.classList.add('gone');},650);
  },2200);
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <style dangerouslySetInnerHTML={{ __html: splashStyles }} />
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js');` }} />
      </head>
      <body className={`${lato.className} h-full bg-stone-50 text-stone-800 antialiased`}>

        {/* Splash — server-rendered so it appears before React loads */}
        <div id="lcm-splash">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img id="lcm-splash-logo" src="/lcm-logo.svg" width={110} height={110} alt="" />
          <div id="lcm-splash-text">
            <div style={{ fontSize: 10, letterSpacing: "0.35em", fontWeight: 600, color: "#F5C400", marginBottom: 4, fontFamily: "sans-serif" }}>
              LUTHERAN CHURCH IN MALAYSIA
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: "white", letterSpacing: -0.5, lineHeight: 1, fontFamily: "sans-serif" }}>
              Finance
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 6, letterSpacing: "0.05em", fontFamily: "sans-serif" }}>
              Finance Payment System
            </div>
          </div>
          <div id="lcm-splash-bar"><div id="lcm-splash-fill" /></div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: splashScript }} />

        {children}
      </body>
    </html>
  );
}
