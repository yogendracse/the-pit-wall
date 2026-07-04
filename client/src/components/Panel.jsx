export default function Panel({ title, accent, right, children, className = "" }) {
  return (
    <section
      className={`bg-[var(--color-panel)] border border-[var(--color-border)] rounded-md overflow-hidden ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
          <h2 className="text-xs font-bold uppercase tracking-wide flex items-center gap-2">
            {accent && <span className={`w-1 h-3.5 rounded-sm ${accent}`} />}
            {title}
          </h2>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
