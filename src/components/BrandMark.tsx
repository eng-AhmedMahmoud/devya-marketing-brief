export function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const txt = { sm: 'text-xs', md: 'text-sm', lg: 'text-lg' }[size];
  const mono = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' }[size];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`${mono} font-mono font-semibold text-ink-300`}>&lt;/&gt;</span>
      <span className={`${txt} font-semibold tracking-[3px] text-ink-100`}>DEVYA</span>
    </span>
  );
}
