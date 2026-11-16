/** Full-viewport dark backdrop with slow drifting blurred gradient blobs (pure CSS). */
export function AmbientBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="ambient-root fixed inset-0 overflow-y-auto bg-zinc-950 text-zinc-100">
      <style>{`
        .ambient-blob { position: absolute; border-radius: 9999px; filter: blur(80px); opacity: 0.55; will-change: transform; }
        .ambient-a { width: 60vmax; height: 60vmax; left: -15vmax; top: -20vmax;
          background: radial-gradient(circle at 50% 50%, #4f46e5 0%, transparent 65%);
          animation: ambient-drift-a 32s ease-in-out infinite alternate; }
        .ambient-b { width: 55vmax; height: 55vmax; right: -20vmax; bottom: -20vmax;
          background: radial-gradient(circle at 50% 50%, #0ea5e9 0%, transparent 65%);
          animation: ambient-drift-b 38s ease-in-out infinite alternate; }
        .ambient-c { width: 40vmax; height: 40vmax; left: 35%; top: 45%;
          background: radial-gradient(circle at 50% 50%, #a855f7 0%, transparent 65%);
          opacity: 0.35; animation: ambient-drift-c 26s ease-in-out infinite alternate; }
        @keyframes ambient-drift-a { from { transform: translate(0, 0) scale(1); } to { transform: translate(18vmax, 14vmax) scale(1.15); } }
        @keyframes ambient-drift-b { from { transform: translate(0, 0) scale(1.1); } to { transform: translate(-16vmax, -12vmax) scale(0.95); } }
        @keyframes ambient-drift-c { from { transform: translate(-10vmax, 6vmax) scale(0.9); } to { transform: translate(12vmax, -10vmax) scale(1.2); } }
        @media (prefers-reduced-motion: reduce) { .ambient-blob { animation: none !important; } }
      `}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="ambient-blob ambient-a" />
        <div className="ambient-blob ambient-b" />
        <div className="ambient-blob ambient-c" />
        <div className="absolute inset-0 bg-zinc-950/40" />
      </div>
      <div className="relative z-10 flex min-h-full flex-col items-center justify-center px-6 py-10">
        {children}
      </div>
    </div>
  );
}
