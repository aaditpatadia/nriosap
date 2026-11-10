import { SlowNotice } from "./SlowNotice";

/**
 * Loading states drawn to the size of the real page, so nothing jumps when data arrives.
 * They fade in after a short pause, so a fast answer never flashes grey.
 */
const Bar = ({ w, h = 12, className = "" }: { w: string; h?: number; className?: string }) => <span aria-hidden className={`skeleton block ${className}`} style={{ width: w, height: h }} />;

export function Rows({ count = 4, tall = false }: { count?: number; tall?: boolean }) {
  return (
    <ul className="rows" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={`flex items-center justify-between gap-4 ${tall ? "py-4" : "py-3"}`}>
          <span className="grid flex-1 gap-2"><Bar w={`${70 - i * 7}%`} /><Bar w={`${40 - i * 3}%`} h={10} /></span>
          <Bar w="72px" h={20} />
        </li>
      ))}
    </ul>
  );
}

export function PanelSkeleton({ rows = 4, title = "40%" }: { rows?: number; title?: string }) {
  return <div className="card grid gap-3"><Bar w={title} h={16} /><Rows count={rows} /></div>;
}

export function MetricsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="metric-strip" data-cols="4" aria-hidden>
      {Array.from({ length: count }, (_, i) => <div key={i} className="metric-cell"><Bar w="44px" h={30} /><Bar w="70%" h={10} /></div>)}
    </div>
  );
}

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="skel-in grid gap-5" role="status" aria-label={label} aria-busy="true">
      {children}
      <SlowNotice />
    </div>
  );
}

const Header = ({ action = true }: { action?: boolean }) => (
  <div className="flex flex-wrap items-start justify-between gap-3" aria-hidden><span className="grid gap-2"><Bar w="260px" h={26} /><Bar w="200px" h={12} /></span>{action && <Bar w="132px" h={44} />}</div>
);

export function HomeSkeleton() {
  return (
    <Frame label="Loading your home page">
      <Header />
      <MetricsSkeleton />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-5"><PanelSkeleton rows={3} /><PanelSkeleton rows={3} /><PanelSkeleton rows={4} /></div>
        <div className="grid content-start gap-5"><PanelSkeleton rows={3} title="60%" /><PanelSkeleton rows={5} title="30%" /></div>
      </div>
    </Frame>
  );
}

export function ListSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Frame label={label}>
      <Header />
      <div className="tab-row" aria-hidden>{[64, 96, 80, 48].map((w) => <span key={w} className="tab"><Bar w={`${w}px`} /></span>)}</div>
      <div className="card p-0"><div className="px-4"><Rows count={6} tall /></div></div>
    </Frame>
  );
}

export function DetailSkeleton() {
  return (
    <Frame label="Loading the request">
      <span className="grid gap-2" aria-hidden><Bar w="160px" h={10} /><Bar w="60%" h={26} /></span>
      <div className="card" aria-hidden><Bar w="100%" h={6} /></div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid content-start gap-5"><PanelSkeleton rows={2} /><PanelSkeleton rows={4} /></div>
        <div className="grid content-start gap-5"><PanelSkeleton rows={5} title="50%" /><PanelSkeleton rows={3} /></div>
      </div>
    </Frame>
  );
}

export function VaultSkeleton() {
  return (
    <Frame label="Loading your documents">
      <Header />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-4">
          <div aria-hidden className="flex gap-2"><Bar w="100%" h={48} /><Bar w="96px" h={48} /></div>
          <div className="tab-row" aria-hidden>{[56, 72, 72, 88, 72].map((w, i) => <span key={i} className="tab"><Bar w={`${w}px`} /></span>)}</div>
          {[0, 1, 2].map((i) => <div key={i} className="card grid gap-2" aria-hidden><Bar w="45%" h={16} /><Bar w="70%" h={10} /><Bar w="30%" h={10} /></div>)}
        </div>
        <PanelSkeleton rows={3} />
      </div>
    </Frame>
  );
}

export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Frame label={label}>
      <Header action={false} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]"><PanelSkeleton rows={5} /><PanelSkeleton rows={4} /></div>
    </Frame>
  );
}

export function OpsSkeleton() {
  return (
    <Frame label="Loading the desk">
      <Header />
      <div className="metric-strip" aria-hidden>{Array.from({ length: 5 }, (_, i) => <div key={i} className="metric-cell"><Bar w="40px" h={30} /><Bar w="70%" h={10} /></div>)}</div>
      <div className="card grid gap-3" aria-hidden><div className="flex flex-wrap gap-2">{[160, 120, 120, 120].map((w, i) => <Bar key={i} w={`${w}px`} h={44} />)}</div></div>
      <div className="table-box p-4"><Rows count={8} /></div>
    </Frame>
  );
}
