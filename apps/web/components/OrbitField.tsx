/** The sign-in backdrop: a few small robots drifting on wide orbits around the middle of the page. */

const CX = 720;
const CY = 450;
const ORBITS = [
  { rx: 380, ry: 150 },
  { rx: 590, ry: 250 },
  { rx: 830, ry: 370 },
];

function ellipse(rx: number, ry: number): string {
  return `M ${CX - rx} ${CY} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
}

/** orbit, where on it (0 to 1), size, shade (far ones are lighter), seconds per lap, seconds per spin */
const ROBOTS: [number, number, number, string, number, number][] = [
  [0, 0.08, 1.0, "#d4d4d8", 90, 38],
  [0, 0.56, 0.8, "#e4e4e7", 90, -46],
  [1, 0.3, 1.5, "#a1a1aa", 130, 52],
  [1, 0.72, 1.1, "#d4d4d8", 130, -34],
  [1, 0.94, 0.75, "#e4e4e7", 130, 60],
  [2, 0.18, 1.25, "#d4d4d8", 180, -44],
  [2, 0.47, 1.9, "#a1a1aa", 180, 48],
  [2, 0.8, 0.95, "#e4e4e7", 180, 40],
];

function Robot() {
  return (
    <>
      <rect x="-10" y="-7" width="20" height="15" rx="4.5" />
      <rect x="-13" y="-2" width="3" height="6" rx="1.5" />
      <rect x="10" y="-2" width="3" height="6" rx="1.5" />
      <rect x="-0.9" y="-12" width="1.8" height="5" />
      <circle cx="0" cy="-13" r="2.2" />
      <circle cx="-4" cy="0" r="2.1" fill="#fff" />
      <circle cx="4" cy="0" r="2.1" fill="#fff" />
    </>
  );
}

export function OrbitField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <g transform={`rotate(-14 ${CX} ${CY})`}>
          {ORBITS.map((o) => (
            <path key={o.rx} d={ellipse(o.rx, o.ry)} fill="none" stroke="#e4e4e7" strokeWidth="1.2" strokeDasharray="1 9" strokeLinecap="round" />
          ))}
          {ROBOTS.map(([orbit, at, size, shade, lap, spin], i) => (
            <g
              key={i}
              className="orbit-go"
              style={{
                offsetPath: `path("${ellipse(ORBITS[orbit].rx, ORBITS[orbit].ry)}")`,
                offsetRotate: "0deg",
                animationDuration: `${lap}s`,
                animationDelay: `${-at * lap}s`,
              }}
            >
              <g
                className="orbit-spin"
                fill={shade}
                style={{ animationDuration: `${Math.abs(spin)}s`, animationDirection: spin < 0 ? "reverse" : "normal" }}
              >
                <g transform={`scale(${size})`}>
                  <Robot />
                </g>
              </g>
            </g>
          ))}
        </g>
      </svg>
      {/* The middle stays clear for the words. */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(34% 40% at 50% 50%, #fff 0, rgba(255,255,255,0.92) 45%, rgba(255,255,255,0) 100%)" }} />
    </div>
  );
}
