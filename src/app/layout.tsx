import type { Metadata } from "next";
import "./globals.css";
import { DisclaimerModal } from "@/components/DisclaimerModal";

export const metadata: Metadata = {
  title: "BEAR-SWAN BROWSER TERMINAL",
  description: "Long volatility scanner — Karsan & Taleb style",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex flex-col font-mono">
        {children}
        <DisclaimerModal />
      </body>
    </html>
  );
}
