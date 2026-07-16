type PassIntentMode = "open" | "through";
type AttackingDirection = "ltr" | "rtl";

type ControlsBarProps = {
  hasOrigin: boolean;
  showZones: boolean;
  setShowZones: (value: boolean) => void;
  showPlayers: boolean;
  setShowPlayers: (value: boolean) => void;
  passIntentMode: PassIntentMode;
  setPassIntentMode: (value: PassIntentMode) => void;
  attackingDirection: AttackingDirection;
  setAttackingDirection: (value: AttackingDirection) => void;
  ballSpeed: number;
  setBallSpeed: (value: number) => void;
  launchElevation: number;
  setLaunchElevation: (value: number) => void;
  attackerRunSpeed: number;
  setAttackerRunSpeed: (value: number) => void;
  defenderSpeed: number;
  setDefenderSpeed: (value: number) => void;
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
  attackingDirection,
  setAttackingDirection,
  ballSpeed,
  setBallSpeed,
  launchElevation,
  setLaunchElevation,
  attackerRunSpeed,
  setAttackerRunSpeed,
  defenderSpeed,
  setDefenderSpeed,
  onReset
}: ControlsBarProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 124,
        zIndex: 20,
        color: "white",
        background: "rgba(0,0,0,0.86)",
        borderBottom: "1px solid rgba(255,255,255,0.15)",
        boxSizing: "border-box",
        padding: "10px 16px",
        fontFamily: "Arial",
        display: "flex",
        alignItems: "center",
        gap: "16px"
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

        <div style={{ fontSize: "10px", color: "#facc15", marginTop: "3px" }}>
          Through Ball: click attacker to select runner.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label style={{ display: "flex", gap: "7px", fontSize: "13px" }}>
          <input
            type="checkbox"
            checked={showZones}
            onChange={(e) => setShowZones(e.target.checked)}
          />
          18 Zones
        </label>

        <label style={{ display: "flex", gap: "7px", fontSize: "13px" }}>
          <input
            type="checkbox"
            checked={showPlayers}
            onChange={(e) => setShowPlayers(e.target.checked)}
          />
          Show Players
        </label>
      </div>

      <div style={{ minWidth: "135px" }}>
        <label style={{ fontSize: "13px", display: "block" }}>
          Pass Intent
        </label>

        <select
          value={passIntentMode}
          onChange={(e) =>
            setPassIntentMode(e.target.value as PassIntentMode)
          }
          style={{ marginTop: "4px", width: "100%", padding: "4px 6px" }}
        >
          <option value="open">Open Target</option>
          <option value="through">Through Ball</option>
        </select>
      </div>

      <div style={{ minWidth: "135px" }}>
        <label style={{ fontSize: "13px", display: "block" }}>
          Attack Direction
        </label>

        <select
          value={attackingDirection}
          onChange={(e) =>
            setAttackingDirection(e.target.value as AttackingDirection)
          }
          style={{ marginTop: "4px", width: "100%", padding: "4px 6px" }}
        >
          <option value="ltr">Left → Right</option>
          <option value="rtl">Right → Left</option>
        </select>
      </div>

      <div style={{ width: "190px" }}>
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

        <label style={{ fontSize: "13px" }}>
          Launch: {launchElevation}°
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

      <div style={{ width: "190px" }}>
        <label style={{ fontSize: "13px" }}>
          Runner Speed: {attackerRunSpeed.toFixed(1)} yd/s
        </label>

        <input
          type="range"
          min="4"
          max="8.5"
          step="0.1"
          value={attackerRunSpeed}
          onChange={(e) => setAttackerRunSpeed(Number(e.target.value))}
          style={{ width: "100%" }}
        />

        <label style={{ fontSize: "13px" }}>
          Defender Speed: {defenderSpeed.toFixed(1)} yd/s
        </label>

        <input
          type="range"
          min="3.5"
          max="8"
          step="0.1"
          value={defenderSpeed}
          onChange={(e) => setDefenderSpeed(Number(e.target.value))}
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