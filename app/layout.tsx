import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "./components/AppSidebar";
import { ProjectProvider } from "./components/ProjectContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RenLab",
  description: "Refine specs into production code through AI-powered pipelines",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ProjectProvider>
          <div className="flex h-screen bg-zinc-950">
            <AppSidebar />
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
        </ProjectProvider>
      </body>
    </html>
  );
}
