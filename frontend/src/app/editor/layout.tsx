import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Video Editor — AI-Powered Manim Animation Studio",
  description: "Create, edit, and export AI-generated Manim animations",
};

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-screen overflow-hidden text-white studio-shell-bg">
      {children}
    </div>
  );
}
