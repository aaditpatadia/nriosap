const COUNT = 34;
const START = { x: 36, y: 196 };
const CONTROL = { x: 320, y: -86 };
const END = { x: 604, y: 196 };

const DOTS = Array.from({ length: COUNT }, (_, i) => {
  const t = (i + 1) / (COUNT + 1);
  const u = 1 - t;
  const round = (n: number) => Math.round(n * 10) / 10;
  return { x: round(u * u * START.x + 2 * u * t * CONTROL.x + t * t * END.x), y: round(u * u * START.y + 2 * u * t * CONTROL.y + t * t * END.y), delay: round(i * 0.09) };
});

/** The thread between two homes. A light runs along it by fading each dot in turn, so only opacity animates. */
export function ThreadArc({ from = "You, anywhere", to = "Home, in India", className = "" }: { from?: string; to?: string; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 640 240" className={`thread ${className}`}>
      {DOTS.map((d) => <circle key={d.x} className="thread-dot" cx={d.x} cy={d.y} r="3.2" style={{ animationDelay: `${d.delay}s` }} />)}
      <g transform={`translate(${START.x} ${START.y})`}>
        <circle className="pin-ring" r="11" />
        <circle r="7.5" className="pin-a" />
      </g>
      <g transform={`translate(${END.x} ${END.y})`}>
        <circle className="pin-ring pin-ring-late" r="11" />
        <circle r="7.5" className="pin-b" />
      </g>
      <text x={START.x - 8} y="230" className="thread-label">{from}</text>
      <text x={END.x + 8} y="230" textAnchor="end" className="thread-label">{to}</text>
    </svg>
  );
}
