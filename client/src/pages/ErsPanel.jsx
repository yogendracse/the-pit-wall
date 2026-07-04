import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useSession } from "../lib/SessionContext";
import { useTimingBoard } from "../lib/useTimingBoard";
import { api } from "../lib/api";
import Panel from "../components/Panel";

const ZONE_COLOR = {
  deploy: "var(--color-green)",
  harvest: "var(--color-red)",
  neutral: "var(--color-muted)",
};

export default function ErsPanel() {
  const { session, drivers } = useSession();
  const board = useTimingBoard(session?.session_key);

  const [driverA, setDriverA] = useState(null);
  const [driverB, setDriverB] = useState(null);
  const [lapNumber, setLapNumber] = useState(null);
  const [dataA, setDataA] = useState(null);
  const [dataB, setDataB] = useState(null);
  const [loading, setLoading] = useState(false);

  const dA = driverA ?? board.rows[0]?.driverNumber;
  const dB = driverB ?? board.rows[1]?.driverNumber;
  const lap = lapNumber ?? board.rows[0]?.lastLapNumber ?? 1;

  useEffect(() => {
    if (!session?.session_key || !dA || !dB) return;
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const [lapsA, lapsB] = await Promise.all([
          api.laps(session.session_key, dA),
          api.laps(session.session_key, dB),
        ]);
        const lapA = lapsA.data.find((l) => l.lap_number === lap);
        const lapB = lapsB.data.find((l) => l.lap_number === lap);
        if (!lapA || !lapB) {
          if (!cancelled) setLoading(false);
          return;
        }
        const [ersA, ersB] = await Promise.all([
          api.ersEstimate(session.session_key, dA, lapA.date_start, addSeconds(lapA.date_start, lapA.lap_duration)),
          api.ersEstimate(session.session_key, dB, lapB.date_start, addSeconds(lapB.date_start, lapB.lap_duration)),
        ]);
        if (cancelled) return;
        setDataA(ersA);
        setDataB(ersB);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [session?.session_key, dA, dB, lap]);

  const chartData = mergeSeries(dataA?.data, dataB?.data);

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <div className="flex items-center gap-6 flex-wrap">
          <h1 className="text-sm font-bold uppercase tracking-wide">
            ERS Analysis: Lap {lap} Comparison
          </h1>
          <DriverSelect label="Driver A" drivers={drivers} value={dA} onChange={setDriverA} color="#ff6a5c" />
          <DriverSelect label="Driver B" drivers={drivers} value={dB} onChange={setDriverB} color="#3ecfd6" />
          <label className="flex items-center gap-2 text-xs">
            <span className="text-[var(--color-muted)] uppercase">Lap</span>
            <input
              type="number"
              min={1}
              className="w-16 bg-[var(--color-panel-2)] border border-[var(--color-border)] rounded px-2 py-1 font-mono"
              value={lap}
              onChange={(e) => setLapNumber(Number(e.target.value))}
            />
          </label>
          <span className="ml-auto text-[10px] text-[var(--color-muted)] border border-[var(--color-border)] rounded px-2 py-1 max-w-xs">
            {dataA?.disclaimer || "Estimated from public telemetry, not actual battery data."}
          </span>
        </div>
      </Panel>

      <div className="grid grid-cols-[1fr_280px] gap-3">
        <Panel title="Telemetry Trace (Speed / Throttle)">
          {loading && <p className="text-xs text-[var(--color-muted)]">Loading telemetry…</p>}
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="i" stroke="var(--color-muted)" tick={{ fontSize: 10 }} />
                <YAxis stroke="var(--color-muted)" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-panel-2)",
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="speedA" stroke="#ff6a5c" dot={false} strokeWidth={2} name="Driver A speed" />
                <Line type="monotone" dataKey="speedB" stroke="#3ecfd6" dot={false} strokeWidth={2} name="Driver B speed" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ZoneBar samples={dataA?.data} label="Driver A" />
          <ZoneBar samples={dataB?.data} label="Driver B" />
        </Panel>

        <div className="flex flex-col gap-3">
          <Panel title="Battery State (Est.)">
            <BatteryRow label="Driver A" color="#ff6a5c" summary={dataA?.summary} data={dataA?.data} />
            <BatteryRow label="Driver B" color="#3ecfd6" summary={dataB?.summary} data={dataB?.data} />
          </Panel>
          <Panel title="Zone Breakdown">
            <ZoneSummary label="Driver A" summary={dataA?.summary} />
            <ZoneSummary label="Driver B" summary={dataB?.summary} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function DriverSelect({ label, drivers, value, onChange, color }) {
  return (
    <label className="text-xs flex items-center gap-2">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
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

function BatteryRow({ label, color, summary, data }) {
  const last = data?.[data.length - 1];
  const pct = last?.estimatedState ?? 50;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between text-xs mb-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="font-mono font-bold text-[var(--color-green)]">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-[var(--color-panel-2)] rounded-full overflow-hidden">
        <div className="h-full bg-[var(--color-green)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ZoneSummary({ label, summary }) {
  const pct = summary?.pct;
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-xs mb-1">{label}</p>
      <div className="flex h-2 rounded-full overflow-hidden bg-[var(--color-panel-2)]">
        {pct && (
          <>
            <div style={{ width: `${pct.deploy}%`, background: ZONE_COLOR.deploy }} />
            <div style={{ width: `${pct.neutral}%`, background: ZONE_COLOR.neutral }} />
            <div style={{ width: `${pct.harvest}%`, background: ZONE_COLOR.harvest }} />
          </>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-[var(--color-muted)] mt-1">
        <span>Deploy {pct?.deploy ?? 0}%</span>
        <span>Neutral {pct?.neutral ?? 0}%</span>
        <span>Harvest {pct?.harvest ?? 0}%</span>
      </div>
    </div>
  );
}

function ZoneBar({ samples, label }) {
  if (!samples?.length) return null;
  return (
    <div className="mt-2">
      <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{label}</p>
      <div className="flex h-3 rounded-sm overflow-hidden">
        {samples.map((s, i) => (
          <div key={i} style={{ flex: 1, background: ZONE_COLOR[s.zone] }} />
        ))}
      </div>
    </div>
  );
}

function mergeSeries(a = [], b = []) {
  const len = Math.max(a?.length || 0, b?.length || 0);
  const rows = [];
  for (let i = 0; i < len; i++) {
    rows.push({ i, speedA: a?.[i]?.speed, speedB: b?.[i]?.speed });
  }
  return rows;
}

function addSeconds(isoDate, seconds) {
  return new Date(new Date(isoDate).getTime() + seconds * 1000).toISOString();
}
