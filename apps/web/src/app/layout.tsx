import type { Metadata } from "next";
import { AppearanceProvider } from "@/components/appearance-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
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
          <TooltipProvider>{children}<Toaster richColors /></TooltipProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
