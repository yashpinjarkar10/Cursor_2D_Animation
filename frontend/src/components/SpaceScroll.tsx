'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useScroll, useTransform } from 'framer-motion';

const TOTAL_FRAMES = 120; // ezgif-frame-001 to ezgif-frame-120

export default function SpaceScroll() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<HTMLImageElement[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // useScroll tracks the progress of the container
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Map scroll progress (0-1) to frame index (1-120)
  const frameIndex = useTransform(scrollYProgress, [0, 1], [1, TOTAL_FRAMES]);

  useEffect(() => {
    // Preload images into memory
    const loadedImages: HTMLImageElement[] = [];
    let loaded = 0;

    for (let i = 1; i <= TOTAL_FRAMES; i++) {
        const img = new Image();
        // Naming convention: ezgif-frame-[i].png padded to 3 digits
        const frameNum = i.toString().padStart(3, '0');
        img.src = `/sequence/ezgif-frame-${frameNum}.png`;
        img.onload = () => {
            loaded++;
            setLoadedCount(loaded);
        };
        // Store the image at index i for simple lookup 1..120
        loadedImages[i] = img;
    }
    setImages(loadedImages);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || images.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
        // Get the current mapped frame (safeguarded index)
        const currentIndex = Math.max(1, Math.min(TOTAL_FRAMES, Math.round(frameIndex.get())));
        const img = images[currentIndex];

        if (img && img.complete) {
            // High-DPI support could be added here, but leaving 1:1 for performance mapping
            // Clear previous draw
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // object-contain logic: scale to fit either width or height without distortion
            const hRatio = canvas.width / img.width;
            const vRatio = canvas.height / img.height;
            const ratio = Math.min(hRatio, vRatio);
            
            const renderWidth = img.width * ratio;
            const renderHeight = img.height * ratio;
            const centerShift_x = (canvas.width - renderWidth) / 2;
            const centerShift_y = (canvas.height - renderHeight) / 2;

            // Render to center of canvas exactly
            ctx.drawImage(
                img, 
                0, 0, img.width, img.height,
                centerShift_x, centerShift_y, renderWidth, renderHeight
            );
        }

        // Keep loop running
        animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [images, frameIndex]);

  useEffect(() => {
    // Canvas sizing setup
    const resizeCanvas = () => {
        if (canvasRef.current && canvasRef.current.parentElement) {
            canvasRef.current.width = window.innerWidth;
            canvasRef.current.height = window.innerHeight;
        }
    };
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // init scale
    
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const progress = Math.round((loadedCount / TOTAL_FRAMES) * 100);
  const isLoaded = loadedCount >= TOTAL_FRAMES;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: '400vh' }}>
      {/* Sticky wrapper */}
      <div className="sticky top-0 w-full h-screen overflow-hidden flex justify-center items-center bg-[#000000]">
        
        {/* Sleek Preloader Overlay */}
        <div 
            className={`absolute inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-[1500ms] pointer-events-none ${isLoaded ? 'opacity-0' : 'opacity-100'}`}
        >
            <h2 className="text-white text-3xl font-serif tracking-wide mb-6">Initializing Studio...</h2>
            <div className="w-80 h-[2px] bg-white/20 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-white transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>
            <div className="text-white/60 mt-4 font-sans text-xs uppercase tracking-widest">{progress}% Loaded</div>
        </div>

        {/* The Frame sequence display */}
        <canvas 
            ref={canvasRef} 
            className="block w-full h-full object-contain"
            style={{ 
                // Fallback opacity fade in once ready if needed
                opacity: isLoaded ? 1 : 0, 
                transition: 'opacity 1s ease-in-out' 
            }}
        />
      </div>
    </div>
  );
}
