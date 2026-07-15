import type { PassCalculation } from "../types";
import { SIDE_PANEL_WIDTH, TOP_BAR_HEIGHT } from "../utils/constants";
import {
  calculatePassModel,
  estimateProjectedDistanceFromSpeed,
  formatRange,
  formatSignedTime,
  getOutcomeSentence,
  getPassProfile,
  getPressureColor
} from "../utils/passModel";
import { TrajectoryGraphic } from "./TrajectoryGraphic";

type InfoPanelProps = {
  hasOrigin: boolean;
  hoverInfo: PassCalculation | null;
  ballSpeed: number;
  launchElevation: number;
};

export function InfoPanel({
  hasOrigin,
  hoverInfo,
  ballSpeed,
  launchElevation
}: InfoPanelProps) {
  const profile = getPassProfile(launchElevation);
  const projectedDistance = estimateProjectedDistanceFromSpeed(
    profile.modelKey,
    ballSpeed
  );

  const baseCalc = calculatePassModel(
    projectedDistance,
    ballSpeed,
    launchElevation
  );

  const calc = hoverInfo ?? baseCalc;
  const colors = getPressureColor(calc);

  return (
    <aside
      style={{
        position: "absolute",
        top: TOP_BAR_HEIGHT,
        right: 0,
        width: SIDE_PANEL_WIDTH,
        height: `calc(100vh - ${TOP_BAR_HEIGHT}px)`,
        background: "#0b0b0b",
        color: "#fff",
        borderLeft: "1px solid rgba(255,255,255,0.12)",
        boxSizing: "border-box",
        padding: "20px",
        fontFamily: "Arial",
        zIndex: 8,
        overflowY: "auto"
      }}
    >
      <div style={{ fontSize: "22px", fontWeight: "bold", marginBottom: "6px" }}>
        Pass Detail
      </div>

      <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "16px" }}>
        Hover over the field after placing the ball to preview a target.
      </div>

      {!hasOrigin && (
        <div
          style={{
            padding: "12px",
            background: "rgba(255,255,255,0.06)",
            borderRadius: "8px",
            color: "#ddd",
            marginBottom: "14px"
          }}
        >
          Click the field to place the origin.
        </div>
      )}

      {hasOrigin && !hoverInfo && (
        <div
          style={{
            padding: "12px",
            background: "rgba(255,255,255,0.06)",
            borderRadius: "8px",
            color: "#ddd",
            marginBottom: "14px"
          }}
        >
          Move your cursor over the field to see target distance, acceptable
          speed, receiver time, ball travel, carry, rollout, and total distance.
        </div>
      )}

      {hoverInfo && (
        <div
          style={{
            padding: "14px",
            background: "rgba(255,255,255,0.06)",
            borderRadius: "10px",
            marginBottom: "14px"
          }}
        >
          <div
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              color: colors.text,
              marginBottom: "8px"
            }}
          >
            Receiver Time: {formatSignedTime(calc.receiverTimeOnBall)}
          </div>

          <div
            style={{
              fontSize: "12px",
              color: colors.text,
              marginBottom: "10px",
              lineHeight: "1.4"
            }}
          >
            {getOutcomeSentence(calc)}
          </div>

          <div style={{ fontSize: "13px", lineHeight: "1.8" }}>
            <div>Pass Type: {calc.passTypeLabel}</div>
            <div>Target Distance: {calc.distanceYards.toFixed(1)} yd</div>
            <div>
              Reference Speed:{" "}
              {formatRange(calc.requiredSpeedMin, calc.requiredSpeedMax)}
            </div>
            <div>
              Acceptable Speed:{" "}
              {formatRange(calc.acceptableSpeedMin, calc.acceptableSpeedMax)}
            </div>
            <div>Current Speed: {ballSpeed} mph</div>
            <div>Ball Travel: {calc.ballTravelTime.toFixed(2)} sec</div>
          </div>
        </div>
      )}

      <div
        style={{
          padding: "14px",
          background: "rgba(255,255,255,0.06)",
          borderRadius: "10px"
        }}
      >
        <div style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "10px" }}>
          Current Ball Model
        </div>

        <div style={{ fontSize: "13px", lineHeight: "1.8" }}>
          <div>Pass Type: {calc.passTypeLabel}</div>
          <div>Ball Speed: {ballSpeed} mph</div>
          <div>Launch Elevation: {launchElevation}°</div>
          <div>
            Projected Airborne:{" "}
            {calc.projectedAirborneDistanceYards.toFixed(1)} yd
          </div>
          <div>
            Projected Rollout:{" "}
            {calc.projectedRolloutDistanceYards.toFixed(1)} yd
          </div>
          <div>
            Projected Total: {calc.projectedTotalDistanceYards.toFixed(1)} yd
          </div>
        </div>

        <TrajectoryGraphic calc={calc} />
      </div>
    </aside>
  );
}