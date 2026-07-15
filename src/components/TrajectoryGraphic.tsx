import type { PassCalculation } from "../types";
import { clamp } from "../utils/passModel";

type TrajectoryGraphicProps = {
  calc: PassCalculation;
};

export function TrajectoryGraphic({ calc }: TrajectoryGraphicProps) {
  const width = 400;
  const height = 230;

  const startX = 30;
  const groundY = 150;
  const endX = width - 30;

  const usableW = endX - startX;
  const total = Math.max(calc.projectedTotalDistanceYards, 1);

  const carryX =
    startX + (calc.projectedAirborneDistanceYards / total) * usableW;

  const totalX = endX;

  const rolloutRatio = clamp(
    calc.projectedRolloutDistanceYards / total,
    0,
    1
  );

  const arcHeight = clamp(38 + (1 - rolloutRatio) * 56, 38, 94);

  const arcPath = `
    M ${startX} ${groundY}
    Q ${(startX + carryX) / 2} ${groundY - arcHeight}
    ${carryX} ${groundY}
  `;

  return (
    <div style={{ marginTop: "16px" }}>
      <style>
        {`
          @keyframes trajectoryDash {
            from { stroke-dashoffset: 0; }
            to { stroke-dashoffset: -36; }
          }
        `}
      </style>

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          background: "rgba(255,255,255,0.045)",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "10px"
        }}
      >
        <text x={18} y={24} fill="#fff" fontSize="14" fontWeight="bold">
          Projected Ball Path
        </text>

        <line
          x1={startX}
          y1={groundY}
          x2={totalX}
          y2={groundY}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="2"
        />

        {calc.projectedAirborneDistanceYards > 0 && (
          <path
            d={arcPath}
            fill="none"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="3"
            strokeDasharray="8 8"
            style={{
              animation: "trajectoryDash 1.4s linear infinite"
            }}
          />
        )}

        {calc.projectedRolloutDistanceYards > 0 && (
          <line
            x1={carryX}
            y1={groundY}
            x2={totalX}
            y2={groundY}
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="3"
            strokeDasharray="7 6"
            style={{
              animation: "trajectoryDash 1.4s linear infinite"
            }}
          />
        )}

        <circle cx={startX} cy={groundY} r="6" fill="#fff" />

        <circle cx={carryX} cy={groundY} r="6" fill="#ffe680">
          <animate
            attributeName="opacity"
            values="0.45;1;0.45"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </circle>

        <circle cx={totalX} cy={groundY} r="6" fill="#b7ffc8">
          <animate
            attributeName="opacity"
            values="0.45;1;0.45"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </circle>

        <text
          x={startX}
          y={groundY + 28}
          fill="rgba(255,255,255,0.75)"
          fontSize="12"
          textAnchor="middle"
        >
          Kick
        </text>

        <text
          x={carryX}
          y={groundY + 28}
          fill="#ffe680"
          fontSize="12"
          textAnchor="middle"
        >
          Lands
        </text>

        <text
          x={totalX}
          y={groundY + 28}
          fill="#b7ffc8"
          fontSize="12"
          textAnchor="middle"
        >
          Stops
        </text>

        <text x={18} y={206} fill="#fff" fontSize="12">
          Airborne: {calc.projectedAirborneDistanceYards.toFixed(1)} yd
        </text>

        <text x={150} y={206} fill="#fff" fontSize="12">
          Rollout: {calc.projectedRolloutDistanceYards.toFixed(1)} yd
        </text>

        <text x={275} y={206} fill="#fff" fontSize="12">
          Total: {calc.projectedTotalDistanceYards.toFixed(1)} yd
        </text>
      </svg>
    </div>
  );
}