import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useSession } from "../lib/SessionContext";
import { useTimingBoard } from "../lib/useTimingBoard";
import { projectDelta, undercutAnalysis } from "../lib/strategyMath";
import Panel from "../components/Panel";

const COMPOUNDS = ["SOFT", "MEDIUM", "HARD"];

export default function StrategySim() {
  const { session, drivers } = useSession();
  const board = useTimingBoard(session?.session_key);

  const [driverNumber, setDriverNumber] = useState(null);
  const [rivalNumber, setRivalNumber] = useState(null);
  const [pitLossSec, setPitLossSec] = useState(21.0);
  const [degRate, setDegRate] = useState(0.085);
  const [lapsRemaining, setLapsRemaining] = useState(30);
  const [newCompound, setNewCompound] = useState("MEDIUM");

  const driverRow = board.rows.find((r) => r.driverNumber === (driverNumber ?? board.rows[0]?.driverNumber));
  const rivalRow = board.rows.find((r) => r.driverNumber === (rivalNumber ?? board.rows[1]?.driverNumber));

  const tireAge = driverRow?.tyreAge ?? 0;
  const compound = driverRow?.compound ?? "MEDIUM";

  const projection = useMemo(
    () =>
      projectDelta({
        tireAge,
        lapsRemaining,
        compound,
        newCompound,
        degRate: { [compound]: degRate },
        pitLossSec,
        underSafetyCar: board.safetyCarWindow?.active,
      }),
    [tireAge, lapsRemaining, compound, newCompound, degRate, pitLossSec, board.safetyCarWindow]
  );

  const undercut = useMemo(
    () =>
      undercutAnalysis({
        gapToRivalSec: (rivalRow?.gap ?? 0) - (driverRow?.gap ?? 0),
        rivalTireAge: rivalRow?.tyreAge ?? 0,
        compound,
        newCompound,
        degRate: { [compound]: degRate },
        pitLossSec,
        lapsToEvaluate: 5,
        underSafetyCar: board.safetyCarWindow?.active,
      }),
    [rivalRow, driverRow, compound, newCompound, degRate, pitLossSec, board.safetyCarWindow]
  );

  const chartData = projection.map((p) => ({
    lap: `L${p.lap}`,
    Stay: p.stayDelta,
    Pit: p.pitDelta,
  }));

  const crossoverLap = projection.find((p) => p.pitDelta < p.stayDelta)?.lap;
  const undercutWinLap = undercut.find((u) => u.aheadOfRival)?.lap;

  return (
    <div className="grid grid-cols-[1fr_320px] gap-4">
      <div className="flex flex-col gap-3">
        <Panel
          title="Strategy Delta Projection"
          accent="bg-[var(--color-red)]"
          right={
            <div className="flex items-center gap-4 text-xs">
              <Legend color="var(--color-red)" label="Stay" />
              <Legend color="var(--color-green)" label="Pit" />
            </div>
          }
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="lap" stroke="var(--color-muted)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--color-muted)" tick={{ fontSize: 11 }} unit="s" />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-panel-2)",
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="Stay" stroke="#e88c86" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Pit" stroke="var(--color-green)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {crossoverLap && (
            <p className="text-xs text-[var(--color-muted)] mt-2">
              Pit line crosses below stay line around lap {crossoverLap} — pitting becomes net-positive from there.
            </p>
          )}
        </Panel>

        <Panel title="Undercut Analysis">
          <div className="flex items-center justify-between mb-3">
            <DriverSelect
              label="Current"
              drivers={drivers}
              value={driverRow?.driverNumber}
              onChange={setDriverNumber}
            />
            <DriverSelect
              label="Rival"
              drivers={drivers}
              value={rivalRow?.driverNumber}
              onChange={setRivalNumber}
            />
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[10px] uppercase text-[var(--color-muted)]">Gap to Rival</p>
              <p className="text-2xl font-mono font-bold">
                {formatGap((rivalRow?.gap ?? 0) - (driverRow?.gap ?? 0))}
              </p>
              <p className="text-[10px] text-[var(--color-muted)] mt-1">Tyre age: {tireAge}L</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[var(--color-muted)]">Undercut Result</p>
              <p
                className={`text-2xl font-mono font-bold ${
                  undercutWinLap ? "text-[var(--color-green)]" : "text-[var(--color-red)]"
                }`}
              >
                {undercutWinLap ? `+${undercutWinLap}L` : "No gain"}
              </p>
              <p className="text-[10px] text-[var(--color-muted)] mt-1">
                {undercutWinLap ? "laps until ahead" : "within 5-lap window"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[var(--color-muted)]">Next Lap Delta</p>
              <p className="text-2xl font-mono font-bold">
                {undercut[0] ? `${undercut[0].finalGap.toFixed(2)}s` : "—"}
              </p>
              <p className="text-[10px] text-[var(--color-muted)] mt-1">projected gap, lap +1</p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        {board.safetyCarWindow?.active && (
          <Panel title="Pit Window Recommendation" accent="bg-[var(--color-amber)]">
            <p className="text-xs font-bold text-[var(--color-green)] mb-1">
              SC/VSC WINDOW OPEN — CHEAP PIT STOP
            </p>
            <p className="text-xs text-[var(--color-muted)]">{board.safetyCarWindow.message}</p>
            <p className="text-xs mt-2">
              Adjusted pit loss: <span className="font-mono">{board.safetyCarWindow.adjustedPitLossSec}s</span> (vs{" "}
              {pitLossSec}s green-flag)
            </p>
          </Panel>
        )}

        <Panel title="Sim Parameters">
          <div className="flex flex-col gap-4">
            <SliderField
              label="Pit Loss (sec)"
              value={pitLossSec}
              min={10}
              max={35}
              step={0.5}
              onChange={setPitLossSec}
            />
            <SliderField
              label="Tire Deg Rate (sec/lap)"
              value={degRate}
              min={0.02}
              max={0.2}
              step={0.005}
              onChange={setDegRate}
            />
            <SliderField
              label="Laps Remaining"
              value={lapsRemaining}
              min={1}
              max={70}
              step={1}
              onChange={setLapsRemaining}
            />
            <div className="grid grid-cols-3 gap-2 mt-1">
              {COMPOUNDS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewCompound(c)}
                  className={`py-2 rounded text-xs uppercase font-bold border ${
                    newCompound === c
                      ? "border-[var(--color-green)] text-[var(--color-green)] bg-white/5"
                      : "border-[var(--color-border)] text-[var(--color-muted)]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function DriverSelect({ label, drivers, value, onChange }) {
  return (
    <label className="text-xs flex items-center gap-2">
      <span className="text-[var(--color-muted)] uppercase">{label}</span>
      <select
        className="bg-[var(--color-panel-2)] border border-[var(--color-border)] rounded px-2 py-1 font-mono"
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {drivers.map((d) => (
          <option key={d.driver_number} value={d.driver_number}>
            {d.name_acronym}
          </option>
        ))}
      </select>
    </label>
  );
}

function SliderField({ label, value, min, max, step, onChange }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-xs">
        <span className="uppercase text-[var(--color-muted)]">{label}</span>
        <span className="font-mono font-bold">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-[var(--color-green)]"
      />
    </label>
  );
}

function formatGap(sec) {
  if (!Number.isFinite(sec)) return "—";
  return `${sec >= 0 ? "+" : ""}${sec.toFixed(3)}`;
}
