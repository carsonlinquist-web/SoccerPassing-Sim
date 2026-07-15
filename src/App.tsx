import { useState } from "react";
import { ControlsBar } from "./components/ControlsBar";
import { FieldCanvas } from "./components/FieldCanvas";
import { InfoPanel } from "./components/InfoPanel";
import { DEFAULT_PLAYERS } from "./data/defaultPlayers";
import type { PassCalculation, PassIntentMode, Player } from "./types";

function cloneDefaultPlayers(): Player[] {
  return DEFAULT_PLAYERS.map((player) => ({ ...player }));
}

export default function App() {
  const [hasOrigin, setHasOrigin] = useState(false);
  const [showZones, setShowZones] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [passIntentMode, setPassIntentMode] =
    useState<PassIntentMode>("open");

  const [players, setPlayers] = useState<Player[]>(cloneDefaultPlayers);

  const [ballSpeed, setBallSpeed] = useState(25);
  const [launchElevation, setLaunchElevation] = useState(15);

  const [hoverInfo, setHoverInfo] = useState<PassCalculation | null>(null);
  const [resetKey, setResetKey] = useState(0);

  function handleReset() {
    setPlayers(cloneDefaultPlayers());
    setResetKey((current) => current + 1);
  }

  return (
    <div
      style={{
        background: "#111",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        position: "relative",
        color: "white"
      }}
    >
      <ControlsBar
        hasOrigin={hasOrigin}
        showZones={showZones}
        setShowZones={setShowZones}
        showPlayers={showPlayers}
        setShowPlayers={setShowPlayers}
        passIntentMode={passIntentMode}
        setPassIntentMode={setPassIntentMode}
        ballSpeed={ballSpeed}
        setBallSpeed={setBallSpeed}
        launchElevation={launchElevation}
        setLaunchElevation={setLaunchElevation}
        onReset={handleReset}
      />

      <FieldCanvas
        ballSpeed={ballSpeed}
        launchElevation={launchElevation}
        showZones={showZones}
        showPlayers={showPlayers}
        passIntentMode={passIntentMode}
        players={players}
        setPlayers={setPlayers}
        resetKey={resetKey}
        setHasOrigin={setHasOrigin}
        setHoverInfo={setHoverInfo}
      />

      <InfoPanel
        hasOrigin={hasOrigin}
        hoverInfo={hoverInfo}
        ballSpeed={ballSpeed}
        launchElevation={launchElevation}
      />
    </div>
  );
}