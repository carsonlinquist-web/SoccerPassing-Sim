import { useEffect, useRef, useState } from "react";

type Point = {
  x: number;
  y: number;
};

type PassModelKey = "ground" | "driven" | "clipped" | "lofted";

type PassStatus = "realistic" | "too_slow" | "too_fast" | "impossible";

type DistanceIssue = "too_short" | "too_far" | null;

type PassReferencePoint = {
  distance: number;
  speedMin: number;
  speedMax: number;
  carryMin: number;
  carryMax: number;
  rolloutMin: number;
  rolloutMax: number;
};

type PassCalculation = {
  distanceYards: number;

  passTypeLabel: string;
  passModelKey: PassModelKey;
  status: PassStatus;
  statusLabel: string;
  statusReason: string;
  distanceIssue: DistanceIssue;

  requiredSpeedMin: number | null;
  requiredSpeedMax: number | null;
  acceptableSpeedMin: number | null;
  acceptableSpeedMax: number | null;

  ballTravelTime: number;
  receiverTimeOnBall: number;

  defenderCloseDownTime: number;
  defenderSpacingYards: number;

  targetAirborneDistanceYards: number;
  targetRolloutDistanceYards: number;
  targetTotalDistanceYards: number;

  projectedAirborneDistanceYards: number;
  projectedRolloutDistanceYards: number;
  projectedTotalDistanceYards: number;

  reachable: boolean;
};

const FIELD_W = 115;
const FIELD_H = 74;

const SIDE_PANEL_WIDTH = 460;
const TOP_BAR_HEIGHT = 88;

const MPH_TO_YARDS_PER_SECOND = 1760 / 3600;

// Default defender pressure model.
// Later, visible/toggleable defenders will replace this.
const DEFAULT_DEFENDER_SPEED_YARDS_PER_SECOND = 5.5;
const DEFAULT_DEFENDER_REACTION_TIME = 0.35;
const MIN_DEFAULT_MARKING_DISTANCE = 4.0;
const MAX_DEFAULT_MARKING_DISTANCE = 14.0;
const DISTANCE_TO_SPACING_FACTOR = 0.065;
const LONG_RANGE_SPACING_FACTOR = 0.17;
const LONG_RANGE_START_YARDS = 40;

// Broader tolerance so the app does not over-label passes as too slow/overhit.
const SPEED_RANGE_BUFFER_MIN_MPH = 4;
const SPEED_RANGE_BUFFER_MAX_MPH = 8;
const SPEED_RANGE_BUFFER_RATIO = 0.5;

const PASS_REFERENCES: Record<
  PassModelKey,
  {
    label: string;
    points: PassReferencePoint[];
    minRealisticDistance: number;
    maxRealisticDistance: number;
    shortReason?: string;
    longReason?: string;
  }
> = {
  ground: {
    label: "Ground Pass",
    minRealisticDistance: 0,
    maxRealisticDistance: 60,
    longReason: "Pass type is unrealistic at this distance",
    points: [
      {
        distance: 20,
        speedMin: 15,
        speedMax: 22,
        carryMin: 0,
        carryMax: 0,
        rolloutMin: 20,
        rolloutMax: 20
      },
      {
        distance: 40,
        speedMin: 30,
        speedMax: 40,
        carryMin: 0,
        carryMax: 0,
        rolloutMin: 40,
        rolloutMax: 40
      },
      {
        distance: 60,
        speedMin: 50,
        speedMax: 65,
        carryMin: 0,
        carryMax: 0,
        rolloutMin: 60,
        rolloutMax: 60
      }
    ]
  },

  driven: {
    label: "Driven Pass",
    minRealisticDistance: 0,
    maxRealisticDistance: 80,
    points: [
      {
        distance: 20,
        speedMin: 25,
        speedMax: 35,
        carryMin: 15,
        carryMax: 18,
        rolloutMin: 2,
        rolloutMax: 5
      },
      {
        distance: 40,
        speedMin: 40,
        speedMax: 50,
        carryMin: 32,
        carryMax: 36,
        rolloutMin: 4,
        rolloutMax: 8
      },
      {
        distance: 60,
        speedMin: 55,
        speedMax: 65,
        carryMin: 45,
        carryMax: 52,
        rolloutMin: 8,
        rolloutMax: 15
      },
      {
        distance: 80,
        speedMin: 70,
        speedMax: 80,
        carryMin: 55,
        carryMax: 62,
        rolloutMin: 18,
        rolloutMax: 25
      }
    ]
  },

  clipped: {
    label: "Clipped Pass",
    minRealisticDistance: 0,
    maxRealisticDistance: 40,
    longReason: "Pass type is unrealistic at this distance",
    points: [
      {
        distance: 20,
        speedMin: 20,
        speedMax: 25,
        carryMin: 16,
        carryMax: 18,
        rolloutMin: 2,
        rolloutMax: 4
      },
      {
        distance: 40,
        speedMin: 35,
        speedMax: 45,
        carryMin: 34,
        carryMax: 37,
        rolloutMin: 3,
        rolloutMax: 6
      }
    ]
  },

  lofted: {
    label: "Lofted Pass",
    minRealisticDistance: 40,
    maxRealisticDistance: 80,
    shortReason: "Pass type is ineffective this close to the passer",
    points: [
      {
        distance: 40,
        speedMin: 35,
        speedMax: 42,
        carryMin: 32,
        carryMax: 35,
        rolloutMin: 5,
        rolloutMax: 8
      },
      {
        distance: 60,
        speedMin: 50,
        speedMax: 60,
        carryMin: 50,
        carryMax: 54,
        rolloutMin: 6,
        rolloutMax: 10
      },
      {
        distance: 80,
        speedMin: 70,
        speedMax: 80,
        carryMin: 68,
        carryMax: 72,
        rolloutMin: 8,
        rolloutMax: 12
      }
    ]
  }
};

const PASS_SPEED_FACTORS: Record<
  PassModelKey,
  {
    airborneFactor: number;
    rolloutFactor: number;
  }
> = {
  ground: {
    airborneFactor: 0,
    rolloutFactor: 0.78
  },
  driven: {
    airborneFactor: 0.92,
    rolloutFactor: 0.45
  },
  clipped: {
    airborneFactor: 0.8,
    rolloutFactor: 0.34
  },
  lofted: {
    airborneFactor: 0.66,
    rolloutFactor: 0.28
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function formatRange(min: number | null, max: number | null) {
  if (min === null || max === null) return "—";
  return `${min.toFixed(0)}–${max.toFixed(0)} mph`;
}

function formatSignedTime(value: number) {
  if (value > 0) return `+${value.toFixed(1)}s`;
  if (value < 0) return `${value.toFixed(1)}s`;
  return "0.0s";
}

function getPassProfile(launchElevation: number): {
  label: string;
  modelKey: PassModelKey;
  forcedImpossibleReason?: string;
  forcedDistanceIssue?: DistanceIssue;
} {
  if (launchElevation <= 3) {
    return {
      label: "Ground Pass",
      modelKey: "ground"
    };
  }

  if (launchElevation < 5) {
    return {
      label: "Ground / Driven Transition",
      modelKey: "driven"
    };
  }

  if (launchElevation <= 15) {
    return {
      label: "Driven Pass",
      modelKey: "driven"
    };
  }

  if (launchElevation < 20) {
    return {
      label: "Driven / Clipped Transition",
      modelKey: "driven"
    };
  }

  if (launchElevation < 35) {
    return {
      label: "Clipped Pass",
      modelKey: "clipped"
    };
  }

  if (launchElevation <= 45) {
    return {
      label: "Lofted Pass",
      modelKey: "lofted"
    };
  }

  return {
    label: "Very High Lofted Pass",
    modelKey: "lofted",
    forcedImpossibleReason: "Pass type is unrealistic at this distance",
    forcedDistanceIssue: "too_far"
  };
}

function getAcceptableSpeedRange(reference: PassReferencePoint) {
  const rawBuffer =
    (reference.speedMax - reference.speedMin) * SPEED_RANGE_BUFFER_RATIO;

  const buffer = clamp(
    rawBuffer,
    SPEED_RANGE_BUFFER_MIN_MPH,
    SPEED_RANGE_BUFFER_MAX_MPH
  );

  return {
    acceptableSpeedMin: Math.max(0, reference.speedMin - buffer),
    acceptableSpeedMax: reference.speedMax + buffer
  };
}

function interpolateReference(
  modelKey: PassModelKey,
  distanceYards: number
):
  | {
      possible: true;
      reference: PassReferencePoint;
    }
  | {
      possible: false;
      reason: string;
      distanceIssue: DistanceIssue;
    } {
  const profile = PASS_REFERENCES[modelKey];

  if (distanceYards <= 0) {
    return {
      possible: true,
      reference: {
        distance: 0,
        speedMin: 0,
        speedMax: 0,
        carryMin: 0,
        carryMax: 0,
        rolloutMin: 0,
        rolloutMax: 0
      }
    };
  }

  if (distanceYards < profile.minRealisticDistance) {
    return {
      possible: false,
      reason:
        profile.shortReason ??
        "Pass type is ineffective this close to the passer",
      distanceIssue: "too_short"
    };
  }

  if (distanceYards > profile.maxRealisticDistance) {
    return {
      possible: false,
      reason:
        profile.longReason ?? "Pass type is unrealistic at this distance",
      distanceIssue: "too_far"
    };
  }

  const points = profile.points;

  if (distanceYards <= points[0].distance) {
    const first = points[0];
    const t = distanceYards / first.distance;

    return {
      possible: true,
      reference: {
        distance: distanceYards,
        speedMin: first.speedMin * t,
        speedMax: first.speedMax * t,
        carryMin: first.carryMin * t,
        carryMax: first.carryMax * t,
        rolloutMin: first.rolloutMin * t,
        rolloutMax: first.rolloutMax * t
      }
    };
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];

    if (distanceYards >= a.distance && distanceYards <= b.distance) {
      const t = (distanceYards - a.distance) / (b.distance - a.distance);

      return {
        possible: true,
        reference: {
          distance: distanceYards,
          speedMin: lerp(a.speedMin, b.speedMin, t),
          speedMax: lerp(a.speedMax, b.speedMax, t),
          carryMin: lerp(a.carryMin, b.carryMin, t),
          carryMax: lerp(a.carryMax, b.carryMax, t),
          rolloutMin: lerp(a.rolloutMin, b.rolloutMin, t),
          rolloutMax: lerp(a.rolloutMax, b.rolloutMax, t)
        }
      };
    }
  }

  const last = points[points.length - 1];

  return {
    possible: true,
    reference: {
      ...last,
      distance: distanceYards
    }
  };
}

function getApproximateReferenceForTiming(
  modelKey: PassModelKey,
  distanceYards: number
): PassReferencePoint {
  const profile = PASS_REFERENCES[modelKey];
  const points = profile.points;

  if (distanceYards <= 0) {
    return {
      distance: 0,
      speedMin: 0,
      speedMax: 0,
      carryMin: 0,
      carryMax: 0,
      rolloutMin: 0,
      rolloutMax: 0
    };
  }

  const possibleReference = interpolateReference(modelKey, distanceYards);

  if (possibleReference.possible) {
    return possibleReference.reference;
  }

  const first = points[0];
  const last = points[points.length - 1];

  if (distanceYards < first.distance) {
    const t = distanceYards / first.distance;

    return {
      distance: distanceYards,
      speedMin: first.speedMin * t,
      speedMax: first.speedMax * t,
      carryMin: first.carryMin * t,
      carryMax: first.carryMax * t,
      rolloutMin: first.rolloutMin * t,
      rolloutMax: first.rolloutMax * t
    };
  }

  const t = distanceYards / last.distance;

  return {
    distance: distanceYards,
    speedMin: last.speedMin * t,
    speedMax: last.speedMax * t,
    carryMin: Math.min(distanceYards, last.carryMin * t),
    carryMax: Math.min(distanceYards, last.carryMax * t),
    rolloutMin: last.rolloutMin * t,
    rolloutMax: last.rolloutMax * t
  };
}

function estimateTargetComponents(
  modelKey: PassModelKey,
  distanceYards: number,
  speedMph: number,
  reference: PassReferencePoint
) {
  if (modelKey === "ground") {
    return {
      airborne: 0,
      rollout: distanceYards
    };
  }

  const speedProgress =
    reference.speedMax === reference.speedMin
      ? 0.5
      : clamp(
          (speedMph - reference.speedMin) /
            (reference.speedMax - reference.speedMin),
          0,
          1
        );

  const rawCarry = lerp(
    reference.carryMin,
    reference.carryMax,
    speedProgress
  );

  const minCarryFromRollout = clamp(
    distanceYards - reference.rolloutMax,
    0,
    distanceYards
  );

  const maxCarryFromRollout = clamp(
    distanceYards - reference.rolloutMin,
    0,
    distanceYards
  );

  const airborne = clamp(
    rawCarry,
    minCarryFromRollout,
    maxCarryFromRollout
  );

  return {
    airborne,
    rollout: Math.max(0, distanceYards - airborne)
  };
}

function estimateProjectedDistanceFromSpeed(
  modelKey: PassModelKey,
  speedMph: number
) {
  const profile = PASS_REFERENCES[modelKey];
  const points = profile.points;

  const first = points[0];
  const last = points[points.length - 1];

  if (speedMph < first.speedMin) {
    if (modelKey === "lofted") return 0;

    return clamp(
      first.distance * (speedMph / first.speedMin),
      0,
      first.distance
    );
  }

  const midpoint = (point: PassReferencePoint) =>
    (point.speedMin + point.speedMax) / 2;

  if (speedMph <= midpoint(first)) {
    return first.distance;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];

    const aMid = midpoint(a);
    const bMid = midpoint(b);

    if (speedMph >= aMid && speedMph <= bMid) {
      const t = (speedMph - aMid) / (bMid - aMid);
      return lerp(a.distance, b.distance, t);
    }
  }

  if (speedMph <= last.speedMax) {
    return last.distance;
  }

  return profile.maxRealisticDistance;
}

function estimateDefaultDefenderSpacing(distanceFromOriginYards: number) {
  const baseSpacing =
    MIN_DEFAULT_MARKING_DISTANCE +
    Math.min(distanceFromOriginYards, LONG_RANGE_START_YARDS) *
      DISTANCE_TO_SPACING_FACTOR;

  const extraLongRangeSpacing =
    Math.max(0, distanceFromOriginYards - LONG_RANGE_START_YARDS) *
    LONG_RANGE_SPACING_FACTOR;

  return clamp(
    baseSpacing + extraLongRangeSpacing,
    MIN_DEFAULT_MARKING_DISTANCE,
    MAX_DEFAULT_MARKING_DISTANCE
  );
}

function estimateDefaultDefenderCloseDownTime(
  distanceFromOriginYards: number
) {
  const defenderSpacingYards =
    estimateDefaultDefenderSpacing(distanceFromOriginYards);

  return {
    defenderSpacingYards,
    defenderCloseDownTime:
      DEFAULT_DEFENDER_REACTION_TIME +
      defenderSpacingYards / DEFAULT_DEFENDER_SPEED_YARDS_PER_SECOND
  };
}

function estimateBallTravelTime(
  modelKey: PassModelKey,
  airborneYards: number,
  rolloutYards: number,
  speedMph: number,
  launchElevation: number
) {
  const speedYardsPerSecond = Math.max(
    0.01,
    speedMph * MPH_TO_YARDS_PER_SECOND
  );

  const angleRad = (launchElevation * Math.PI) / 180;
  const horizontalEfficiency = Math.max(0.15, Math.cos(angleRad));

  const factors = PASS_SPEED_FACTORS[modelKey];

  const trajectoryPenalty = 1 + (launchElevation / 90) * 0.35;

  const airborneSpeed = Math.max(
    0.01,
    (speedYardsPerSecond *
      horizontalEfficiency *
      Math.max(0.01, factors.airborneFactor)) /
      trajectoryPenalty
  );

  const rolloutSpeed = Math.max(
    0.01,
    speedYardsPerSecond * factors.rolloutFactor
  );

  const airborneTime =
    airborneYards <= 0 ? 0 : airborneYards / airborneSpeed;

  const rolloutTime =
    rolloutYards <= 0 ? 0 : rolloutYards / rolloutSpeed;

  return airborneTime + rolloutTime;
}

function getOutcomeSentence(calc: PassCalculation) {
  if (calc.status === "too_slow") {
    return "Ball will not reach intended target";
  }

  if (calc.status === "too_fast") {
    return "Ball will pass its intended target or cause a bad touch";
  }

  if (calc.status === "impossible") {
    if (calc.distanceIssue === "too_short") {
      return "Pass type is ineffective this close to the passer";
    }

    return "Pass type is unrealistic at this distance";
  }

  return `The intended target will have ${formatSignedTime(
    calc.receiverTimeOnBall
  )} before being pressured`;
}

function calculatePassModel(
  distanceYards: number,
  speedMph: number,
  launchElevation: number
): PassCalculation {
  const profile = getPassProfile(launchElevation);

  const projectedDistance = estimateProjectedDistanceFromSpeed(
    profile.modelKey,
    speedMph
  );

  const projectedReferenceResult = interpolateReference(
    profile.modelKey,
    projectedDistance
  );

  let projectedAirborne = 0;
  let projectedRollout = 0;

  if (projectedReferenceResult.possible) {
    const projectedComponents = estimateTargetComponents(
      profile.modelKey,
      projectedDistance,
      speedMph,
      projectedReferenceResult.reference
    );

    projectedAirborne = projectedComponents.airborne;
    projectedRollout = projectedComponents.rollout;
  }

  const { defenderSpacingYards, defenderCloseDownTime } =
    estimateDefaultDefenderCloseDownTime(distanceYards);

  const referenceResult = interpolateReference(
    profile.modelKey,
    distanceYards
  );

  const timingReference = getApproximateReferenceForTiming(
    profile.modelKey,
    distanceYards
  );

  const targetComponents = estimateTargetComponents(
    profile.modelKey,
    distanceYards,
    speedMph,
    timingReference
  );

  const ballTravelTime = estimateBallTravelTime(
    profile.modelKey,
    targetComponents.airborne,
    targetComponents.rollout,
    speedMph,
    launchElevation
  );

  const receiverTimeOnBall =
    defenderCloseDownTime - ballTravelTime;

  if (profile.forcedImpossibleReason) {
    return {
      distanceYards,
      passTypeLabel: profile.label,
      passModelKey: profile.modelKey,
      status: "impossible",
      statusLabel: "No Pass",
      statusReason: profile.forcedImpossibleReason,
      distanceIssue: profile.forcedDistanceIssue ?? "too_far",
      requiredSpeedMin: null,
      requiredSpeedMax: null,
      acceptableSpeedMin: null,
      acceptableSpeedMax: null,
      ballTravelTime,
      receiverTimeOnBall,
      defenderCloseDownTime,
      defenderSpacingYards,
      targetAirborneDistanceYards: targetComponents.airborne,
      targetRolloutDistanceYards: targetComponents.rollout,
      targetTotalDistanceYards: distanceYards,
      projectedAirborneDistanceYards: projectedAirborne,
      projectedRolloutDistanceYards: projectedRollout,
      projectedTotalDistanceYards: projectedDistance,
      reachable: false
    };
  }

  if (!referenceResult.possible) {
    return {
      distanceYards,
      passTypeLabel: profile.label,
      passModelKey: profile.modelKey,
      status: "impossible",
      statusLabel: "No Pass",
      statusReason: referenceResult.reason,
      distanceIssue: referenceResult.distanceIssue,
      requiredSpeedMin: null,
      requiredSpeedMax: null,
      acceptableSpeedMin: null,
      acceptableSpeedMax: null,
      ballTravelTime,
      receiverTimeOnBall,
      defenderCloseDownTime,
      defenderSpacingYards,
      targetAirborneDistanceYards: targetComponents.airborne,
      targetRolloutDistanceYards: targetComponents.rollout,
      targetTotalDistanceYards: distanceYards,
      projectedAirborneDistanceYards: projectedAirborne,
      projectedRolloutDistanceYards: projectedRollout,
      projectedTotalDistanceYards: projectedDistance,
      reachable: false
    };
  }

  const reference = referenceResult.reference;
  const { acceptableSpeedMin, acceptableSpeedMax } =
    getAcceptableSpeedRange(reference);

  let status: PassStatus = "realistic";
  let statusLabel = "Realistic";
  let statusReason = "Selected speed fits the acceptable professional range.";

  if (speedMph < acceptableSpeedMin) {
    status = "too_slow";
    statusLabel = "Too Slow";
    statusReason = "Ball will not reach intended target";
  } else if (speedMph > acceptableSpeedMax) {
    status = "too_fast";
    statusLabel = "Overhit";
    statusReason = "Ball will pass its intended target or cause a bad touch";
  }

  return {
    distanceYards,
    passTypeLabel: profile.label,
    passModelKey: profile.modelKey,
    status,
    statusLabel,
    statusReason,
    distanceIssue: null,
    requiredSpeedMin: reference.speedMin,
    requiredSpeedMax: reference.speedMax,
    acceptableSpeedMin,
    acceptableSpeedMax,
    ballTravelTime,
    receiverTimeOnBall,
    defenderCloseDownTime,
    defenderSpacingYards,
    targetAirborneDistanceYards: targetComponents.airborne,
    targetRolloutDistanceYards: targetComponents.rollout,
    targetTotalDistanceYards: distanceYards,
    projectedAirborneDistanceYards: projectedAirborne,
    projectedRolloutDistanceYards: projectedRollout,
    projectedTotalDistanceYards: projectedDistance,
    reachable: status === "realistic"
  };
}

function getPressureColor(calc: PassCalculation) {
  if (calc.status === "impossible" || calc.status === "too_slow") {
    return {
      stroke: "rgba(255, 80, 80, 0.4)",
      text: "#ff9b9b"
    };
  }

  if (calc.status === "too_fast") {
    return {
      stroke: "rgba(255, 170, 80, 0.45)",
      text: "#ffc48a"
    };
  }

  if (calc.receiverTimeOnBall >= 0.75) {
    return {
      stroke: "rgba(105, 255, 145, 0.35)",
      text: "#b7ffc8"
    };
  }

  if (calc.receiverTimeOnBall >= 0) {
    return {
      stroke: "rgba(255, 220, 90, 0.4)",
      text: "#ffe680"
    };
  }

  return {
    stroke: "rgba(255, 120, 90, 0.42)",
    text: "#ffb09b"
  };
}

function getRingLabel(distanceYards: number, calc: PassCalculation) {
  return `${distanceYards} yd | ${formatSignedTime(calc.receiverTimeOnBall)}`;
}

function TrajectoryGraphic({ calc }: { calc: PassCalculation }) {
  const width = 400;
  const height = 230;

  const startX = 30;
  const groundY = 150;
  const endX = width - 30;

  const usableW = endX - startX;
  const total = Math.max(calc.projectedTotalDistanceYards, 1);

  const carryX =
    startX +
    (calc.projectedAirborneDistanceYards / total) * usableW;

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

function InfoPanel({
  hasOrigin,
  hoverInfo,
  ballSpeed,
  launchElevation
}: {
  hasOrigin: boolean;
  hoverInfo: PassCalculation | null;
  ballSpeed: number;
  launchElevation: number;
}) {
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

            <div>
              Ball Travel: {calc.ballTravelTime.toFixed(2)} sec
            </div>
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

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const originRef = useRef<Point | null>(null);
  const previousOriginRef = useRef<Point | null>(null);
  const hoverRef = useRef<Point | null>(null);

  const ringTransitionStartRef = useRef(0);
  const ringTransitionDuration = 700;

  const [hasOrigin, setHasOrigin] = useState(false);
  const [showZones, setShowZones] = useState(false);

  const [ballSpeed, setBallSpeed] = useState(25);
  const [launchElevation, setLaunchElevation] = useState(15);

  const [hoverInfo, setHoverInfo] = useState<PassCalculation | null>(null);

  const speedRef = useRef(ballSpeed);
  const launchRef = useRef(launchElevation);
  const showZonesRef = useRef(showZones);

  useEffect(() => {
    speedRef.current = ballSpeed;
  }, [ballSpeed]);

  useEffect(() => {
    launchRef.current = launchElevation;
  }, [launchElevation]);

  useEffect(() => {
    showZonesRef.current = showZones;
  }, [showZones]);

  function getCurrentHoverDistanceYards() {
    const canvas = canvasRef.current;
    const origin = originRef.current;
    const hover = hoverRef.current;

    if (!canvas || !origin || !hover) return null;

    const scale = canvas.width / FIELD_W;

    const dx = hover.x - origin.x;
    const dy = hover.y - origin.y;
    const distPx = Math.sqrt(dx * dx + dy * dy);

    return distPx / scale;
  }

  function updateHoverInfo(
    speed = speedRef.current,
    launch = launchRef.current
  ) {
    const distance = getCurrentHoverDistanceYards();

    if (distance === null) {
      setHoverInfo(null);
      return;
    }

    setHoverInfo(calculatePassModel(distance, speed, launch));
  }

  function restartRingTransition() {
    if (!originRef.current) return;

    previousOriginRef.current = { ...originRef.current };
    ringTransitionStartRef.current = performance.now();
  }

  function handleBallSpeedChange(nextSpeed: number) {
    setBallSpeed(nextSpeed);
    speedRef.current = nextSpeed;

    restartRingTransition();
    updateHoverInfo(nextSpeed, launchRef.current);
  }

  function handleLaunchElevationChange(nextElevation: number) {
    setLaunchElevation(nextElevation);
    launchRef.current = nextElevation;

    restartRingTransition();
    updateHoverInfo(speedRef.current, nextElevation);
  }

  function handleReset() {
    originRef.current = null;
    previousOriginRef.current = null;
    hoverRef.current = null;

    setHasOrigin(false);
    setHoverInfo(null);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function getScale() {
      return Math.min(canvas.width / FIELD_W, canvas.height / FIELD_H);
    }

    function yardsToPixels(yards: number) {
      return yards * getScale();
    }

    function pixelsToYards(px: number) {
      return px / getScale();
    }

    function getDistanceYards(a: Point, b: Point) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distPx = Math.sqrt(dx * dx + dy * dy);

      return pixelsToYards(distPx);
    }

    function resize() {
      const maxW = Math.max(
        320,
        window.innerWidth - SIDE_PANEL_WIDTH - 44
      );

      const maxH = Math.max(
        260,
        window.innerHeight - TOP_BAR_HEIGHT - 34
      );

      const scale = Math.min(maxW / FIELD_W, maxH / FIELD_H);

      canvas.width = FIELD_W * scale;
      canvas.height = FIELD_H * scale;

      updateHoverInfo();
    }

    function drawField() {
      const w = canvas.width;
      const h = canvas.height;
      const scale = getScale();

      ctx.fillStyle = "#0b5d2a";
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;

      ctx.strokeRect(0, 0, w, h);

      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 9 * scale, 0, Math.PI * 2);
      ctx.stroke();

      const boxW = w * 0.165;
      const boxH = h * 0.44;

      const sixW = w * 0.055;
      const sixH = h * 0.24;

      ctx.strokeRect(0, h / 2 - boxH / 2, boxW, boxH);
      ctx.strokeRect(w - boxW, h / 2 - boxH / 2, boxW, boxH);

      ctx.strokeRect(0, h / 2 - sixH / 2, sixW, sixH);
      ctx.strokeRect(w - sixW, h / 2 - sixH / 2, sixW, sixH);

      const pk = 12 * scale;

      ctx.fillStyle = "#fff";

      ctx.beginPath();
      ctx.arc(pk, h / 2, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(w - pk, h / 2, 3, 0, Math.PI * 2);
      ctx.fill();

      const arcR = 9 * scale;

      ctx.strokeStyle = "#fff";

      ctx.beginPath();
      ctx.arc(boxW, h / 2, arcR, Math.PI * 1.5, Math.PI * 0.5, false);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w - boxW, h / 2, arcR, Math.PI * 1.5, Math.PI * 0.5, true);
      ctx.stroke();

      const cornerR = 3 * scale;

      ctx.beginPath();
      ctx.arc(0, 0, cornerR, 0, Math.PI / 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w, 0, cornerR, Math.PI / 2, Math.PI);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, h, cornerR, -Math.PI / 2, 0);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w, h, cornerR, Math.PI, Math.PI * 1.5);
      ctx.stroke();
    }

    function drawZoneOverlay() {
      if (!showZonesRef.current) return;

      const w = canvas.width;
      const h = canvas.height;

      const columns = 6;
      const rows = 3;

      const zoneW = w / columns;
      const zoneH = h / rows;

      ctx.save();

      ctx.lineWidth = 1;
      ctx.font = "bold 22px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let col = 0; col < columns; col++) {
        for (let row = 0; row < rows; row++) {
          const x = col * zoneW;
          const y = row * zoneH;

          const zoneNumber = col * rows + row + 1;

          ctx.fillStyle =
            (row + col) % 2 === 0
              ? "rgba(255, 255, 255, 0.03)"
              : "rgba(255, 255, 255, 0.05)";

          ctx.fillRect(x, y, zoneW, zoneH);

          ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
          ctx.strokeRect(x, y, zoneW, zoneH);

          ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
          ctx.fillText(`${zoneNumber}`, x + zoneW / 2, y + zoneH / 2);
        }
      }

      ctx.restore();
    }

    function drawLabel(
      text: string,
      x: number,
      y: number,
      textColor = "#fff"
    ) {
      ctx.font = "12px Arial";

      const padding = 4;
      const textWidth = ctx.measureText(text).width;
      const textHeight = 14;

      const labelX = clamp(
        x,
        textWidth / 2 + padding,
        canvas.width - textWidth / 2 - padding
      );

      const labelY = clamp(
        y,
        textHeight + padding,
        canvas.height - padding
      );

      ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
      ctx.fillRect(
        labelX - textWidth / 2 - padding,
        labelY - textHeight,
        textWidth + padding * 2,
        textHeight + padding
      );

      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, labelX, labelY - 5);

      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }

    function pointInsideField(x: number, y: number) {
      return x >= 0 && x <= canvas.width && y >= 0 && y <= canvas.height;
    }

    function drawRingLabelIfInsideField(
      text: string,
      x: number,
      y: number,
      textColor: string
    ) {
      if (!pointInsideField(x, y)) return;
      drawLabel(text, x, y, textColor);
    }

    function easeOutCubic(value: number) {
      return 1 - Math.pow(1 - value, 3);
    }

    function getTransitionProgress() {
      if (!ringTransitionStartRef.current) return 1;

      return clamp(
        (performance.now() - ringTransitionStartRef.current) /
          ringTransitionDuration,
        0,
        1
      );
    }

    function drawRingSet(origin: Point, alpha: number, radiusScale: number) {
      if (alpha <= 0) return;

      ctx.save();
      ctx.globalAlpha = alpha;

      for (let r = 20; r <= 80; r += 20) {
        const calc = calculatePassModel(
          r,
          speedRef.current,
          launchRef.current
        );

        const colors = getPressureColor(calc);
        const radiusPx = yardsToPixels(r) * radiusScale;

        ctx.save();

        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1.2;

        if (calc.status !== "realistic") {
          ctx.setLineDash([6, 6]);
        }

        ctx.beginPath();
        ctx.arc(origin.x, origin.y, radiusPx, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([]);

        const label = getRingLabel(r, calc);

        drawRingLabelIfInsideField(
          label,
          origin.x + radiusPx,
          origin.y,
          colors.text
        );

        drawRingLabelIfInsideField(
          label,
          origin.x - radiusPx,
          origin.y,
          colors.text
        );

        drawRingLabelIfInsideField(
          label,
          origin.x,
          origin.y - radiusPx,
          colors.text
        );

        drawRingLabelIfInsideField(
          label,
          origin.x,
          origin.y + radiusPx,
          colors.text
        );

        ctx.restore();
      }

      ctx.restore();
    }

    function drawTimingRings() {
      const origin = originRef.current;
      if (!origin) return;

      const previousOrigin = previousOriginRef.current;
      const progress = getTransitionProgress();

      if (previousOrigin && progress < 1) {
        const oldAlpha = 1 - clamp(progress / 0.45, 0, 1);

        const newProgress = easeOutCubic(
          clamp((progress - 0.25) / 0.75, 0, 1)
        );

        drawRingSet(previousOrigin, oldAlpha, 1);
        drawRingSet(origin, newProgress, 0.88 + newProgress * 0.12);

        return;
      }

      if (progress >= 1) {
        previousOriginRef.current = null;
      }

      const appear = easeOutCubic(progress);
      drawRingSet(origin, appear, 0.88 + appear * 0.12);
    }

    function drawHoverPreview() {
      const origin = originRef.current;
      const hover = hoverRef.current;

      if (!origin || !hover) return;

      const distance = getDistanceYards(origin, hover);

      const calc = calculatePassModel(
        distance,
        speedRef.current,
        launchRef.current
      );

      const colors = getPressureColor(calc);

      ctx.save();

      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1.8;
      ctx.setLineDash(calc.status === "realistic" ? [6, 6] : [3, 6]);

      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(hover.x, hover.y);
      ctx.stroke();

      ctx.setLineDash([]);

      const midX = (origin.x + hover.x) / 2;
      const midY = (origin.y + hover.y) / 2;

      const label = `Receiver: ${formatSignedTime(calc.receiverTimeOnBall)}`;

      drawLabel(label, midX, midY - 10, colors.text);

      ctx.restore();
    }

    function drawBall() {
      const origin = originRef.current;
      if (!origin) return;

      const bx = origin.x;
      const by = origin.y;
      const r = 6;

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#111";
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.fillStyle = "#111";
      ctx.beginPath();

      for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const px = bx + Math.cos(angle) * (r * 0.45);
        const py = by + Math.sin(angle) * (r * 0.45);

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#111";
      ctx.lineWidth = 0.5;

      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;

        const x1 = bx + Math.cos(angle) * (r * 0.2);
        const y1 = by + Math.sin(angle) * (r * 0.2);

        const x2 = bx + Math.cos(angle) * r;
        const y2 = by + Math.sin(angle) * r;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawField();
      drawZoneOverlay();
      drawTimingRings();
      drawHoverPreview();
      drawBall();
    }

    function loop() {
      draw();
      animationFrameRef.current = requestAnimationFrame(loop);
    }

    function getMousePosition(e: MouseEvent): Point {
      const rect = canvas.getBoundingClientRect();

      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }

    function handleClick(e: MouseEvent) {
      const point = getMousePosition(e);

      if (originRef.current) {
        previousOriginRef.current = { ...originRef.current };
      } else {
        previousOriginRef.current = null;
      }

      originRef.current = point;
      hoverRef.current = null;

      ringTransitionStartRef.current = performance.now();

      setHasOrigin(true);
      setHoverInfo(null);
    }

    function handleMouseMove(e: MouseEvent) {
      const point = getMousePosition(e);

      hoverRef.current = point;

      const origin = originRef.current;
      if (!origin) {
        setHoverInfo(null);
        return;
      }

      const distance = getDistanceYards(origin, point);

      setHoverInfo(
        calculatePassModel(
          distance,
          speedRef.current,
          launchRef.current
        )
      );
    }

    function handleMouseLeave() {
      hoverRef.current = null;
      setHoverInfo(null);
    }

    resize();

    window.addEventListener("resize", resize);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    loop();

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      style={{
        background: "#111",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        position: "relative"
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: TOP_BAR_HEIGHT,
          zIndex: 20,
          color: "#fff",
          background: "rgba(0,0,0,0.82)",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
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
            Phase 2 Controls
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

        <div style={{ width: "250px" }}>
          <label style={{ fontSize: "13px" }}>
            Ball Speed: {ballSpeed} mph
          </label>

          <input
            type="range"
            min="5"
            max="80"
            value={ballSpeed}
            onChange={(e) =>
              handleBallSpeedChange(Number(e.target.value))
            }
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ width: "260px" }}>
          <label style={{ fontSize: "13px" }}>
            Launch Elevation: {launchElevation}°
          </label>

          <input
            type="range"
            min="0"
            max="45"
            value={launchElevation}
            onChange={(e) =>
              handleLaunchElevationChange(Number(e.target.value))
            }
            style={{ width: "100%" }}
          />
        </div>

        <button
          onClick={handleReset}
          style={{
            padding: "8px 18px",
            cursor: "pointer",
            marginLeft: "auto"
          }}
        >
          Reset
        </button>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: SIDE_PANEL_WIDTH,
          top: TOP_BAR_HEIGHT,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: "block"
          }}
        />
      </div>

      <InfoPanel
        hasOrigin={hasOrigin}
        hoverInfo={hoverInfo}
        ballSpeed={ballSpeed}
        launchElevation={launchElevation}
      />
    </div>
  );
}