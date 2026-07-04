import { useSession } from "../lib/SessionContext";

export default function PlaybackController() {
  const {
    session,
    isPlaybackMode,
    setIsPlaybackMode,
    isPlaying,
    setIsPlaying,
    playbackTime,
    setPlaybackTime,
    playbackSpeed,
    setPlaybackSpeed,
    totalDuration,
    loadingPlayback,
    startPlaybackMode,
  } = useSession();

  // If no session is selected, don't show anything
  if (!session) return null;

  // Formatting helpers
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleTimelineChange = (e) => {
    setPlaybackTime(parseFloat(e.target.value));
  };

  const progressPercent = totalDuration > 0 ? (playbackTime / totalDuration) * 100 : 0;

  // Render Playback Control Bar
  if (isPlaybackMode) {
    return (
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-[var(--color-panel)] border-t border-[var(--color-border)] z-40 px-6 flex items-center gap-6 text-[var(--color-text)] select-none shadow-2xl">
        {/* Play / Pause */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--color-red)] hover:bg-red-700 text-white font-bold transition-all shadow-md cursor-pointer shrink-0"
        >
          {isPlaying ? (
            <span className="text-sm">❚❚</span>
          ) : (
            <span className="text-sm ml-0.5">▶</span>
          )}
        </button>

        {/* Speed Control */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-[var(--color-muted)] font-semibold uppercase tracking-wider">Speed</span>
          <select
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(parseInt(e.target.value, 10))}
            className="bg-[var(--color-panel-2)] border border-[var(--color-border)] rounded text-xs px-2.5 py-1 focus:outline-none focus:border-[var(--color-red)] cursor-pointer"
          >
            <option value={1}>1x (Live)</option>
            <option value={2}>2x</option>
            <option value={5}>5x</option>
            <option value={10}>10x</option>
            <option value={30}>30x</option>
            <option value={60}>60x</option>
            <option value={120}>120x</option>
          </select>
        </div>

        {/* Timeline Slider */}
        <div className="flex-1 flex items-center gap-4 min-w-0">
          <span className="text-xs font-mono shrink-0 bg-[var(--color-panel-2)] px-2 py-0.5 rounded border border-[var(--color-border)]">
            {formatTime(playbackTime)}
          </span>
          <div className="relative flex-1 group">
            <input
              type="range"
              min="0"
              max={totalDuration}
              value={playbackTime}
              onChange={handleTimelineChange}
              className="w-full accent-[var(--color-red)] bg-[var(--color-panel-2)] h-1.5 rounded-lg appearance-none cursor-pointer border border-[var(--color-border)]"
            />
          </div>
          <span className="text-xs font-mono shrink-0 bg-[var(--color-panel-2)] px-2 py-0.5 rounded border border-[var(--color-border)]">
            {formatTime(totalDuration)}
          </span>
        </div>

        {/* Close/Exit Playback */}
        <button
          onClick={() => setIsPlaybackMode(false)}
          className="px-3.5 py-1.5 bg-[var(--color-panel-2)] border border-[var(--color-border)] hover:bg-[var(--color-panel-3)] text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer shrink-0"
        >
          ✕ Exit Playback
        </button>
      </div>
    );
  }

  // If not in playback mode, render a floating trigger button at the bottom-right
  return (
    <div className="fixed bottom-20 right-6 z-40">
      <button
        disabled={loadingPlayback}
        onClick={startPlaybackMode}
        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-950 border border-emerald-800 hover:bg-emerald-900 text-emerald-400 text-xs font-bold uppercase tracking-wider rounded-full shadow-lg shadow-emerald-950/20 cursor-pointer transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
      >
        {loadingPlayback ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-t-transparent border-emerald-400 rounded-full animate-spin"></div>
            Loading Stream Logs...
          </>
        ) : (
          <>
            <span>▶</span>
            Start Race Playback Simulation
          </>
        )}
      </button>
    </div>
  );
}
