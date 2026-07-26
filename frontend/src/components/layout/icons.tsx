type IconProps = { className?: string };

export function ProductsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <path
        d="M3.75 8.25 12 3.75l8.25 4.5v7.5L12 20.25l-8.25-4.5v-7.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3.75 8.25 12 12.75l8.25-4.5M12 12.75v7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function InventoryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.75 6.75v10.5M17.25 6.75v10.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OrdersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <path
        d="M8.25 4.5h7.5a1.5 1.5 0 0 1 1.5 1.5v13.5l-5.25-3-5.25 3V6a1.5 1.5 0 0 1 1.5-1.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function QrCodeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <rect x="3.75" y="3.75" width="6" height="6" rx="0.75" />
      <rect x="14.25" y="3.75" width="6" height="6" rx="0.75" />
      <rect x="3.75" y="14.25" width="6" height="6" rx="0.75" />
      <path d="M14.25 14.25h2.5v2.5h-2.5zM19.25 14.25h.75v.75M14.25 19.25h.75v.75M17.5 17.5h2.5v2.5h-2.5z" />
    </svg>
  );
}
