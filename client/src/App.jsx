import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import TopNav from "./components/TopNav";
import Sidebar from "./components/Sidebar";
import BoxThisLapButton from "./components/BoxThisLapButton";
import { SessionProvider } from "./lib/SessionContext";
import LiveTiming from "./pages/LiveTiming";
import StrategySim from "./pages/StrategySim";
import ErsPanel from "./pages/ErsPanel";
import Weather from "./pages/Weather";

function App() {
  const [activeIcon, setActiveIcon] = useState("telemetry");

  return (
    <SessionProvider>
      <div className="h-screen flex flex-col font-sans text-sm">
        <TopNav />
        <div className="flex flex-1 min-h-0">
          <Sidebar active={activeIcon} onSelect={setActiveIcon} />
          <main className="flex-1 min-w-0 overflow-y-auto p-4">
            <Routes>
              <Route path="/" element={<LiveTiming />} />
              <Route path="/strategy" element={<StrategySim />} />
              <Route path="/ers" element={<ErsPanel />} />
              <Route path="/weather" element={<Weather />} />
            </Routes>
          </main>
        </div>
        <BoxThisLapButton onClick={() => console.log("box this lap")} />
      </div>
    </SessionProvider>
  );
}

export default App;
