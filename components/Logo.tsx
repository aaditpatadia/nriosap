/** The Ally mark: two homes joined by one thread. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 64 64" className="shrink-0">
      <rect width="64" height="64" rx="15" fill="#0f1c2b" />
      <path d="M13 44C17 18 47 18 51 44" fill="none" stroke="#5edcc0" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 9.4" />
      <circle cx="13" cy="44" r="6.5" fill="#f7f6f2" />
      <circle cx="51" cy="44" r="6.5" fill="#5edcc0" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
      <LogoMark />
      Ally
    </span>
  );
}
