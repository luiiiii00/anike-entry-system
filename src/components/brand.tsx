export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 ring-1 ring-border">
        <span className="absolute h-1.5 w-1.5 rounded-full bg-ok top-2" />
        <span className="absolute h-1.5 w-1.5 rounded-full bg-warn" />
        <span className="absolute h-1.5 w-1.5 rounded-full bg-stop bottom-2" />
      </span>
      <span className="leading-tight">
        <span className="block font-display text-sm font-semibold tracking-[0.14em]">
          ANIKE EJEPIKA
        </span>
        {!compact && (
          <span className="label-mono block">Trading Entry System</span>
        )}
      </span>
    </div>
  );
}
