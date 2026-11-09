/** The Ally mark: two homes joined by one thread. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 64 64">
      <rect width="64" height="64" rx="18" fill="#0f352e" />
      <path d="M13 44C17 18 47 18 51 44" fill="none" stroke="#f2b84b" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 9.4" />
      <circle cx="13" cy="44" r="6.5" fill="#fbf7ef" />
      <circle cx="51" cy="44" r="6.5" fill="#f2b84b" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-xl font-extrabold tracking-tight">
      <LogoMark />
      Ally
    </span>
  );
}
