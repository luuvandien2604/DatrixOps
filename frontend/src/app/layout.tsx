import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "@fontsource-variable/inter";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_URL || "http://localhost:3000"),
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
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-JRRSR039BD"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-JRRSR039BD');
          `}
        </Script>
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}

          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--surface-3)",
                color: "var(--foreground)",
                border: "1px solid var(--border-default)",
                fontSize: "13px",
                borderRadius: "10px",
                boxShadow: "var(--shadow-md)",
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
