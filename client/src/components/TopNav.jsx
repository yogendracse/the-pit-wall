import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/", label: "Live Timing" },
  { to: "/strategy", label: "Strategy Sim" },
  { to: "/ers", label: "Tyre Data" },
  { to: "/weather", label: "Weather" },
];

export default function TopNav() {
  return (
    <header className="h-14 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-panel)] flex items-center px-5 gap-8">
      <div className="text-[var(--color-red)] font-bold tracking-widest text-lg">
        APEX TELEMETRY
      </div>
      <nav className="flex items-center gap-6 text-sm">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) =>
              `pb-1 uppercase tracking-wide transition-colors ${
                isActive
                  ? "text-[var(--color-text)] border-b-2 border-[var(--color-red)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-4 text-[var(--color-muted)]">
        <span>🔔</span>
        <span>⚙</span>
        <span className="w-7 h-7 rounded-full bg-[var(--color-panel-2)] border border-[var(--color-border)]" />
      </div>
    </header>
  );
}
