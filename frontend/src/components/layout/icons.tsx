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

export function DashboardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <path d="M4.5 19.5v-7.5M10.5 19.5v-12M16.5 19.5v-4.5M4.5 19.5h15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BuildingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <rect x="5.25" y="3.75" width="13.5" height="16.5" rx="0.75" />
      <path d="M8.25 7.5h.008M12 7.5h.008M15.75 7.5h.008M8.25 11.25h.008M12 11.25h.008M15.75 11.25h.008M8.25 15h.008M15.75 15h.008" strokeLinecap="round" />
      <path d="M10.5 20.25V16.5h3v3.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LogoutIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className}>
      <path d="M15.75 8.25V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h8.25a1.5 1.5 0 0 0 1.5-1.5v-2.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.75 12h10.5m0 0-3-3m3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
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
