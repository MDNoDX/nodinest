/** A round arrow with the seconds inside: how far a press moves. */
export function SeekIcon({ dir, className }: { dir: 1 | -1; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {dir === -1 ? (
        <>
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 4v4h4" />
        </>
      ) : (
        <>
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 4v4h-4" />
        </>
      )}
      <text
        x={dir === -1 ? 12.4 : 11.6}
        y="15.6"
        textAnchor="middle"
        fontSize="7.8"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        10
      </text>
    </svg>
  );
}
