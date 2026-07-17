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
                background: '#0B0F14', // Trùng màu nền glass-card của bạn
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '14px',
                borderRadius: '8px',
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
