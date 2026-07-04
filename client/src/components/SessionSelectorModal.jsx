import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export default function SessionSelectorModal({ onClose }) {
  const years = [2026, 2025, 2024, 2023];
  const [selectedYear, setSelectedYear] = useState(2024);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);

  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState("");

  const [searchParams, setSearchParams] = useSearchParams();

  // Load meetings when year changes
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      setSelectedMeeting(null);
      setSelectedSession(null);
      try {
        const res = await api.ltaMeetings(selectedYear);
        if (!active) return;
        setMeetings(res.meetings || []);
        if (res.meetings?.length > 0) {
          setSelectedMeeting(res.meetings[0]);
          if (res.meetings[0].sessions?.length > 0) {
            setSelectedSession(res.meetings[0].sessions[0]);
          }
        }
      } catch (err) {
        if (active) setError("Failed to load historical season index: " + err.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [selectedYear]);

  // Update selected session if meeting changes
  const handleMeetingChange = (meetingKey) => {
    const meeting = meetings.find((m) => String(m.key) === String(meetingKey));
    if (meeting) {
      setSelectedMeeting(meeting);
      if (meeting.sessions?.length > 0) {
        setSelectedSession(meeting.sessions[0]);
      } else {
        setSelectedSession(null);
      }
    }
  };

  const handleSessionChange = (sessionKey) => {
    if (!selectedMeeting) return;
    const session = selectedMeeting.sessions.find((s) => String(s.key) === String(sessionKey));
    if (session) {
      setSelectedSession(session);
    }
  };

  const handleLoad = async () => {
    if (!selectedSession) return;

    if (selectedSession.downloaded && selectedSession.telemetryDownloaded) {
      // Already cached: load immediately
      setSearchParams({ session_key: String(selectedSession.key) });
      onClose();
      return;
    }

    // Needs download
    setDownloading(true);
    setDownloadStatus("Connecting to F1 archive...");
    try {
      setDownloadStatus("Downloading timing, weather, and incidents log...");
      const res = await api.ltaDownload(selectedSession.key);
      if (res.success) {
        setDownloadStatus("Parsing and caching telemetry on disk...");
        // Success
        setSearchParams({ session_key: String(selectedSession.key) });
        onClose();
      } else {
        throw new Error("Download failed on the server.");
      }
    } catch (err) {
      setError("Failed to download session: " + err.message);
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
      <div 
        className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden text-[var(--color-text)] animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <span className="text-xl">📂</span>
            <h2 className="text-lg font-bold uppercase tracking-wider text-[var(--color-red)]">
              F1 Historical Session Database
            </h2>
          </div>
          <button 
            onClick={onClose}
            disabled={downloading}
            className="text-2xl hover:text-[var(--color-red)] transition-colors cursor-pointer disabled:opacity-50"
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col gap-6 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="p-4 bg-red-950/40 border border-red-800 text-red-400 rounded-lg text-sm flex flex-col gap-2">
              <span className="font-semibold">Error Loading Data</span>
              <span>{error}</span>
            </div>
          )}

          {/* Year/Season Row */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-[var(--color-muted)] font-semibold mb-2">
              Select Season
            </label>
            <div className="grid grid-cols-4 gap-2">
              {years.map((y) => (
                <button
                  key={y}
                  disabled={downloading}
                  onClick={() => setSelectedYear(y)}
                  className={`py-2 rounded font-bold transition-all cursor-pointer ${
                    selectedYear === y
                      ? "bg-[var(--color-red)] text-white shadow-md shadow-red-600/20"
                      : "bg-[var(--color-panel-2)] border border-[var(--color-border)] hover:bg-[var(--color-panel-3)]"
                  }`}
                >
                  {y} Season
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-[var(--color-muted)]">
              <div className="w-8 h-8 border-2 border-t-transparent border-[var(--color-red)] rounded-full animate-spin"></div>
              <span>Indexing F1 events list...</span>
            </div>
          ) : (
            <>
              {/* Grand Prix Select */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-[var(--color-muted)] font-semibold mb-2">
                  Select Grand Prix / Meeting
                </label>
                <select
                  disabled={downloading || meetings.length === 0}
                  value={selectedMeeting?.key || ""}
                  onChange={(e) => handleMeetingChange(e.target.value)}
                  className="w-full bg-[var(--color-panel-2)] border border-[var(--color-border)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-red)] cursor-pointer"
                >
                  {meetings.map((m) => (
                    <option key={m.key} value={m.key}>
                      Round {m.sessions?.[0]?.path?.split("_")?.[1] || "GP"} — {m.name} ({m.location}, {m.country})
                    </option>
                  ))}
                </select>
              </div>

              {/* Sessions Grid */}
              {selectedMeeting && (
                <div>
                  <label className="block text-xs uppercase tracking-wider text-[var(--color-muted)] font-semibold mb-2">
                    Select Track Session
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedMeeting.sessions.map((s) => {
                      const isSelected = selectedSession?.key === s.key;
                      return (
                        <button
                          key={s.key}
                          disabled={downloading}
                          onClick={() => handleSessionChange(s.key)}
                          className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between gap-1 cursor-pointer ${
                            isSelected
                              ? "bg-[var(--color-panel-3)] border-[var(--color-red)] shadow-sm shadow-red-600/10"
                              : "bg-[var(--color-panel-2)] border-[var(--color-border)] hover:bg-[var(--color-panel-3)]"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="font-semibold text-sm">{s.name}</span>
                            <span className="text-[10px] text-[var(--color-muted)] font-mono">
                              Key: {s.key}
                            </span>
                          </div>
                          <div className="flex items-center justify-between w-full text-xs text-[var(--color-muted)] mt-1">
                            <span>{new Date(s.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            
                            {/* Cache status labels */}
                            <div className="flex gap-1.5">
                              {s.downloaded ? (
                                <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-900 px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
                                  💾 Local
                                </span>
                              ) : (
                                <span className="bg-amber-950/60 text-amber-400 border border-amber-900 px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
                                  ☁ Cloud
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-panel-2)] flex items-center justify-between">
          <div className="text-xs text-[var(--color-muted)] max-w-[50%]">
            {downloading ? (
              <div className="flex items-center gap-2 text-[var(--color-red)] font-semibold">
                <div className="w-3.5 h-3.5 border-2 border-t-transparent border-[var(--color-red)] rounded-full animate-spin"></div>
                <span className="animate-pulse">{downloadStatus}</span>
              </div>
            ) : selectedSession ? (
              selectedSession.downloaded ? (
                <span className="text-emerald-400">💾 Ready to load instantly from local disk cache.</span>
              ) : (
                <span className="text-amber-400">☁ Will download timing and telemetry (~10-20MB) to local disk.</span>
              )
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <button
              disabled={downloading}
              onClick={onClose}
              className="px-4 py-2 border border-[var(--color-border)] text-sm rounded hover:bg-[var(--color-panel-3)] cursor-pointer transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              disabled={downloading || !selectedSession}
              onClick={handleLoad}
              className="px-5 py-2 bg-[var(--color-red)] hover:bg-red-700 text-white font-bold text-sm rounded shadow-lg shadow-red-600/10 cursor-pointer transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {downloading ? (
                <>Downloading...</>
              ) : selectedSession?.downloaded ? (
                <>🚀 Load Session</>
              ) : (
                <>📥 Download & Load</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
