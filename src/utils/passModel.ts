import { PASS_REFERENCES, PASS_SPEED_FACTORS } from "../data/passReferences";
import type {
  DistanceIssue,
  PassCalculation,
  PassModelKey,
  PassReferencePoint,
  PassStatus,
  Point
} from "../types";
import {
  DEFAULT_DEFENDER_REACTION_TIME,
  DEFAULT_DEFENDER_SPEED_YARDS_PER_SECOND,
  DISTANCE_TO_SPACING_FACTOR,
  FIELD_W,
  LONG_RANGE_SPACING_FACTOR,
  LONG_RANGE_START_YARDS,
  MAX_DEFAULT_MARKING_DISTANCE,
  MIN_DEFAULT_MARKING_DISTANCE,
  MPH_TO_YARDS_PER_SECOND,
  SPEED_RANGE_BUFFER_MAX_MPH,
  SPEED_RANGE_BUFFER_MIN_MPH,
  SPEED_RANGE_BUFFER_RATIO
} from "./constants";

type DefenderTimingOverride = {
  defenderSpacingYards: number;
  defenderCloseDownTime: number;
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function formatRange(min: number | null, max: number | null) {
  if (min === null || max === null) return "—";
  return `${min.toFixed(0)}–${max.toFixed(0)} mph`;
}

export function formatSignedTime(value: number) {
  if (value > 0) return `+${value.toFixed(1)}s`;
  if (value < 0) return `${value.toFixed(1)}s`;
  return "0.0s";
}

export function getPassProfile(launchElevation: number): {
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

export function getDirectionalTimeModifier(
  origin: Point,
  target: Point,
  canvasWidth: number,
  canvasHeight: number
) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;

  const distancePx = Math.sqrt(dx * dx + dy * dy);
  if (distancePx < 1) return 0;

  const scale = canvasWidth / FIELD_W;
  const distanceYards = distancePx / scale;

  const directionRatio = dx / distancePx;

  const forwardStrength = clamp(directionRatio, 0, 1);
  const backwardStrength = clamp(-directionRatio, 0, 1);
  const lateralStrength = 1 - Math.abs(directionRatio);

  const targetWideScore =
    Math.abs(target.y - canvasHeight / 2) / (canvasHeight / 2);

  const originWideScore =
    Math.abs(origin.y - canvasHeight / 2) / (canvasHeight / 2);

  const targetCentralScore = 1 - targetWideScore;

  const movingTowardCenter =
    Math.abs(target.y - canvasHeight / 2) <
    Math.abs(origin.y - canvasHeight / 2);

  const movingAwayFromCenter =
    Math.abs(target.y - canvasHeight / 2) >
    Math.abs(origin.y - canvasHeight / 2);

  const wideBonus = clamp((targetWideScore - 0.45) / 0.55, 0, 1) * 0.55;

  const centralPenalty =
    clamp((targetCentralScore - 0.45) / 0.55, 0, 1) *
    (0.25 + forwardStrength * 0.45);

  let modifier = 0;

  modifier += backwardStrength * 0.75;
  modifier += lateralStrength * 0.18;
  modifier -= forwardStrength * 0.35;

  modifier += wideBonus;
  modifier -= centralPenalty;

  if (movingTowardCenter) {
    modifier -= 0.2 + forwardStrength * 0.15;
  }

  if (movingAwayFromCenter && targetWideScore > originWideScore) {
    modifier += 0.18;
  }

  const distanceInfluence = clamp(distanceYards / 35, 0.25, 1);

  return clamp(modifier * distanceInfluence, -1.05, 1.15);
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

export function estimateProjectedDistanceFromSpeed(
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

function estimateDefaultDefenderCloseDownTime(distanceFromOriginYards: number) {
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

export function getOutcomeSentence(calc: PassCalculation) {
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

export function calculatePassModel(
  distanceYards: number,
  speedMph: number,
  launchElevation: number,
  directionalTimeModifier = 0,
  defenderTimingOverride?: DefenderTimingOverride
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

  const defaultDefenderTiming =
    estimateDefaultDefenderCloseDownTime(distanceYards);

  const defenderTiming = defenderTimingOverride ?? defaultDefenderTiming;

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
    defenderTiming.defenderCloseDownTime -
    ballTravelTime +
    directionalTimeModifier;

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
      defenderCloseDownTime: defenderTiming.defenderCloseDownTime,
      defenderSpacingYards: defenderTiming.defenderSpacingYards,
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
      defenderCloseDownTime: defenderTiming.defenderCloseDownTime,
      defenderSpacingYards: defenderTiming.defenderSpacingYards,
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
    defenderCloseDownTime: defenderTiming.defenderCloseDownTime,
    defenderSpacingYards: defenderTiming.defenderSpacingYards,
    targetAirborneDistanceYards: targetComponents.airborne,
    targetRolloutDistanceYards: targetComponents.rollout,
    targetTotalDistanceYards: distanceYards,
    projectedAirborneDistanceYards: projectedAirborne,
    projectedRolloutDistanceYards: projectedRollout,
    projectedTotalDistanceYards: projectedDistance,
    reachable: status === "realistic"
  };
}

export function getPressureColor(calc: PassCalculation) {
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

export function getRingLabel(distanceYards: number, calc: PassCalculation) {
  return `${distanceYards} yd | ${formatSignedTime(calc.receiverTimeOnBall)}`;
}