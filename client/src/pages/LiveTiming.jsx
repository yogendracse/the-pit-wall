import { useSession } from "../lib/SessionContext";
import { useTimingBoard, formatSec, formatGap } from "../lib/useTimingBoard";
import Panel from "../components/Panel";

const COMPOUND_LABEL = { SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W" };
const COMPOUND_COLOR = {
  SOFT: "text-[var(--color-red)] border-[var(--color-red)]",
  MEDIUM: "text-[var(--color-amber)] border-[var(--color-amber)]",
  HARD: "text-[var(--color-text)] border-[var(--color-text)]",
  INTERMEDIATE: "text-[var(--color-green)] border-[var(--color-green)]",
  WET: "text-blue-400 border-blue-400",
};

export default function LiveTiming() {
  const { session, loading: sessionLoading, error: sessionError } = useSession();
  const board = useTimingBoard(session?.session_key);

  if (sessionLoading) return <Centered>Loading session…</Centered>;
  if (sessionError) return <Centered error>{sessionError}</Centered>;
  if (!session) return <Centered error>No session found.</Centered>;

  const trackClear = !board.raceControl?.some((m) => /yellow|safety car|red flag/i.test(m.flag || ""));

  return (
    <div className="grid grid-cols-[1fr_320px] gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-6 px-4 py-2 bg-[var(--color-panel)] border border-[var(--color-border)] rounded-md text-xs">
          <StatusPill ok={trackClear} label={trackClear ? "TRACK CLEAR" : "CAUTION"} />
          <Stat label="AIR" value={fmtTemp(board.weather?.air_temperature)} />
          <Stat label="TRACK" value={fmtTemp(board.weather?.track_temperature)} />
          <Stat label="HUMIDITY" value={board.weather?.humidity != null ? `${board.weather.humidity}%` : "—"} />
          {board.stale && (
            <span className="ml-auto text-[var(--color-amber)] uppercase tracking-wide">Stale data</span>
          )}
          <span className="text-[var(--color-muted)]">
            {session.session_name} · {session.circuit_short_name}
          </span>
        </div>

        <Panel className="p-0">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-[var(--color-muted)] uppercase text-[10px] border-b border-[var(--color-border)]">
                <Th>Pos</Th>
                <Th align="left">Driver</Th>
                <Th align="left">Team</Th>
                <Th>Gap</Th>
                <Th>Int</Th>
                <Th>Last Lap</Th>
                <Th>Best Lap</Th>
                <Th>S1</Th>
                <Th>S2</Th>
                <Th>S3</Th>
                <Th>Tyre</Th>
                <Th>Pits</Th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((r) => (
                <tr
                  key={r.driverNumber}
                  className="border-b border-[var(--color-border)]/60 hover:bg-white/5"
                >
                  <Td className="text-[var(--color-muted)]">{r.position ?? "—"}</Td>
                  <Td align="left">
                    <span className="font-bold">{r.name?.toUpperCase()}</span>{" "}
                    <span className="text-[var(--color-muted)]">{r.acronym}</span>
                  </Td>
                  <Td align="left" style={{ color: r.teamColor }}>
                    {r.team}
                  </Td>
                  <Td>{formatGap(r.gap)}</Td>
                  <Td>{formatGap(r.interval)}</Td>
                  <Td>{formatSec(r.lastLap)}</Td>
                  <Td className="text-[var(--color-green)]">{formatSec(r.bestLap)}</Td>
                  <Td>{r.sector1?.toFixed(1) ?? "—"}</Td>
                  <Td>{r.sector2?.toFixed(1) ?? "—"}</Td>
                  <Td>{r.sector3?.toFixed(1) ?? "—"}</Td>
                  <Td>
                    {r.compound && (
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full border ${
                          COMPOUND_COLOR[r.compound] || ""
                        }`}
                      >
                        {COMPOUND_LABEL[r.compound] || "?"}
                      </span>
                    )}{" "}
                    {r.tyreAge != null ? `${r.tyreAge}L` : ""}
                  </Td>
                  <Td>{r.pitCount}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="Live Incident Feed">
          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto">
            {board.raceControl?.length ? (
              board.raceControl.map((m, i) => (
                <IncidentCard key={i} message={m} />
              ))
            ) : (
              <p className="text-[var(--color-muted)] text-xs">No recent messages.</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function formatIncidentTime(date) {
  if (!date) return "";
  const parsed = new Date(date);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString();
  }
  return date; // Fallback to raw string if relative offset e.g. "00:14:18.746"
}

function IncidentCard({ message }) {
  const isWarning = /yellow|safety car|red flag|caution/i.test(message.flag || message.category || "");
  return (
    <div
      className={`border-l-2 pl-3 py-1.5 rounded-sm bg-white/5 ${
        isWarning ? "border-[var(--color-red)]" : "border-[var(--color-border)]"
      }`}
    >
      <p className="text-xs font-bold uppercase">{message.category}</p>
      <p className="text-xs text-[var(--color-muted)]">{message.message}</p>
      <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
        {formatIncidentTime(message.date)}
      </p>
    </div>
  );
}

function StatusPill({ ok, label }) {
  return (
    <span className="flex items-center gap-2 font-bold uppercase tracking-wide">
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-[var(--color-green)]" : "bg-[var(--color-red)]"}`} />
      <span className={ok ? "text-[var(--color-green)]" : "text-[var(--color-red)]"}>{label}</span>
    </span>
  );
}

function Stat({ label, value }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="font-mono">{value}</span>
    </span>
  );
}

function Th({ children, align = "center" }) {
  return (
    <th className={`py-2 px-2 font-normal ${align === "left" ? "text-left" : "text-center"}`}>
      {children}
    </th>
  );
}

function Td({ children, align = "center", className = "", style }) {
  return (
    <td
      className={`py-1.5 px-2 ${align === "left" ? "text-left" : "text-center"} ${className}`}
      style={style}
    >
      {children}
    </td>
  );
}

function Centered({ children, error }) {
  return (
    <div className={`flex items-center justify-center h-64 ${error ? "text-[var(--color-red)]" : "text-[var(--color-muted)]"}`}>
      {children}
    </div>
  );
}

function fmtTemp(v) {
  return v != null ? `${v.toFixed(1)}°C` : "—";
}
