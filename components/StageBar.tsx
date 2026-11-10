import { STAGES, STATUS_META, type RequestStatus } from "@/lib/request-engine";

/** The six stages of a request. The fill is a scale transform. */
export function StageBar({ status }: { status: RequestStatus }) {
  const step = STATUS_META[status].step;
  const stopped = status === "cancelled";
  return (
    <div className="grid gap-2" role="img" aria-label={`Stage ${step + 1} of ${STAGES.length}: ${STAGES[step]}`}>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        {!stopped && <div className="stage-fill h-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${(step + 1) / STAGES.length})` }} />}
      </div>
      <div className="flex justify-between gap-1 text-[length:var(--text-micro)]">
        {STAGES.map((s, i) => <span key={s} className={!stopped && i <= step ? "font-semibold text-ink" : "text-muted"}>{s}</span>)}
      </div>
    </div>
  );
}
