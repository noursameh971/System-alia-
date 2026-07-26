import { BrandToggle } from "./BrandToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          AN
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Alia Hijab &amp; Noori</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Inventory &amp; Orders</p>
        </div>
      </div>

      <BrandToggle />
    </header>
  );
}
