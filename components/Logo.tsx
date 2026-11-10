/** The Ally mark: two homes joined by one line. Kept to three shapes so it reads at 16px. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 64 64" className="shrink-0">
      <rect width="64" height="64" rx="18" fill="#14211f" />
      <path d="M17 41C21 23 43 23 47 41" fill="none" stroke="#6fd39a" strokeWidth="6" strokeLinecap="round" />
      <circle cx="17" cy="42" r="6" fill="#ffffff" />
      <circle cx="47" cy="42" r="6" fill="#6fd39a" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-[1.3rem] font-extrabold tracking-[-0.03em]">
      <LogoMark />
      Ally
    </span>
  );
}
