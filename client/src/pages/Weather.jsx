import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useSession } from "../lib/SessionContext";
import { useTimingBoard } from "../lib/useTimingBoard";
import Panel from "../components/Panel";

export default function Weather() {
  const { session } = useSession();
  const board = useTimingBoard(session?.session_key);
  const latest = board.weather;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-3">
        <MetricTile label="Air Temp" value={fmt(latest?.air_temperature, "°C")} />
        <MetricTile label="Track Temp" value={fmt(latest?.track_temperature, "°C")} />
        <MetricTile label="Humidity" value={fmt(latest?.humidity, "%")} />
        <MetricTile label="Rainfall" value={latest?.rainfall ? "Yes" : "No"} highlight={!!latest?.rainfall} />
        <MetricTile label="Wind Speed" value={fmt(latest?.wind_speed, "m/s")} />
        <MetricTile label="Wind Direction" value={fmt(latest?.wind_direction, "°")} />
        <MetricTile label="Pressure" value={fmt(latest?.pressure, "hPa")} />
        <MetricTile
          label="Track Status"
          value={board.raceControl?.some((m) => /safety car|red flag/i.test(m.flag || "")) ? "Caution" : "Clear"}
        />
      </div>
      <Panel title="Track Temp Trend (this session)">
        <p className="text-xs text-[var(--color-muted)] mb-2">
          Higher track temp increases tire degradation rate — factor into Strategy Sim deg-rate slider.
        </p>
      </Panel>
    </div>
  );
}

function MetricTile({ label, value, highlight }) {
  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-md p-4">
      <p className="text-[10px] uppercase text-[var(--color-muted)] mb-1">{label}</p>
      <p className={`text-2xl font-mono font-bold ${highlight ? "text-[var(--color-red)]" : ""}`}>{value}</p>
    </div>
  );
}

function fmt(v, unit) {
  if (v === null || v === undefined) return "—";
  return `${v}${unit}`;
}
