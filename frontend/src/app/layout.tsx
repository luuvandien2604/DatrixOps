import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { LiquidGlassPointer } from "@/components/LiquidGlassPointer";
import { ThemeProvider } from "@/components/ThemeProvider";

const sans = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

const display = Cormorant_Garamond({
  subsets: ["latin", "vietnamese"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DatrixOps — Server Observability",
  description: "Real-time server and agent monitoring control plane.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <LiquidGlassPointer />

          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--glass-modal-background)",
                color: "var(--foreground)",
                border: "1px solid var(--glass-edge-strong)",
                fontSize: "13px",
                borderRadius: "999px",
                backdropFilter: "blur(var(--glass-blur-elevated)) saturate(var(--glass-saturation-elevated))",
                boxShadow: "var(--shadow-elevated)",
              },
              success: {
                iconTheme: {
                  primary: "var(--mint)",
                  secondary: "var(--surface-raised)",
                },
              },
              error: {
                iconTheme: {
                  primary: "var(--rose)",
                  secondary: "var(--surface-raised)",
                },
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
