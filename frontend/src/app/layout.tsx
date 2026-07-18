import type { Metadata } from "next";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}

          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "rgba(13, 14, 18, .92)",
                color: "#f7f4ee",
                border: "1px solid rgba(255, 255, 255, .12)",
                fontSize: "13px",
                borderRadius: "999px",
                backdropFilter: "blur(24px)",
                boxShadow: "0 24px 70px rgba(0, 0, 0, .48), inset 0 1px rgba(255, 255, 255, .07)",
              },
              success: {
                iconTheme: {
                  primary: "#75e8bf",
                  secondary: "#08100d",
                },
              },
              error: {
                iconTheme: {
                  primary: "#ff8fa3",
                  secondary: "#16090c",
                },
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
