import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast"; // 1. IMPORT TOASTER

export const metadata: Metadata = {
  title: "DatrixOps — Server Observability",
  description: "Real-time server and agent monitoring control plane.",
};

import { ThemeProvider } from "@/components/ThemeProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}

          {/* 2. ĐẶT TOASTER VÀO ĐÂY ĐỂ PHÁT THÔNG BÁO */}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'linear-gradient(145deg, rgba(26,29,38,.96), rgba(12,14,19,.96))',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: '14px',
                borderRadius: '14px',
                backdropFilter: 'blur(24px)',
                boxShadow: '0 22px 60px rgba(0,0,0,.4), inset 0 1px rgba(255,255,255,.07)',
              },
              success: {
                iconTheme: {
                  primary: '#10B981', // Màu xanh emerald giống nút Start Update
                  secondary: '#fff',
                },
              },
              error: {
                iconTheme: {
                  primary: '#F43F5E', // Màu đỏ rose giống nút Delete
                  secondary: '#fff',
                },
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
