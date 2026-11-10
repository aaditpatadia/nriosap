"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Instead of waiting on placeholders forever: after a while, say so and offer another try. */
export function SlowNotice({ after = 10_000 }: { after?: number }) {
  const router = useRouter();
  const [late, setLate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLate(true), after);
    return () => clearTimeout(t);
  }, [after]);
  if (!late) return null;
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3" role="alert">
      <p className="text-[length:var(--text-small)]">This is taking longer than usual. Your connection may be slow, or Ally may be busy.</p>
      <button type="button" className="btn btn-secondary" onClick={() => { router.refresh(); setLate(false); }}>Try again</button>
    </div>
  );
}
