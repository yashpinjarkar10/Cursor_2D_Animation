import SpaceScroll from "@/components/SpaceScroll";
import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b0d11] text-white w-full selection:bg-cyan-500/20 selection:text-white">
      <Navbar />

      {/* Hero Intro */}
      <section className="h-[calc(100vh-4rem)] w-full flex flex-col items-center justify-center relative z-10 px-4 text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          Powered by Manim & LangGraph v4.0
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif text-center mb-6 tracking-tight">
          AI-Powered Manim
          <span className="block text-white/50 mt-2 font-light">Animation Studio</span>
        </h1>
        <p className="text-base md:text-xl font-sans text-white/70 max-w-2xl text-center leading-relaxed">
          Experience the future of programmatic math animation. 
          <br className="hidden sm:block"/>
          Transform plain English prompts into beautiful, rendered 2D vector motion.
        </p>

        <div className="mt-8 flex items-center gap-4">
          <Link
            href="/projects"
            className="px-8 py-3.5 bg-gradient-to-r from-cyan-500 to-emerald-500 text-black font-semibold text-sm rounded-full hover:scale-105 transition-all duration-300 shadow-[0_0_35px_rgba(6,182,212,0.3)]"
          >
            Launch Studio
          </Link>
          <Link
            href="/auth/login"
            className="px-7 py-3.5 rounded-full text-sm font-medium text-white/80 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] transition-all"
          >
            Sign In
          </Link>
        </div>

        <div className="absolute bottom-10 animate-bounce flex flex-col items-center gap-2">
          <span className="text-xs font-sans uppercase tracking-[0.3em] text-white/40">Scroll to explore</span>
          <div className="w-[1px] h-10 bg-gradient-to-b from-white/40 to-transparent rounded-full"></div>
        </div>
      </section>

      {/* Scrollytelling Sequence Canvas */}
      <SpaceScroll />

      {/* Footer / Outro */}
      <section className="h-[70vh] w-full flex flex-col items-center justify-center bg-[#0b0d11] px-4 relative z-10 overflow-hidden">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-cyan-500/[0.04] blur-[120px] rounded-full pointer-events-none"></div>

        <h2 className="text-4xl md:text-6xl font-serif text-center mb-6 tracking-tight">
          Ready to Animate?
        </h2>
        <p className="font-sans text-white/60 text-base mb-8 max-w-lg text-center">
          Turn your complex mathematical ideas into crystal-clear animations.
        </p>
        <Link
          href="/projects"
          className="px-10 py-4 bg-white text-black font-semibold text-sm rounded-full hover:scale-105 hover:bg-gray-100 transition-all duration-300 shadow-[0_0_40px_rgba(255,255,255,0.15)] inline-block"
        >
          Open Studio
        </Link>
      </section>
    </main>
  );
}
