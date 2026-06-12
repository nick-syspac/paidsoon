import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { isLiveMode, shouldShowNotLiveBanner } from "@/lib/liveMode";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PaidSoon",
  description: "Automatic, escalating invoice follow-ups so freelancers never have to play bad cop.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const showNotLiveBanner = shouldShowNotLiveBanner(isLiveMode());

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {showNotLiveBanner ? (
          <div
            className="w-full bg-amber-100 border-b border-amber-300 text-amber-900 text-center text-sm font-medium py-2 px-4"
            role="status"
          >
            This site is not live yet. Sign in and sign up are currently disabled.
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
