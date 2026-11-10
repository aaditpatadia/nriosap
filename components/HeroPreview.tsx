import { Glyph, type NavIcon } from "./FamilyNav";

/**
 * A picture of the real Home page, drawn from the same parts, with clearly made-up data.
 * It is not interactive and links nowhere, so nobody mistakes it for their account.
 */
export function HeroPreview() {
  const rows: [NavIcon, string, string, string, string][] = [
    ["tool", "#1f7a4c", "Leak check at the Mumbai flat", "Repairs", "In progress"],
    ["doc", "#6d48b5", "Certified copy of a birth certificate", "Paperwork", "Needs your OK"],
    ["building", "#2f6aa8", "Property tax for the Pune flat", "Property", "Done"],
  ];
  return (
    <figure className="hero-frame" aria-label="A sample of the Ally home page, with made-up data">
      <div className="hero-chrome" aria-hidden><span /><span /><span /><em>Example only</em></div>
      <div aria-hidden className="grid gap-3 p-3 sm:p-4">
        <div className="band-dark hero-band">
          <div className="band-tile" data-plain="true">
            <p className="band-day">Monday</p>
            <p className="band-date">14</p>
            <p className="band-note">1 thing needs you</p>
          </div>
          <div className="grid content-start gap-2">
            <p className="band-pill">Coming up (3)<span className="band-pill-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg></span></p>
            <div className="band-tile">
              <p className="band-title">Electricity bill, Rs 4,200</p>
              <span className="band-chip w-fit">In 6 days</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([["Active", 3, true], ["To approve", 1, false], ["Due soon", 4, false]] as const).map(([label, n, hl]) => (
            <div key={label} className="stat hero-stat" data-hl={hl}><span className="stat-label">{label}</span><span className="stat-value">{n}</span></div>
          ))}
        </div>
        <ul className="grid gap-2">
          {rows.map(([icon, color, title, kind, status]) => (
            <li key={title} className="hero-row">
              <span className="dt-avatar" style={{ background: color }}><Glyph name={icon} /></span>
              <span className="min-w-0"><span className="block truncate font-semibold">{title}</span><span className="block text-[length:var(--text-micro)] text-muted">{kind}</span></span>
              <span className="chip" data-tone={status === "Done" ? "ok" : status === "Needs your OK" ? "warn" : "accent"}>{status}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
