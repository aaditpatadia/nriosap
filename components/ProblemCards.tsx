import { Reveal } from "./Reveal";

const PROBLEMS: [string, string][] = [
  ["Nobody to visit the property", "You paid for it, and you have no idea what it looks like today."],
  ["Bills and deadlines slipping", "The notice went to an empty flat. You found out when the penalty arrived."],
  ["Documents everywhere", "One is on WhatsApp, one in old email, and one in a folder at your uncle's house."],
  ["Family stretched thin", "Your sister is coordinating three people on top of her own job."],
  ["Local help you cannot rely on", "The plumber said tomorrow. That was two weeks ago."],
  ["No clear progress", "You ask if it is done. You get a thumbs up, and no way of knowing."],
  ["Uncertainty about costs", "The price changes after the work starts, and you cannot check it."],
  ["Time zones", "By the time you are free to call, every office in India has closed."],
];

export function ProblemCards() {
  return (
    <ul className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-4">
      {PROBLEMS.map(([t, d], i) => (
        <li key={t} className="border-t border-line py-5">
          <Reveal delay={Math.min(i, 5) * 0.04}>
            <h3 className="font-semibold">{t}</h3>
            <p className="mt-1 text-[length:var(--text-small)] text-muted">{d}</p>
          </Reveal>
        </li>
      ))}
    </ul>
  );
}
