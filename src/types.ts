export type Point = {
  x: number;
  y: number;
};

export type PlayerTeam = "attacker" | "defender";

export type Player = {
  id: string;
  team: PlayerTeam;
  label: string;
  x: number;
  y: number;
};

export type PassIntentMode = "open" | "through";

export type PassModelKey = "ground" | "driven" | "clipped" | "lofted";

export type PassStatus = "realistic" | "too_slow" | "too_fast" | "impossible";

export type DistanceIssue = "too_short" | "too_far" | null;

export type PassReferencePoint = {
  distance: number;
  speedMin: number;
  speedMax: number;
  carryMin: number;
  carryMax: number;
  rolloutMin: number;
  rolloutMax: number;
};

export type PassCalculation = {
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

  runnerDistanceYards?: number;
  runnerTimeToTarget?: number;
  runnerAdvantageVsDefender?: number;
  throughBallWindow?: number;

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