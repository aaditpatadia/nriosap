/** A paper drops into the vault and the lock closes. Every moving part uses transform and opacity. */
export function VaultGraphic() {
  return (
    <svg aria-hidden viewBox="0 0 320 240" className="vault">
      <g className="vault-paper">
        <rect x="118" y="6" width="84" height="104" rx="9" fill="#fbf7ef" />
        <rect x="132" y="26" width="56" height="7" rx="3.5" fill="#1f6f5c" />
        <rect x="132" y="44" width="44" height="6" rx="3" fill="#c9bfae" />
        <rect x="132" y="60" width="50" height="6" rx="3" fill="#c9bfae" />
        <rect x="132" y="76" width="34" height="6" rx="3" fill="#c9bfae" />
      </g>
      <rect x="62" y="118" width="196" height="112" rx="20" fill="#f2b84b" />
      <rect x="86" y="112" width="148" height="14" rx="7" fill="#0b2823" />
      <g className="vault-shackle">
        <path d="M144 168v-14a16 16 0 0 1 32 0v14" fill="none" stroke="#0f352e" strokeWidth="8" strokeLinecap="round" />
      </g>
      <rect x="134" y="164" width="52" height="42" rx="10" fill="#0f352e" />
      <circle cx="160" cy="184" r="6" fill="#f2b84b" />
    </svg>
  );
}
