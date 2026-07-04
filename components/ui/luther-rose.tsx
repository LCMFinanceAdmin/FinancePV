export function LutherRose({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="19.5" fill="#ca8a04" />
      <circle cx="20" cy="20" r="17" fill="#1e3a8a" />
      {[0, 72, 144, 216, 288].map(deg => (
        <ellipse key={deg} cx="20" cy="10.5" rx="3.6" ry="5.8" fill="white"
          transform={`rotate(${deg}, 20, 20)`} opacity="0.95" />
      ))}
      <circle cx="20" cy="20" r="7.5" fill="white" />
      <path
        d="M20 26C17.5 23.5 13 20 13 16C13 13.5 15 12 17.5 12C18.9 12 19.7 13 20 13.5C20.3 13 21.1 12 22.5 12C25 12 27 13.5 27 16C27 20 22.5 23.5 20 26Z"
        fill="#dc2626"
      />
      <rect x="18.8" y="12.5" width="2.4" height="12.5" fill="#111827" rx="0.4" />
      <rect x="14" y="18.8" width="12" height="2.4" fill="#111827" rx="0.4" />
    </svg>
  );
}
