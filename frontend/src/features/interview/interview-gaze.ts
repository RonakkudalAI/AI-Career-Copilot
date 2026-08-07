/**
 * Camera presence / eye-contact coaching helpers (pure + optional FaceDetector).
 * Does not invent measurements — only aggregates samples the detector actually produced.
 */

export type GazeSampleState = "looking" | "away" | "no_face" | "unavailable";

export type GazeSample = {
  at: number;
  state: GazeSampleState;
  /** 0–1 how centered the face is when looking (optional). */
  center_score?: number;
};

export type GazeSessionSummary = {
  sample_count: number;
  looking_samples: number;
  away_samples: number;
  no_face_samples: number;
  unavailable_samples: number;
  /** Fraction of usable samples where candidate faces the camera. */
  looking_ratio: number | null;
  looking_seconds: number;
  away_seconds: number;
  total_tracked_seconds: number;
  /** 0–100 coaching score from looking_ratio (null if not measurable). */
  eye_contact_score: number | null;
  band: "unknown" | "strong" | "mixed" | "weak";
  notes: string;
  coach_prompt: string | null;
  detector: "face_detector" | "unavailable";
};

export type FaceBoxLike = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Browser Shape Detection API (Chrome) — optional. */
export type FaceDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

export function createFaceDetector(): FaceDetectorLike | null {
  if (typeof window === "undefined") return null;
  const Ctor = (
    window as Window & {
      FaceDetector?: new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorLike;
    }
  ).FaceDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ fastMode: true, maxDetectedFaces: 1 });
  } catch {
    return null;
  }
}

/**
 * Classify a detected face box as looking-at-camera vs looking-away.
 * Heuristic: face present and roughly centered + large enough ≈ facing the lens.
 * True pupil gaze is not available in-browser without heavy models.
 */
export function classifyFaceLooking(
  box: FaceBoxLike | null | undefined,
  frameWidth: number,
  frameHeight: number,
): { state: GazeSampleState; center_score: number } {
  if (!box || frameWidth <= 0 || frameHeight <= 0) {
    return { state: "no_face", center_score: 0 };
  }
  const area = Math.max(0, box.width) * Math.max(0, box.height);
  const frameArea = frameWidth * frameHeight;
  const areaRatio = frameArea > 0 ? area / frameArea : 0;
  // Too small / far away — treat as weak engagement, not centered eye contact.
  if (areaRatio < 0.02) {
    return { state: "away", center_score: 0 };
  }

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const nx = Math.abs(cx / frameWidth - 0.5) * 2; // 0 center → 1 edge
  const ny = Math.abs(cy / frameHeight - 0.5) * 2;
  const center_score = Math.max(0, Math.min(1, 1 - Math.max(nx, ny)));

  // Centered enough → looking; far off-center → looking away from camera.
  if (center_score >= 0.35 && areaRatio >= 0.03) {
    return { state: "looking", center_score };
  }
  return { state: "away", center_score };
}

export function summarizeGazeSamples(
  samples: GazeSample[],
  options?: {
    sampleIntervalMs?: number;
    detector?: "face_detector" | "unavailable";
  },
): GazeSessionSummary {
  const sampleIntervalMs = options?.sampleIntervalMs ?? 400;
  const detector = options?.detector ?? "face_detector";
  if (!samples.length || detector === "unavailable") {
    return {
      sample_count: samples.length,
      looking_samples: 0,
      away_samples: 0,
      no_face_samples: 0,
      unavailable_samples: samples.filter((s) => s.state === "unavailable").length,
      looking_ratio: null,
      looking_seconds: 0,
      away_seconds: 0,
      total_tracked_seconds: 0,
      eye_contact_score: null,
      band: "unknown",
      notes:
        detector === "unavailable"
          ? "Camera gaze coaching needs a browser with FaceDetector (Chrome/Edge). Scores still use your spoken answers."
          : "No gaze samples were recorded for this answer.",
      coach_prompt: null,
      detector,
    };
  }

  let looking = 0;
  let away = 0;
  let noFace = 0;
  let unavailable = 0;
  for (const sample of samples) {
    if (sample.state === "looking") looking += 1;
    else if (sample.state === "away") away += 1;
    else if (sample.state === "no_face") noFace += 1;
    else unavailable += 1;
  }

  const usable = looking + away + noFace;
  const intervalSec = Math.max(0.05, sampleIntervalMs / 1000);
  const looking_seconds = round1(looking * intervalSec);
  const away_seconds = round1((away + noFace) * intervalSec);
  const total_tracked_seconds = round1(usable * intervalSec);
  const looking_ratio = usable > 0 ? round4(looking / usable) : null;

  let eye_contact_score: number | null = null;
  let band: GazeSessionSummary["band"] = "unknown";
  let notes = "Eye contact could not be scored.";
  let coach_prompt: string | null = null;

  if (looking_ratio != null && usable >= 3) {
    eye_contact_score = Math.max(0, Math.min(100, Math.round(looking_ratio * 100)));
    if (looking_ratio >= 0.7) {
      band = "strong";
      notes = `Strong camera presence (~${eye_contact_score}% of the answer facing the lens).`;
      coach_prompt = null;
    } else if (looking_ratio >= 0.4) {
      band = "mixed";
      notes = `Mixed eye contact (~${eye_contact_score}%). Keep your face framed in the camera while you speak.`;
      coach_prompt = "Look into the camera — interviewers read confidence from eye contact.";
    } else {
      band = "weak";
      notes = `Low camera presence (~${eye_contact_score}%). Looking away while answering is best avoided.`;
      coach_prompt = "Look into the camera while you answer — avoid looking down or off-screen.";
    }
  } else if (usable > 0) {
    notes = "Not enough gaze samples yet to score eye contact reliably.";
  }

  return {
    sample_count: samples.length,
    looking_samples: looking,
    away_samples: away + noFace,
    no_face_samples: noFace,
    unavailable_samples: unavailable,
    looking_ratio,
    looking_seconds,
    away_seconds,
    total_tracked_seconds,
    eye_contact_score,
    band,
    notes,
    coach_prompt,
    detector,
  };
}

/** Live coach line when the candidate looks away for several consecutive samples. */
export function liveGazeCoachMessage(
  recentStates: GazeSampleState[],
  options?: { awayStreakNeeded?: number },
): string | null {
  const awayStreakNeeded = options?.awayStreakNeeded ?? 4;
  if (recentStates.length < awayStreakNeeded) return null;
  const tail = recentStates.slice(-awayStreakNeeded);
  const allAway = tail.every((s) => s === "away" || s === "no_face");
  if (!allAway) return null;
  if (tail.every((s) => s === "no_face")) {
    return "We cannot see your face — sit in frame and look into the camera.";
  }
  return "Look into the camera while you answer — avoid looking away from the interviewer.";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Merge multiple answer-level gaze summaries for a session report. */
export function aggregateGazeSummaries(
  parts: Array<Partial<GazeSessionSummary> | null | undefined>,
): GazeSessionSummary {
  let looking = 0;
  let away = 0;
  let noFace = 0;
  let unavailable = 0;
  let sampleCount = 0;
  let detector: "face_detector" | "unavailable" = "unavailable";
  for (const part of parts) {
    if (!part) continue;
    if (part.detector === "face_detector") detector = "face_detector";
    looking += Number(part.looking_samples || 0);
    // Prefer explicit no_face; remainder of away_samples treated as off-camera.
    const partNoFace = Number(part.no_face_samples || 0);
    const partAway = Math.max(0, Number(part.away_samples || 0) - partNoFace);
    away += partAway;
    noFace += partNoFace;
    unavailable += Number(part.unavailable_samples || 0);
    sampleCount += Number(part.sample_count || 0);
  }
  const samples: GazeSample[] = [];
  for (let i = 0; i < looking; i += 1) samples.push({ at: i, state: "looking" });
  for (let i = 0; i < away; i += 1) samples.push({ at: i, state: "away" });
  for (let i = 0; i < noFace; i += 1) samples.push({ at: i, state: "no_face" });
  for (let i = 0; i < unavailable; i += 1) samples.push({ at: i, state: "unavailable" });
  const summary = summarizeGazeSamples(samples, { sampleIntervalMs: 400, detector });
  if (sampleCount > 0 && summary.sample_count === 0) {
    return { ...summary, sample_count: sampleCount };
  }
  return summary;
}
