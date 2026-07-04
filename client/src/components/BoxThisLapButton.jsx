export default function BoxThisLapButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="fixed left-4 bottom-4 z-20 bg-[var(--color-red)] hover:bg-[var(--color-red-dim)] text-white font-bold text-xs uppercase tracking-wide rounded px-4 py-3 shadow-lg shadow-black/40"
    >
      Box This
      <br />
      Lap
    </button>
  );
}
