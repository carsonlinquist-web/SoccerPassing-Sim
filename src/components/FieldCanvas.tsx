import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  AttackingDirection,
  PassCalculation,
  PassIntentMode,
  Player,
  Point
} from "../types";
import {
  DEFAULT_DEFENDER_REACTION_TIME,
  FIELD_H,
  FIELD_W,
  SIDE_PANEL_WIDTH,
  TOP_BAR_HEIGHT
} from "../utils/constants";
import {
  calculatePassModel,
  clamp,
  formatSignedTime,
  getDirectionalTimeModifier,
  getPressureColor,
  getRingLabel
} from "../utils/passModel";

type FieldCanvasProps = {
  ballSpeed: number;
  launchElevation: number;
  showZones: boolean;
  showPlayers: boolean;
  passIntentMode: PassIntentMode;
  attackingDirection: AttackingDirection;
  attackerRunSpeed: number;
  defenderSpeed: number;
  players: Player[];
  setPlayers: Dispatch<SetStateAction<Player[]>>;
  resetKey: number;
  setHasOrigin: (value: boolean) => void;
  setHoverInfo: (value: PassCalculation | null) => void;
};

type DraggingPlayer = {
  id: string;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type DefenderPressureContext = {
  defender: Player;
  defenderCanvasPoint: Point;
  defenderSpacingYards: number;
  defenderCloseDownTime: number;
};

type TargetContext = {
  targetCanvasPoint: Point;
  receiverPlayer: Player | null;
  receiverPlayerCanvasPoint: Point | null;
  pressureContext: DefenderPressureContext | null;
};

type BestThroughBallContext = {
  targetCanvasPoint: Point;
  calculation: PassCalculation;
};

const DEFAULT_ATTACKER_REACTION_TIME = 0.2;

const BEST_THROUGH_SEARCH_RADIUS_YARDS = 16;
const BEST_THROUGH_SEARCH_STEP_YARDS = 4;
const BEST_THROUGH_MIN_IMPROVEMENT_SECONDS = 0.15;

const MIN_THROUGH_FORWARD_RUN_YARDS = 2;
const MIN_THROUGH_FORWARD_FROM_BALL_YARDS = 4;
const MAX_THROUGH_LATERAL_RUN_RATIO = 2.5;
const INVALID_THROUGH_BALL_PENALTY_SECONDS = 1.0;

export function FieldCanvas({
  ballSpeed,
  launchElevation,
  showZones,
  showPlayers,
  passIntentMode,
  attackingDirection,
  attackerRunSpeed,
  defenderSpeed,
  players,
  setPlayers,
  resetKey,
  setHasOrigin,
  setHoverInfo
}: FieldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const originRef = useRef<Point | null>(null);
  const previousOriginRef = useRef<Point | null>(null);
  const hoverRef = useRef<Point | null>(null);
  const lockedHoverRef = useRef<Point | null>(null);

  const selectedRunnerIdRef = useRef<string | null>(null);
  const draggingPlayerRef = useRef<DraggingPlayer | null>(null);
  const suppressNextClickRef = useRef(false);

  const ringTransitionStartRef = useRef(0);
  const ringTransitionDuration = 700;

  const speedRef = useRef(ballSpeed);
  const launchRef = useRef(launchElevation);
  const showZonesRef = useRef(showZones);
  const showPlayersRef = useRef(showPlayers);
  const passIntentModeRef = useRef<PassIntentMode>(passIntentMode);
  const attackingDirectionRef =
    useRef<AttackingDirection>(attackingDirection);
  const attackerRunSpeedRef = useRef(attackerRunSpeed);
  const defenderSpeedRef = useRef(defenderSpeed);
  const playersRef = useRef<Player[]>(players);

  function getScale(canvas: HTMLCanvasElement) {
    return Math.min(canvas.width / FIELD_W, canvas.height / FIELD_H);
  }

  function yardsToPixels(yards: number, canvas: HTMLCanvasElement) {
    return yards * getScale(canvas);
  }

  function pixelsToYards(px: number, canvas: HTMLCanvasElement) {
    return px / getScale(canvas);
  }

  function yardPointToCanvasPoint(
    point: Point,
    canvas: HTMLCanvasElement
  ): Point {
    const scale = getScale(canvas);

    return {
      x: point.x * scale,
      y: point.y * scale
    };
  }

  function canvasPointToYardPoint(
    point: Point,
    canvas: HTMLCanvasElement
  ): Point {
    const scale = getScale(canvas);

    return {
      x: clamp(point.x / scale, 0, FIELD_W),
      y: clamp(point.y / scale, 0, FIELD_H)
    };
  }

  function getDistanceYards(
    a: Point,
    b: Point,
    canvas: HTMLCanvasElement
  ) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distPx = Math.sqrt(dx * dx + dy * dy);

    return pixelsToYards(distPx, canvas);
  }

  function getPlayerById(id: string | null) {
    if (!id) return null;
    return playersRef.current.find((player) => player.id === id) ?? null;
  }

  function getPlayerCanvasPoint(
    player: Player,
    canvas: HTMLCanvasElement
  ): Point {
    return yardPointToCanvasPoint(
      {
        x: player.x,
        y: player.y
      },
      canvas
    );
  }

  function findNearestPlayerToCanvasPoint(
    point: Point,
    team: "attacker" | "defender",
    canvas: HTMLCanvasElement
  ) {
    let nearestPlayer: Player | null = null;
    let nearestCanvasPoint: Point | null = null;
    let nearestDistancePx = Infinity;

    for (const player of playersRef.current) {
      if (player.team !== team) continue;

      const playerCanvasPoint = getPlayerCanvasPoint(player, canvas);

      const dx = point.x - playerCanvasPoint.x;
      const dy = point.y - playerCanvasPoint.y;
      const distancePx = Math.sqrt(dx * dx + dy * dy);

      if (distancePx < nearestDistancePx) {
        nearestPlayer = player;
        nearestCanvasPoint = playerCanvasPoint;
        nearestDistancePx = distancePx;
      }
    }

    if (!nearestPlayer || !nearestCanvasPoint) return null;

    return {
      player: nearestPlayer,
      canvasPoint: nearestCanvasPoint,
      distancePx: nearestDistancePx
    };
  }

  function getDirectionAwareModifier(
    origin: Point,
    target: Point,
    canvas: HTMLCanvasElement
  ) {
    if (attackingDirectionRef.current === "ltr") {
      return getDirectionalTimeModifier(
        origin,
        target,
        canvas.width,
        canvas.height
      );
    }

    const mirroredOrigin = {
      x: canvas.width - origin.x,
      y: origin.y
    };

    const mirroredTarget = {
      x: canvas.width - target.x,
      y: target.y
    };

    return getDirectionalTimeModifier(
      mirroredOrigin,
      mirroredTarget,
      canvas.width,
      canvas.height
    );
  }

  function getDefenderPressureContextForCanvasPoint(
    receiverCanvasPoint: Point,
    canvas: HTMLCanvasElement
  ): DefenderPressureContext | null {
    if (!showPlayersRef.current) return null;

    const nearestDefender = findNearestPlayerToCanvasPoint(
      receiverCanvasPoint,
      "defender",
      canvas
    );

    if (!nearestDefender) return null;

    const defenderSpacingYards = pixelsToYards(
      nearestDefender.distancePx,
      canvas
    );

    return {
      defender: nearestDefender.player,
      defenderCanvasPoint: nearestDefender.canvasPoint,
      defenderSpacingYards,
      defenderCloseDownTime:
        DEFAULT_DEFENDER_REACTION_TIME +
        defenderSpacingYards / defenderSpeedRef.current
    };
  }

  function getTargetContextFromCanvasPoint(
    hoverPoint: Point,
    canvas: HTMLCanvasElement
  ): TargetContext {
    if (!showPlayersRef.current) {
      return {
        targetCanvasPoint: hoverPoint,
        receiverPlayer: null,
        receiverPlayerCanvasPoint: null,
        pressureContext: null
      };
    }

    const selectedRunner = getPlayerById(selectedRunnerIdRef.current);

    if (
      passIntentModeRef.current === "through" &&
      selectedRunner &&
      selectedRunner.team === "attacker"
    ) {
      const selectedRunnerCanvasPoint = getPlayerCanvasPoint(
        selectedRunner,
        canvas
      );

      return {
        targetCanvasPoint: hoverPoint,
        receiverPlayer: selectedRunner,
        receiverPlayerCanvasPoint: selectedRunnerCanvasPoint,
        pressureContext: getDefenderPressureContextForCanvasPoint(
          hoverPoint,
          canvas
        )
      };
    }

    const nearestAttacker = findNearestPlayerToCanvasPoint(
      hoverPoint,
      "attacker",
      canvas
    );

    if (passIntentModeRef.current === "through") {
      return {
        targetCanvasPoint: hoverPoint,
        receiverPlayer: nearestAttacker?.player ?? null,
        receiverPlayerCanvasPoint: nearestAttacker?.canvasPoint ?? null,
        pressureContext: getDefenderPressureContextForCanvasPoint(
          hoverPoint,
          canvas
        )
      };
    }

    if (!nearestAttacker) {
      return {
        targetCanvasPoint: hoverPoint,
        receiverPlayer: null,
        receiverPlayerCanvasPoint: null,
        pressureContext: getDefenderPressureContextForCanvasPoint(
          hoverPoint,
          canvas
        )
      };
    }

    return {
      targetCanvasPoint: nearestAttacker.canvasPoint,
      receiverPlayer: nearestAttacker.player,
      receiverPlayerCanvasPoint: nearestAttacker.canvasPoint,
      pressureContext: getDefenderPressureContextForCanvasPoint(
        nearestAttacker.canvasPoint,
        canvas
      )
    };
  }

  function getThroughBallValidity(
    origin: Point,
    runnerCanvasPoint: Point,
    targetCanvasPoint: Point,
    canvas: HTMLCanvasElement
  ) {
    const originYardPoint = canvasPointToYardPoint(origin, canvas);
    const runnerYardPoint = canvasPointToYardPoint(
      runnerCanvasPoint,
      canvas
    );
    const targetYardPoint = canvasPointToYardPoint(
      targetCanvasPoint,
      canvas
    );

    const directionMultiplier =
      attackingDirectionRef.current === "ltr" ? 1 : -1;

    const runForwardYards =
      (targetYardPoint.x - runnerYardPoint.x) * directionMultiplier;

    const ballForwardYards =
      (targetYardPoint.x - originYardPoint.x) * directionMultiplier;

    const lateralRunYards = Math.abs(
      targetYardPoint.y - runnerYardPoint.y
    );

    if (runForwardYards < MIN_THROUGH_FORWARD_RUN_YARDS) {
      return {
        valid: false,
        reason: "Target is not ahead of the runner"
      };
    }

    if (ballForwardYards < MIN_THROUGH_FORWARD_FROM_BALL_YARDS) {
      return {
        valid: false,
        reason: "Target is not forward enough from the ball"
      };
    }

    if (
      lateralRunYards >
      Math.max(10, runForwardYards * MAX_THROUGH_LATERAL_RUN_RATIO)
    ) {
      return {
        valid: false,
        reason: "Run is too lateral for a true through ball"
      };
    }

    return {
      valid: true,
      reason: "Forward space for runner"
    };
  }

  function findPlayerAtCanvasPoint(point: Point): Player | null {
    const canvas = canvasRef.current;
    if (!canvas || !showPlayersRef.current) return null;

    const hitRadius = 13;

    for (let i = playersRef.current.length - 1; i >= 0; i--) {
      const player = playersRef.current[i];
      const playerCanvasPoint = getPlayerCanvasPoint(player, canvas);

      const dx = point.x - playerCanvasPoint.x;
      const dy = point.y - playerCanvasPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= hitRadius) {
        return player;
      }
    }

    return null;
  }

  function calculateHoverPass(
    hoverPoint: Point,
    speed = speedRef.current,
    launch = launchRef.current
  ) {
    const canvas = canvasRef.current;
    const origin = originRef.current;

    if (!canvas || !origin) return null;

    const targetContext = getTargetContextFromCanvasPoint(hoverPoint, canvas);
    const target = targetContext.targetCanvasPoint;

    const distance = getDistanceYards(origin, target, canvas);

    const directionalModifier = getDirectionAwareModifier(
      origin,
      target,
      canvas
    );

    const baseCalc = calculatePassModel(
      distance,
      speed,
      launch,
      directionalModifier,
      targetContext.pressureContext
        ? {
            defenderSpacingYards:
              targetContext.pressureContext.defenderSpacingYards,
            defenderCloseDownTime:
              targetContext.pressureContext.defenderCloseDownTime
          }
        : undefined
    );

    const isThroughBall =
      passIntentModeRef.current === "through" &&
      showPlayersRef.current &&
      targetContext.receiverPlayerCanvasPoint &&
      targetContext.pressureContext;

    if (!isThroughBall || !targetContext.receiverPlayerCanvasPoint) {
      return baseCalc;
    }

    const runnerDistanceYards = getDistanceYards(
      targetContext.receiverPlayerCanvasPoint,
      target,
      canvas
    );

    const runnerTimeToTarget =
      DEFAULT_ATTACKER_REACTION_TIME +
      runnerDistanceYards / attackerRunSpeedRef.current;

    const earliestUsefulArrivalTime = Math.max(
      baseCalc.ballTravelTime,
      runnerTimeToTarget
    );

    const rawThroughBallWindow =
      baseCalc.defenderCloseDownTime -
      earliestUsefulArrivalTime +
      directionalModifier;

    const validity = getThroughBallValidity(
      origin,
      targetContext.receiverPlayerCanvasPoint,
      target,
      canvas
    );

    const throughBallWindow = validity.valid
      ? rawThroughBallWindow
      : rawThroughBallWindow - INVALID_THROUGH_BALL_PENALTY_SECONDS;

    const runnerAdvantageVsDefender =
      baseCalc.defenderCloseDownTime - runnerTimeToTarget;

    return {
      ...baseCalc,
      receiverTimeOnBall: throughBallWindow,
      runnerDistanceYards,
      runnerTimeToTarget,
      runnerAdvantageVsDefender,
      throughBallWindow,
      throughBallValid: validity.valid,
      throughBallReason: validity.reason
    };
  }

  function getBestThroughBallContext(
    hoverPoint: Point,
    canvas: HTMLCanvasElement
  ): BestThroughBallContext | null {
    const origin = originRef.current;

    if (
      !origin ||
      passIntentModeRef.current !== "through" ||
      !showPlayersRef.current
    ) {
      return null;
    }

    const hoverCalc = calculateHoverPass(hoverPoint);
    if (!hoverCalc) return null;

    const radiusPx = yardsToPixels(BEST_THROUGH_SEARCH_RADIUS_YARDS, canvas);
    const stepPx = yardsToPixels(BEST_THROUGH_SEARCH_STEP_YARDS, canvas);

    let best: BestThroughBallContext | null = null;
    let bestScore = -Infinity;

    for (let dx = -radiusPx; dx <= radiusPx; dx += stepPx) {
      for (let dy = -radiusPx; dy <= radiusPx; dy += stepPx) {
        const distanceFromHoverPx = Math.sqrt(dx * dx + dy * dy);
        if (distanceFromHoverPx > radiusPx) continue;

        const candidateTarget: Point = {
          x: clamp(hoverPoint.x + dx, 0, canvas.width),
          y: clamp(hoverPoint.y + dy, 0, canvas.height)
        };

        const candidateContext = getTargetContextFromCanvasPoint(
          candidateTarget,
          canvas
        );

        if (
          !candidateContext.receiverPlayerCanvasPoint ||
          !candidateContext.pressureContext
        ) {
          continue;
        }

        const validity = getThroughBallValidity(
          origin,
          candidateContext.receiverPlayerCanvasPoint,
          candidateTarget,
          canvas
        );

        if (!validity.valid) {
          continue;
        }

        const candidateCalc = calculateHoverPass(candidateTarget);

        if (
          !candidateCalc ||
          candidateCalc.throughBallWindow === undefined
        ) {
          continue;
        }

        const candidateDistancePenalty =
          pixelsToYards(distanceFromHoverPx, canvas) * 0.015;

        const candidateScore =
          candidateCalc.throughBallWindow - candidateDistancePenalty;

        if (candidateScore > bestScore) {
          bestScore = candidateScore;

          best = {
            targetCanvasPoint: candidateTarget,
            calculation: candidateCalc
          };
        }
      }
    }

    if (!best) return null;

    const improvement =
      best.calculation.receiverTimeOnBall - hoverCalc.receiverTimeOnBall;

    if (improvement < BEST_THROUGH_MIN_IMPROVEMENT_SECONDS) {
      return null;
    }

    return best;
  }

  function updateHoverInfo(
    speed = speedRef.current,
    launch = launchRef.current
  ) {
    const hover = lockedHoverRef.current ?? hoverRef.current;

    if (!hover) {
      setHoverInfo(null);
      return;
    }

    setHoverInfo(calculateHoverPass(hover, speed, launch));
  }

  function restartRingTransition() {
    if (!originRef.current) return;

    previousOriginRef.current = { ...originRef.current };
    ringTransitionStartRef.current = performance.now();
  }

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    if (speedRef.current === ballSpeed) return;

    speedRef.current = ballSpeed;
    restartRingTransition();
    updateHoverInfo(ballSpeed, launchRef.current);
  }, [ballSpeed]);

  useEffect(() => {
    if (launchRef.current === launchElevation) return;

    launchRef.current = launchElevation;
    restartRingTransition();
    updateHoverInfo(speedRef.current, launchElevation);
  }, [launchElevation]);

  useEffect(() => {
    attackerRunSpeedRef.current = attackerRunSpeed;
    updateHoverInfo();
  }, [attackerRunSpeed]);

  useEffect(() => {
    defenderSpeedRef.current = defenderSpeed;
    updateHoverInfo();
  }, [defenderSpeed]);

  useEffect(() => {
    attackingDirectionRef.current = attackingDirection;
    lockedHoverRef.current = null;
    updateHoverInfo();
  }, [attackingDirection]);

  useEffect(() => {
    showZonesRef.current = showZones;
  }, [showZones]);

  useEffect(() => {
    showPlayersRef.current = showPlayers;

    if (!showPlayers) {
      selectedRunnerIdRef.current = null;
      lockedHoverRef.current = null;
    }

    updateHoverInfo();
  }, [showPlayers]);

  useEffect(() => {
    passIntentModeRef.current = passIntentMode;

    if (passIntentMode !== "through") {
      selectedRunnerIdRef.current = null;
      lockedHoverRef.current = null;
    }

    updateHoverInfo();
  }, [passIntentMode]);

  useEffect(() => {
    originRef.current = null;
    previousOriginRef.current = null;
    hoverRef.current = null;
    lockedHoverRef.current = null;
    selectedRunnerIdRef.current = null;
    draggingPlayerRef.current = null;
    suppressNextClickRef.current = false;

    setHasOrigin(false);
    setHoverInfo(null);
  }, [resetKey]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;

      selectedRunnerIdRef.current = null;
      lockedHoverRef.current = null;
      updateHoverInfo();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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
      const scale = getScale(canvas);

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

      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.68)";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";

      if (attackingDirectionRef.current === "ltr") {
        ctx.fillText("ATTACK →", w / 2, 18);
      } else {
        ctx.fillText("← ATTACK", w / 2, 18);
      }

      ctx.restore();
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

    function drawPlayers() {
      if (!showPlayersRef.current) return;

      ctx.save();

      const hover = lockedHoverRef.current ?? hoverRef.current;
      const targetContext = hover
        ? getTargetContextFromCanvasPoint(hover, canvas)
        : null;

      for (const player of playersRef.current) {
        const point = getPlayerCanvasPoint(player, canvas);

        const isAttacker = player.team === "attacker";
        const isReceiver =
          targetContext?.receiverPlayer?.id === player.id;
        const isSelectedRunner =
          selectedRunnerIdRef.current === player.id;

        const fill = isAttacker ? "#38bdf8" : "#fb7185";

        const stroke = isSelectedRunner
          ? "#facc15"
          : isReceiver
          ? "#fef08a"
          : isAttacker
          ? "#dff6ff"
          : "#ffe4e6";

        const radius = isSelectedRunner ? 13 : isReceiver ? 12 : 10;

        ctx.beginPath();
        ctx.arc(point.x + 2, point.y + 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();

        ctx.lineWidth = isSelectedRunner ? 4 : isReceiver ? 3 : 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();

        ctx.font = "bold 10px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#111";
        ctx.fillText(player.label, point.x, point.y);

        if (isSelectedRunner) {
          drawLabel("Selected Runner", point.x, point.y - 18, "#fde68a");
        }
      }

      ctx.restore();
    }

    function drawDirectionalRingLabel(
      distanceYards: number,
      origin: Point,
      target: Point
    ) {
      if (!pointInsideField(target.x, target.y)) return;

      const directionalModifier = getDirectionAwareModifier(
        origin,
        target,
        canvas
      );

      const pressureContext = getDefenderPressureContextForCanvasPoint(
        target,
        canvas
      );

      const calc = calculatePassModel(
        distanceYards,
        speedRef.current,
        launchRef.current,
        directionalModifier,
        pressureContext
          ? {
              defenderSpacingYards: pressureContext.defenderSpacingYards,
              defenderCloseDownTime: pressureContext.defenderCloseDownTime
            }
          : undefined
      );

      const colors = getPressureColor(calc);

      drawLabel(
        getRingLabel(distanceYards, calc),
        target.x,
        target.y,
        colors.text
      );
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
        const baseCalc = calculatePassModel(
          r,
          speedRef.current,
          launchRef.current
        );

        const colors = getPressureColor(baseCalc);
        const radiusPx = yardsToPixels(r, canvas) * radiusScale;

        ctx.save();

        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1.2;

        if (baseCalc.status !== "realistic") {
          ctx.setLineDash([6, 6]);
        }

        ctx.beginPath();
        ctx.arc(origin.x, origin.y, radiusPx, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([]);

        drawDirectionalRingLabel(r, origin, {
          x: origin.x + radiusPx,
          y: origin.y
        });

        drawDirectionalRingLabel(r, origin, {
          x: origin.x - radiusPx,
          y: origin.y
        });

        drawDirectionalRingLabel(r, origin, {
          x: origin.x,
          y: origin.y - radiusPx
        });

        drawDirectionalRingLabel(r, origin, {
          x: origin.x,
          y: origin.y + radiusPx
        });

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
      const hover = lockedHoverRef.current ?? hoverRef.current;
      const isLocked = lockedHoverRef.current !== null;

      if (!origin || !hover) return;

      const targetContext = getTargetContextFromCanvasPoint(hover, canvas);
      const target = targetContext.targetCanvasPoint;

      const calc = calculateHoverPass(hover);
      if (!calc) return;

      const colors = getPressureColor(calc);

      ctx.save();

      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1.8;
      ctx.setLineDash(calc.status === "realistic" ? [6, 6] : [3, 6]);

      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();

      ctx.setLineDash([]);

      if (
        passIntentModeRef.current === "through" &&
        targetContext.receiverPlayerCanvasPoint
      ) {
        ctx.strokeStyle = "rgba(56, 189, 248, 0.8)";
        ctx.lineWidth = 1.7;
        ctx.setLineDash([7, 5]);

        ctx.beginPath();
        ctx.moveTo(
          targetContext.receiverPlayerCanvasPoint.x,
          targetContext.receiverPlayerCanvasPoint.y
        );
        ctx.lineTo(target.x, target.y);
        ctx.stroke();

        ctx.setLineDash([]);
      }

      if (targetContext.pressureContext) {
        ctx.strokeStyle = "rgba(255, 100, 100, 0.8)";
        ctx.lineWidth = 1.7;
        ctx.setLineDash([4, 6]);

        ctx.beginPath();
        ctx.moveTo(
          targetContext.pressureContext.defenderCanvasPoint.x,
          targetContext.pressureContext.defenderCanvasPoint.y
        );
        ctx.lineTo(target.x, target.y);
        ctx.stroke();

        ctx.setLineDash([]);
      }

      const midX = (origin.x + target.x) / 2;
      const midY = (origin.y + target.y) / 2;

      const label =
        passIntentModeRef.current === "through"
          ? calc.throughBallValid === false
            ? "Not a forward through ball"
            : `Window: ${formatSignedTime(calc.receiverTimeOnBall)}`
          : `Receiver: ${formatSignedTime(calc.receiverTimeOnBall)}`;

      drawLabel(
        label,
        midX,
        midY - 10,
        calc.throughBallValid === false ? "#fca5a5" : colors.text
      );

      if (passIntentModeRef.current === "through") {
        drawLabel(
          isLocked ? "Locked Through Space" : "Through Space",
          target.x,
          target.y - 16,
          isLocked ? "#fde68a" : "#dbeafe"
        );

        if (isLocked) {
          ctx.save();
          ctx.strokeStyle = "rgba(250, 204, 21, 0.95)";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(target.x, target.y, 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        if (calc.throughBallValid === false && calc.throughBallReason) {
          drawLabel(
            calc.throughBallReason,
            target.x,
            target.y + 18,
            "#fca5a5"
          );
        } else if (calc.runnerTimeToTarget !== undefined) {
          drawLabel(
            `Runner: ${calc.runnerTimeToTarget.toFixed(1)}s`,
            target.x,
            target.y + 18,
            "#bfdbfe"
          );
        }

        if (!isLocked) {
          const bestThroughBall = getBestThroughBallContext(hover, canvas);

          if (bestThroughBall) {
            const bestTarget = bestThroughBall.targetCanvasPoint;
            const bestCalc = bestThroughBall.calculation;

            ctx.save();

            ctx.strokeStyle = "rgba(250, 204, 21, 0.95)";
            ctx.fillStyle = "rgba(250, 204, 21, 0.18)";
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.arc(bestTarget.x, bestTarget.y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(origin.x, origin.y);
            ctx.lineTo(bestTarget.x, bestTarget.y);
            ctx.stroke();

            ctx.setLineDash([]);

            drawLabel(
              `Best: ${formatSignedTime(bestCalc.receiverTimeOnBall)}`,
              bestTarget.x,
              bestTarget.y - 22,
              "#fde68a"
            );

            ctx.restore();
          }
        }
      }

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
      drawPlayers();
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

    function handleMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;

      const point = getMousePosition(e);

      const player = findPlayerAtCanvasPoint(point);

      if (!player) return;

      const playerCanvasPoint = getPlayerCanvasPoint(player, canvas);

      draggingPlayerRef.current = {
        id: player.id,
        offsetX: point.x - playerCanvasPoint.x,
        offsetY: point.y - playerCanvasPoint.y,
        startX: point.x,
        startY: point.y,
        moved: false
      };

      suppressNextClickRef.current = true;
      canvas.style.cursor = "grabbing";
    }

    function handleClick(e: MouseEvent) {
      if (e.button !== 0) return;

      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }

      const point = getMousePosition(e);

      if (originRef.current) {
        previousOriginRef.current = { ...originRef.current };
      } else {
        previousOriginRef.current = null;
      }

      originRef.current = point;
      hoverRef.current = null;
      lockedHoverRef.current = null;

      ringTransitionStartRef.current = performance.now();

      setHasOrigin(true);
      setHoverInfo(null);
    }

    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();

      if (
        !originRef.current ||
        passIntentModeRef.current !== "through"
      ) {
        return;
      }

      const point = getMousePosition(e);

      lockedHoverRef.current = point;
      hoverRef.current = point;

      setHoverInfo(calculateHoverPass(point));
    }

    function handleMouseMove(e: MouseEvent) {
      const point = getMousePosition(e);

      const draggingPlayer = draggingPlayerRef.current;

      if (draggingPlayer) {
        const movementDistance = Math.sqrt(
          Math.pow(point.x - draggingPlayer.startX, 2) +
            Math.pow(point.y - draggingPlayer.startY, 2)
        );

        if (movementDistance > 4) {
          draggingPlayer.moved = true;
        }

        const adjustedCanvasPoint = {
          x: point.x - draggingPlayer.offsetX,
          y: point.y - draggingPlayer.offsetY
        };

        const nextYardPoint = canvasPointToYardPoint(
          adjustedCanvasPoint,
          canvas
        );

        setPlayers((currentPlayers) => {
          const nextPlayers = currentPlayers.map((player) =>
            player.id === draggingPlayer.id
              ? {
                  ...player,
                  x: nextYardPoint.x,
                  y: nextYardPoint.y
                }
              : player
          );

          playersRef.current = nextPlayers;
          return nextPlayers;
        });

        updateHoverInfo();
        return;
      }

      const hoveredPlayer = findPlayerAtCanvasPoint(point);
      canvas.style.cursor = hoveredPlayer ? "grab" : "crosshair";

      if (lockedHoverRef.current) {
        return;
      }

      hoverRef.current = point;

      const origin = originRef.current;
      if (!origin) {
        setHoverInfo(null);
        return;
      }

      setHoverInfo(calculateHoverPass(point));
    }

    function handleMouseUp() {
      const draggingPlayer = draggingPlayerRef.current;

      if (!draggingPlayer) return;

      const player = getPlayerById(draggingPlayer.id);

      if (
        passIntentModeRef.current === "through" &&
        player?.team === "attacker" &&
        !draggingPlayer.moved
      ) {
        selectedRunnerIdRef.current =
          selectedRunnerIdRef.current === player.id ? null : player.id;

        lockedHoverRef.current = null;
      }

      draggingPlayerRef.current = null;
      canvas.style.cursor = "default";

      updateHoverInfo();

      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 0);
    }

    function handleMouseLeave() {
      draggingPlayerRef.current = null;
      canvas.style.cursor = "default";

      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 0);

      if (lockedHoverRef.current) {
        return;
      }

      hoverRef.current = null;
      setHoverInfo(null);
    }

    resize();

    window.addEventListener("resize", resize);
    window.addEventListener("mouseup", handleMouseUp);

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("contextmenu", handleContextMenu);

    loop();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mouseup", handleMouseUp);

      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("contextmenu", handleContextMenu);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
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
  );
}