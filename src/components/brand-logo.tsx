import { cn } from "cn";

/** Two interlocking wedding rings (inline SVG) beside the wordmark. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 40 28"
        className="h-7 w-10 shrink-0"
        fill="none"
        strokeWidth="3"
        aria-hidden
      >
        <circle cx="14" cy="14" r="9" className="stroke-primary" />
        <circle cx="26" cy="14" r="9" className="stroke-gold" />
        <path d="M20 6.2a9 9 0 0 1 0 15.6" className="stroke-primary" />
      </svg>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-bold text-foreground">Wedding</span>
        <span className="text-xs font-semibold tracking-wide text-gold">Soundboard</span>
      </span>
    </span>
  );
}
