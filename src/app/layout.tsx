import type { Metadata } from "next";
import "./globals.css";
import ImpersonationBanner from "@/components/layout/ImpersonationBanner";

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Studency — Маркетинговая платформа",
  description: "Воронки, CRM, чат-боты, лендинги, обучение — всё в одном месте",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="h-full">
        <ImpersonationBanner />
        {children}
      </body>
    </html>
  );
}
