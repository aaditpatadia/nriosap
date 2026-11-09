"use client";

import { useSyncExternalStore } from "react";

const subscribe = (fn: () => void) => {
  const t = setInterval(fn, 20_000);
  return () => clearInterval(t);
};
const minuteNow = () => Math.floor(Date.now() / 60_000);

/** The time where your parents are. The dial turns once a day. */
export function IndiaClock({ city }: { city: string }) {
  const minute = useSyncExternalStore(subscribe, minuteNow, () => -1);
  const ready = minute >= 0;
  const india = ready ? (minute + 330) % 1440 : 720;
  const hour = Math.floor(india / 60);
  const day = hour >= 6 && hour < 18;
  const label = ready ? `${((hour + 11) % 12) + 1}:${String(india % 60).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}` : "--:--";
  const hint = hour >= 8 && hour < 21 ? "A good time to call." : "It is late there. A message may be kinder.";
  return (
    <div className="card flex items-center gap-4">
      <div aria-hidden className="clock-dial">
        <span className="clock-hand" style={{ transform: `rotate(${(india / 1440) * 360 - 180}deg)` }}>
          <span className={day ? "clock-sun" : "clock-moon"} />
        </span>
      </div>
      <div>
        <p className="text-[length:var(--text-small)] text-muted">In {city} it is</p>
        <p className="text-[length:var(--text-h2)] font-bold leading-tight">{label}</p>
        {ready && <p className="text-[length:var(--text-small)] text-muted">{hint}</p>}
      </div>
    </div>
  );
}
