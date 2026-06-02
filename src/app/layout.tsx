import type { Metadata } from "next";
import { Amiri } from "next/font/google";
import "./globals.css";

const amiri = Amiri({
  variable: "--font-amiri",
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "نظام ERP مقاولات | Construction ERP",
  description: "نظام إدارة موارد المقاولات الشامل | Comprehensive Construction ERP System",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${amiri.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: "var(--font-amiri), Amiri, serif" }}
      >
        {children}
      </body>
    </html>
  );
}
