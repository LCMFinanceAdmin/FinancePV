import type { Metadata, Viewport } from "next";
import { Lato } from "next/font/google";
import "./globals.css";
import { SplashScreen } from "@/components/splash-screen";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');`,
          }}
        />
      </head>
      <body className={`${lato.className} h-full bg-stone-50 text-stone-800 antialiased`}>
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}
