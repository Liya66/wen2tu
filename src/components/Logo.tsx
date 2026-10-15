/** The wen2tu rabbit: two ears that are also branches of a map. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill="#5b4fe9" />
      <path d="M26 30 C22 20 20 12 23 8 C27 6 30 16 30 28" fill="#fff" />
      <path d="M38 30 C42 20 44 12 41 8 C37 6 34 16 34 28" fill="#fff" />
      <circle cx="32" cy="40" r="14" fill="#fff" />
      <circle cx="27" cy="38" r="2" fill="#5b4fe9" />
      <circle cx="37" cy="38" r="2" fill="#5b4fe9" />
      <path d="M29.5 44 Q32 46.5 34.5 44" stroke="#5b4fe9" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  )
}
