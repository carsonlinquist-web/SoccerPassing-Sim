type PassIntentMode = "open" | "through";

type ControlsBarProps = {
  hasOrigin: boolean;
  showZones: boolean;
  setShowZones: (value: boolean) => void;
  showPlayers: boolean;
  setShowPlayers: (value: boolean) => void;
  passIntentMode: PassIntentMode;
  setPassIntentMode: (value: PassIntentMode) => void;
  ballSpeed: number;
  setBallSpeed: (value: number) => void;
  launchElevation: number;
  setLaunchElevation: (value: number) => void;
  onReset: () => void;
};

export function ControlsBar({
  hasOrigin,
  showZones,
  setShowZones,
  showPlayers,
  setShowPlayers,
  passIntentMode,
  setPassIntentMode,
  ballSpeed,
  setBallSpeed,
  launchElevation,
  setLaunchElevation,
  onReset
}: ControlsBarProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 88,
        zIndex: 20,
        color: "white",
        background: "rgba(0,0,0,0.85)",
        borderBottom: "1px solid rgba(255,255,255,0.15)",
        boxSizing: "border-box",
        padding: "10px 16px",
        fontFamily: "Arial",
        display: "flex",
        alignItems: "center",
        gap: "18px"
      }}
    >
      <div style={{ minWidth: "150px" }}>
        <div style={{ fontWeight: "bold", fontSize: "14px" }}>
          Phase 3 Controls
        </div>

        <div style={{ fontSize: "11px", color: "#bbb", marginTop: "3px" }}>
          {!hasOrigin
            ? "Click field to place ball."
            : "Click field to move origin."}
        </div>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          fontSize: "13px",
          cursor: "pointer",
          whiteSpace: "nowrap"
        }}
      >
        <input
          type="checkbox"
          checked={showZones}
          onChange={(e) => setShowZones(e.target.checked)}
        />
        18 Zones
      </label>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          fontSize: "13px",
          cursor: "pointer",
          whiteSpace: "nowrap"
        }}
      >
        <input
          type="checkbox"
          checked={showPlayers}
          onChange={(e) => setShowPlayers(e.target.checked)}
        />
        Show Players
      </label>

      <div style={{ minWidth: "150px" }}>
        <label style={{ fontSize: "13px", display: "block" }}>
          Pass Intent
        </label>

        <select
          value={passIntentMode}
          onChange={(e) =>
            setPassIntentMode(e.target.value as PassIntentMode)
          }
          style={{
            marginTop: "4px",
            width: "100%",
            padding: "4px 6px"
          }}
        >
          <option value="open">Open Target</option>
          <option value="through">Through Ball</option>
        </select>
      </div>

      <div style={{ width: "230px" }}>
        <label style={{ fontSize: "13px" }}>
          Ball Speed: {ballSpeed} mph
        </label>

        <input
          type="range"
          min="5"
          max="80"
          value={ballSpeed}
          onChange={(e) => setBallSpeed(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>

      <div style={{ width: "250px" }}>
        <label style={{ fontSize: "13px" }}>
          Launch Elevation: {launchElevation}°
        </label>

        <input
          type="range"
          min="0"
          max="45"
          value={launchElevation}
          onChange={(e) => setLaunchElevation(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>

      <button
        onClick={onReset}
        style={{
          marginLeft: "auto",
          padding: "8px 18px",
          cursor: "pointer"
        }}
      >
        Reset
      </button>
    </div>
  );
}