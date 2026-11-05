/** Connected A: a production flow joined by an intelligent execution layer. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M7 32 20 7l13 25M12 23h16"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="7" r="3.5" fill="currentColor" />
      <circle cx="12" cy="23" r="3" fill="currentColor" />
      <circle cx="28" cy="23" r="3" fill="currentColor" />
    </svg>
  );
}
