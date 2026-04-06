import type { Metadata } from "next";
import "./globals.css";

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
      <body className="h-full">{children}</body>
    </html>
  );
}
