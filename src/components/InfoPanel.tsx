import type { PassCalculation } from "../types";
import { SIDE_PANEL_WIDTH, TOP_BAR_HEIGHT } from "../utils/constants";

type InfoPanelProps = {
  hasOrigin: boolean;
  hoverInfo: PassCalculation | null;
  ballSpeed: number;
  launchElevation: number;
};

function formatSeconds(value: number) {
  return `${value.toFixed(2)}s`;
}

function formatSignedSeconds(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}s`;
}

function formatYards(value: number) {
  return `${value.toFixed(1)} yd`;
}

function formatMphRange(min: number | null, max: number | null) {
  if (min === null || max === null) return "N/A";
  return `${min.toFixed(0)}-${max.toFixed(0)} mph`;
}

function getWindowColor(value: number) {
  if (value >= 1) return "#86efac";
  if (value >= 0.25) return "#fde68a";
  if (value >= 0) return "#fdba74";
  return "#fca5a5";
}

function getWindowLabel(value: number) {
  if (value >= 1) return "Strong window";
  if (value >= 0.25) return "Playable window";
  if (value >= 0) return "Tight window";
  return "Defender likely wins";
}

function Row({
  label,
  value,
  color = "#fff"
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "14px",
        padding: "7px 0",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        fontSize: "13px"
      }}
    >
      <span style={{ color: "#aaa" }}>{label}</span>
      <span style={{ color, fontWeight: 600, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div
      style={{
        marginTop: "18px",
        marginBottom: "7px",
        color: "#e5e7eb",
        fontWeight: 700,
        fontSize: "13px",
        letterSpacing: "0.03em",
        textTransform: "uppercase"
      }}
    >
      {children}
    </div>
  );
}

export function InfoPanel({
  hasOrigin,
  hoverInfo,
  ballSpeed,
  launchElevation
}: InfoPanelProps) {
  const isThroughBall =
    hoverInfo?.throughBallWindow !== undefined &&
    hoverInfo.runnerTimeToTarget !== undefined;

  const mainWindow = hoverInfo
    ? isThroughBall
      ? hoverInfo.throughBallWindow ?? hoverInfo.receiverTimeOnBall
      : hoverInfo.receiverTimeOnBall
    : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: TOP_BAR_HEIGHT,
        right: 0,
        bottom: 0,
        width: SIDE_PANEL_WIDTH,
        background: "#161616",
        color: "#fff",
        borderLeft: "1px solid rgba(255,255,255,0.12)",
        boxSizing: "border-box",
        padding: "18px",
        fontFamily: "Arial",
        overflowY: "auto"
      }}
    >
      <div style={{ fontSize: "20px", fontWeight: 800 }}>
        Pass Detail
      </div>

      <div
        style={{
          marginTop: "5px",
          color: "#aaa",
          fontSize: "13px",
          lineHeight: 1.4
        }}
      >
        {isThroughBall
          ? "Through-ball mode compares the ball, runner, and defender racing to the same space."
          : "Open target mode compares ball arrival against defender pressure."}
      </div>

      {!hasOrigin && (
        <div
          style={{
            marginTop: "24px",
            padding: "14px",
            background: "rgba(255,255,255,0.06)",
            borderRadius: "8px",
            color: "#ddd",
            lineHeight: 1.5
          }}
        >
          Click on the field to place the ball. Then hover over a target space
          to see timing and pressure.
        </div>
      )}

      {hasOrigin && !hoverInfo && (
        <div
          style={{
            marginTop: "24px",
            padding: "14px",
            background: "rgba(255,255,255,0.06)",
            borderRadius: "8px",
            color: "#ddd",
            lineHeight: 1.5
          }}
        >
          Hover over the field to preview a pass.
        </div>
      )}

      {hoverInfo && (
        <>
          <div
            style={{
              marginTop: "20px",
              padding: "16px",
              background: "rgba(255,255,255,0.06)",
              borderRadius: "10px",
              border: `1px solid ${getWindowColor(mainWindow)}`,
              boxShadow: `0 0 18px rgba(255,255,255,0.04)`
            }}
          >
            <div
              style={{
                fontSize: "13px",
                color: "#aaa",
                marginBottom: "5px"
              }}
            >
              {isThroughBall ? "Through-Ball Window" : "Receiver Time"}
            </div>

            <div
              style={{
                fontSize: "34px",
                fontWeight: 900,
                color: getWindowColor(mainWindow)
              }}
            >
              {formatSignedSeconds(mainWindow)}
            </div>

            <div
              style={{
                marginTop: "5px",
                color: getWindowColor(mainWindow),
                fontWeight: 700
              }}
            >
              {getWindowLabel(mainWindow)}
            </div>
          </div>

          {isThroughBall && (
            <>
              <SectionTitle>Through-Ball Race</SectionTitle>

              <Row
                label="Ball arrives"
                value={formatSeconds(hoverInfo.ballTravelTime)}
              />

              <Row
                label="Runner arrives"
                value={formatSeconds(hoverInfo.runnerTimeToTarget ?? 0)}
              />

              <Row
                label="Defender arrives"
                value={formatSeconds(hoverInfo.defenderCloseDownTime)}
              />

              <Row
                label="Runner distance"
                value={formatYards(hoverInfo.runnerDistanceYards ?? 0)}
              />

              <Row
                label="Runner vs defender"
                value={formatSignedSeconds(
                  hoverInfo.runnerAdvantageVsDefender ?? 0
                )}
                color={getWindowColor(
                  hoverInfo.runnerAdvantageVsDefender ?? 0
                )}
              />
            </>
          )}

          <SectionTitle>Pass Model</SectionTitle>

          <Row label="Pass type" value={hoverInfo.passTypeLabel} />
          <Row label="Target distance" value={formatYards(hoverInfo.distanceYards)} />
          <Row label="Current speed" value={`${ballSpeed} mph`} />
          <Row label="Launch elevation" value={`${launchElevation}°`} />
          <Row
            label="Reference speed"
            value={formatMphRange(
              hoverInfo.requiredSpeedMin,
              hoverInfo.requiredSpeedMax
            )}
          />
          <Row
            label="Acceptable speed"
            value={formatMphRange(
              hoverInfo.acceptableSpeedMin,
              hoverInfo.acceptableSpeedMax
            )}
          />

          <SectionTitle>Pressure</SectionTitle>

          <Row
            label="Ball travel time"
            value={formatSeconds(hoverInfo.ballTravelTime)}
          />

          <Row
            label="Defender close-down"
            value={formatSeconds(hoverInfo.defenderCloseDownTime)}
          />

          <Row
            label="Defender spacing"
            value={formatYards(hoverInfo.defenderSpacingYards)}
          />

          {!isThroughBall && (
            <Row
              label="Receiver time"
              value={formatSignedSeconds(hoverInfo.receiverTimeOnBall)}
              color={getWindowColor(hoverInfo.receiverTimeOnBall)}
            />
          )}

          <SectionTitle>Ball Distance Model</SectionTitle>

          <Row
            label="Target airborne"
            value={formatYards(hoverInfo.targetAirborneDistanceYards)}
          />

          <Row
            label="Target rollout"
            value={formatYards(hoverInfo.targetRolloutDistanceYards)}
          />

          <Row
            label="Projected airborne"
            value={formatYards(hoverInfo.projectedAirborneDistanceYards)}
          />

          <Row
            label="Projected rollout"
            value={formatYards(hoverInfo.projectedRolloutDistanceYards)}
          />

          <div
            style={{
              marginTop: "18px",
              padding: "12px",
              borderRadius: "8px",
              background:
                hoverInfo.status === "realistic"
                  ? "rgba(34,197,94,0.12)"
                  : "rgba(239,68,68,0.12)",
              color:
                hoverInfo.status === "realistic" ? "#bbf7d0" : "#fecaca",
              lineHeight: 1.45,
              fontSize: "13px"
            }}
          >
            <strong>{hoverInfo.statusLabel}</strong>
            <br />
            {hoverInfo.statusReason}
          </div>
        </>
      )}
    </div>
  );
}