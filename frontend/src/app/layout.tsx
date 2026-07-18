import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/components/ThemeProvider";

const sans = Manrope({
  subsets: ["latin", "vietnamese"],
  variable: "--font-manrope",
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

          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--toast-background)",
                color: "var(--foreground)",
                border: "1px solid var(--border-color)",
                fontSize: "13px",
                borderRadius: "999px",
                backdropFilter: "blur(24px)",
                boxShadow: "var(--shadow-raised)",
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
