import type { PassModelKey, PassReferencePoint } from "../types";

export const PASS_REFERENCES: Record<
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

export const PASS_SPEED_FACTORS: Record<
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