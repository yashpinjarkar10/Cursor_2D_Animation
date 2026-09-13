import SpaceScroll from "@/components/SpaceScroll";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white w-full selection:bg-white/20 selection:text-white">
      {/* Hero Intro */}
      <section className="h-screen w-full flex flex-col items-center justify-center relative z-10 px-4">
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif text-center mb-6 tracking-tight">
          AI-Powered Manim
          <span className="block text-white/50 mt-2 font-light">Animation Studio</span>
        </h1>
        <p className="text-lg md:text-xl font-sans text-white/70 max-w-2xl text-center leading-relaxed">
          Experience the future of programmatic animation. 
          <br className="hidden sm:block"/>
          We translate complex math into beautiful, seamless motion.
        </p>
        <div className="absolute bottom-12 animate-bounce flex flex-col items-center gap-2">
            <span className="text-xs font-sans uppercase tracking-[0.3em] text-white/40">Scroll to explore</span>
            <div className="w-[1px] h-12 bg-gradient-to-b from-white/40 to-transparent rounded-full"></div>
        </div>
      </section>

      {/* Scrollytelling Sequence Canvas */}
      <SpaceScroll />

      {/* Footer / Outro */}
      <section className="h-[80vh] w-full flex flex-col items-center justify-center bg-black px-4 relative z-10 overflow-hidden">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-white/[0.03] blur-[120px] rounded-full pointer-events-none"></div>

        <h2 className="text-4xl md:text-6xl font-serif text-center mb-8 tracking-tight">
          Ready to Animate?
        </h2>
        <p className="font-sans text-white/60 text-lg mb-10 max-w-lg text-center">
            Start creating beautiful animations today.
        </p>
        <Link
          href="/app"
          className="px-10 py-5 bg-white text-black font-sans font-medium rounded-full hover:scale-105 hover:bg-gray-100 transition-all duration-300 shadow-[0_0_40px_rgba(255,255,255,0.15)] inline-block"
        >
          Open App
        </Link>
      </section>
    </main>
  );
}
