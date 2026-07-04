import { useState } from "react";
import { NavLink } from "react-router-dom";
import SessionSelectorModal from "./SessionSelectorModal";

const TABS = [
  { to: "/", label: "Live Timing" },
  { to: "/strategy", label: "Strategy Sim" },
  { to: "/ers", label: "Tyre Data" },
  { to: "/weather", label: "Weather" },
];

export default function TopNav() {
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  return (
    <header className="h-14 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-panel)] flex items-center px-5 gap-8">
      <div className="text-[var(--color-red)] font-bold tracking-widest text-lg">
        THE PIT WALL
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
        <button
          onClick={() => setIsSelectorOpen(true)}
          className="flex items-center gap-2 bg-[var(--color-panel-2)] hover:bg-[var(--color-panel-3)] border border-[var(--color-border)] text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded transition-all text-[var(--color-text)] cursor-pointer"
        >
          📂 Load Session
        </button>
        <span className="w-7 h-7 rounded-full bg-[var(--color-panel-2)] border border-[var(--color-border)] flex items-center justify-center font-bold text-xs text-[var(--color-text)]">
          🏎
        </span>
      </div>
      {isSelectorOpen && (
        <SessionSelectorModal onClose={() => setIsSelectorOpen(false)} />
      )}
    </header>
  );
}
