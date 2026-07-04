import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import TopNav from "./components/TopNav";
import Sidebar from "./components/Sidebar";
import BoxThisLapButton from "./components/BoxThisLapButton";
import PlaybackController from "./components/PlaybackController";
import { SessionProvider, useSession } from "./lib/SessionContext";
import LiveTiming from "./pages/LiveTiming";
import StrategySim from "./pages/StrategySim";
import ErsPanel from "./pages/ErsPanel";
import Weather from "./pages/Weather";

function AppContent({ activeIcon, setActiveIcon }) {
  const sessionCtx = useSession();
  const isPlayback = sessionCtx?.isPlaybackMode;

  return (
    <div className="h-screen flex flex-col font-sans text-sm">
      <TopNav />
      <div className="flex flex-1 min-h-0">
        <Sidebar active={activeIcon} onSelect={setActiveIcon} />
        <main className={`flex-1 min-w-0 overflow-y-auto p-4 transition-all duration-200 ${isPlayback ? "pb-24" : "pb-4"}`}>
          <Routes>
            <Route path="/" element={<LiveTiming />} />
            <Route path="/strategy" element={<StrategySim />} />
            <Route path="/ers" element={<ErsPanel />} />
            <Route path="/weather" element={<Weather />} />
          </Routes>
        </main>
      </div>
      <BoxThisLapButton onClick={() => console.log("box this lap")} />
      <PlaybackController />
    </div>
  );
}

function App() {
  const [activeIcon, setActiveIcon] = useState("telemetry");

  return (
    <SessionProvider>
      <AppContent activeIcon={activeIcon} setActiveIcon={setActiveIcon} />
    </SessionProvider>
  );
}

export default App;
