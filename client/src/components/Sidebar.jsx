const ICONS = [
  { key: "pitwall", label: "Pit Wall", glyph: "⊞" },
  { key: "telemetry", label: "Telemetry", glyph: "◔" },
  { key: "map", label: "Map", glyph: "⛛" },
  { key: "tires", label: "Tires", glyph: "◉" },
  { key: "radio", label: "Radio", glyph: "🎙" },
  { key: "logs", label: "Logs", glyph: "≡" },
];

export default function Sidebar({ active, onSelect }) {
  return (
    <aside className="w-16 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-panel)] flex flex-col items-center py-3 gap-1">
      {ICONS.map((icon) => {
        const isActive = active === icon.key;
        return (
          <button
            key={icon.key}
            onClick={() => onSelect?.(icon.key)}
            className={`w-14 py-2 flex flex-col items-center gap-1 rounded text-[10px] tracking-wide uppercase transition-colors ${
              isActive
                ? "text-[var(--color-green)] border-l-2 border-[var(--color-green)] bg-white/5"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <span className="text-lg leading-none">{icon.glyph}</span>
            {icon.label}
          </button>
        );
      })}
    </aside>
  );
}
