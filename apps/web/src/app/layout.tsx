import type { Metadata } from "next";
import { AppearanceProvider } from "@/components/appearance-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/components/i18n-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RunTrace", template: "%s · RunTrace" },
  description: "Persistent experiment memory for autonomous research agents.",
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
      <body className="min-h-full flex flex-col">
        <AppearanceProvider>
          <I18nProvider>
            <TooltipProvider><AuthProvider>{children}</AuthProvider><Toaster richColors /></TooltipProvider>
          </I18nProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
