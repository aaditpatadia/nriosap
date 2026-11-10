type P = [number, number];

// Rough outlines (longitude, latitude), only used to decide where the map's dots go.
const LAND: P[][] = [
  [[-168, 66], [-156, 71], [-128, 70], [-95, 72], [-80, 68], [-64, 60], [-56, 52], [-66, 45], [-75, 38], [-81, 31], [-80, 25], [-90, 29], [-97, 26], [-97, 20], [-88, 16], [-83, 9], [-78, 8], [-92, 15], [-105, 20], [-115, 30], [-124, 40], [-125, 49], [-135, 58], [-150, 60], [-165, 55]],
  [[-78, 8], [-60, 10], [-50, 0], [-35, -6], [-39, -18], [-48, -26], [-58, -38], [-66, -52], [-73, -52], [-72, -30], [-70, -18], [-81, -5]],
  [[-10, 37], [-9, 43], [-2, 44], [-4, 48], [5, 53], [8, 57], [5, 62], [15, 68], [28, 71], [45, 68], [70, 73], [100, 77], [140, 73], [170, 69], [178, 65], [162, 58], [155, 60], [140, 54], [135, 44], [128, 38], [122, 40], [121, 31], [117, 23], [108, 21], [109, 12], [104, 9], [100, 13], [98, 8], [103, 2], [100, 4], [97, 16], [92, 22], [88, 22], [81, 15], [78, 8], [73, 18], [70, 22], [62, 25], [56, 26], [52, 24], [56, 18], [45, 13], [39, 21], [34, 28], [35, 36], [27, 37], [22, 38], [16, 40], [12, 44], [5, 43], [0, 39], [-5, 36]],
  [[-16, 22], [-10, 32], [-5, 36], [10, 37], [20, 32], [32, 31], [37, 20], [43, 12], [51, 11], [40, -3], [40, -16], [33, -26], [26, -34], [18, -34], [12, -17], [13, -4], [9, 4], [-8, 5], [-16, 12]],
  [[-6, 50], [1, 51], [-2, 58], [-7, 57]],
  [[130, 32], [136, 34], [141, 36], [142, 43], [140, 41], [135, 36]],
  [[96, 5], [106, -6], [116, -8], [120, -2], [110, 2], [101, 2]],
];

const W = 840;
const H = 290;
const LON_MIN = -88;
const LAT_MAX = 62;
const round = (n: number) => Math.round(n * 10) / 10;
const project = ([lon, lat]: P): P => [round((lon - LON_MIN) * 4), round((LAT_MAX - lat) * 4.2)];

function inside([x, y]: P, poly: P[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const LAND_PATH = (() => {
  let d = "";
  for (let lat = LAT_MAX; lat > -8; lat -= 2.5) {
    for (let lon = LON_MIN; lon < 126; lon += 2.5) {
      if (LAND.some((p) => inside([lon, lat], p))) {
        const [x, y] = project([lon, lat]);
        d += `M${x} ${y}h0`;
      }
    }
  }
  return d;
})();

const ROUTES: { from: [string, P]; to: [string, P]; toSide: "start" | "end" }[] = [
  { from: ["London", [-0.1, 51.5]], to: ["Mumbai", [72.9, 19]], toSide: "end" },
  { from: ["New York", [-74, 40.7]], to: ["Delhi", [77.2, 28.6]], toSide: "start" },
  { from: ["Dubai", [55.3, 25.2]], to: ["Bengaluru", [77.6, 13]], toSide: "start" },
  { from: ["Toronto", [-79.4, 43.7]], to: ["Ahmedabad", [72.6, 23]], toSide: "end" },
  { from: ["Singapore", [103.8, 1.3]], to: ["Hyderabad", [78.5, 17.4]], toSide: "start" },
];

const STEPS = 16;
function arcPath(a: P, b: P) {
  const [ax, ay] = project(a);
  const [bx, by] = project(b);
  const lift = Math.min(90, Math.hypot(bx - ax, by - ay) * 0.26);
  return `M${ax} ${ay}Q${(ax + bx) / 2} ${Math.min(ay, by) - lift} ${bx} ${by}`;
}

function arcDots(a: P, b: P, routeIndex: number) {
  const [ax, ay] = project(a);
  const [bx, by] = project(b);
  const lift = Math.min(90, Math.hypot(bx - ax, by - ay) * 0.26);
  const cx = (ax + bx) / 2;
  const cy = Math.min(ay, by) - lift;
  return Array.from({ length: STEPS }, (_, i) => {
    const t = (i + 1) / (STEPS + 1);
    const u = 1 - t;
    return { x: round(u * u * ax + 2 * u * t * cx + t * t * bx), y: round(u * u * ay + 2 * u * t * cy + t * t * by), delay: round(routeIndex * 0.55 + i * 0.12) };
  });
}

/** Example routes between cities abroad and cities in India. Illustration only, not a statement of where we operate. */
export function GlobalMap() {
  return (
    <figure className="m-0 grid gap-2">
      <svg role="img" aria-label="A map of example connections: London to Mumbai, New York to Delhi, Toronto to Ahmedabad, Dubai to Bengaluru and Singapore to Hyderabad" viewBox={`0 0 ${W} ${H}`} className="thread">
        <path d={LAND_PATH} className="map-land" />
        {ROUTES.map((r, i) => (
          <g key={r.from[0]}>
            <path d={arcPath(r.from[1], r.to[1])} className="map-arc" />
            {arcDots(r.from[1], r.to[1], i).map((d) => <circle key={`${d.x}-${d.y}`} className="thread-dot" cx={d.x} cy={d.y} r="2.2" style={{ animationDelay: `${d.delay}s` }} />)}
            <circle cx={project(r.from[1])[0]} cy={project(r.from[1])[1]} r="4" className="pin-a" />
            <circle cx={project(r.to[1])[0]} cy={project(r.to[1])[1]} r="3.5" className="pin-b" />
            <text x={project(r.from[1])[0] + (r.from[0] === "Dubai" ? -8 : 8)} y={project(r.from[1])[1] + (r.from[0] === "Singapore" || r.from[0] === "New York" ? 14 : -7)} textAnchor={r.from[0] === "Dubai" ? "end" : "start"} className="map-label">{r.from[0]}</text>
            <text x={project(r.to[1])[0] + (r.toSide === "start" ? 8 : -8)} y={project(r.to[1])[1] + 4} textAnchor={r.toSide} className="map-label">{r.to[0]}</text>
          </g>
        ))}
      </svg>
      <figcaption className="text-[length:var(--text-micro)] text-muted">Illustrative routes only. Not a list of where we operate today.</figcaption>
    </figure>
  );
}
