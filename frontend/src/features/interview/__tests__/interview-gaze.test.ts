import { describe, expect, it } from "vitest";
import {
  classifyFaceLooking,
  estimatePresenceBoxFromImageData,
  isLikelySkinTone,
  liveGazeCoachMessage,
  summarizeGazeSamples,
} from "../interview-gaze";

describe("classifyFaceLooking", () => {
  it("marks centered large face as looking", () => {
    const result = classifyFaceLooking(
      { x: 120, y: 80, width: 160, height: 200 },
      400,
      400,
    );
    expect(result.state).toBe("looking");
    expect(result.center_score).toBeGreaterThan(0.35);
  });

  it("marks missing face as no_face", () => {
    expect(classifyFaceLooking(null, 400, 400).state).toBe("no_face");
  });

  it("marks off-center face as away", () => {
    const result = classifyFaceLooking(
      { x: 0, y: 0, width: 80, height: 80 },
      400,
      400,
    );
    expect(result.state).toBe("away");
  });
});

describe("canvas presence fallback", () => {
  it("detects skin-like tones used by presence heuristic", () => {
    expect(isLikelySkinTone(180, 120, 90)).toBe(true);
    expect(isLikelySkinTone(10, 10, 10)).toBe(false);
    expect(isLikelySkinTone(80, 140, 200)).toBe(false);
  });

  it("returns null for empty / gray frames (no invented face)", () => {
    const width = 32;
    const height = 32;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 40;
      data[i + 1] = 40;
      data[i + 2] = 40;
      data[i + 3] = 255;
    }
    expect(estimatePresenceBoxFromImageData(data, width, height)).toBeNull();
  });

  it("finds a centered skin mass and classifies as looking", () => {
    const width = 64;
    const height = 64;
    const data = new Uint8ClampedArray(width * height * 4);
    // Dark background
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 20;
      data[i + 1] = 20;
      data[i + 2] = 20;
      data[i + 3] = 255;
    }
    // Centered skin blob
    for (let y = 20; y < 44; y += 1) {
      for (let x = 20; x < 44; x += 1) {
        const i = (y * width + x) * 4;
        data[i] = 190;
        data[i + 1] = 130;
        data[i + 2] = 100;
        data[i + 3] = 255;
      }
    }
    const box = estimatePresenceBoxFromImageData(data, width, height);
    expect(box).not.toBeNull();
    const classified = classifyFaceLooking(box, width, height);
    expect(classified.state).toBe("looking");
  });
});

describe("summarizeGazeSamples", () => {
  it("scores strong eye contact when mostly looking", () => {
    const samples = Array.from({ length: 10 }, (_, i) => ({
      at: i,
      state: "looking" as const,
    }));
    const summary = summarizeGazeSamples(samples, { detector: "face_detector" });
    expect(summary.eye_contact_score).toBe(100);
    expect(summary.band).toBe("strong");
    expect(summary.looking_seconds).toBeGreaterThan(0);
  });

  it("coaches when mostly looking away", () => {
    const samples = Array.from({ length: 10 }, (_, i) => ({
      at: i,
      state: (i < 2 ? "looking" : "away") as "looking" | "away",
    }));
    const summary = summarizeGazeSamples(samples, { detector: "face_detector" });
    expect(summary.band).toBe("weak");
    expect(summary.coach_prompt).toMatch(/camera/i);
  });

  it("scores canvas_presence samples the same way (fallback path)", () => {
    const samples = Array.from({ length: 8 }, (_, i) => ({
      at: i,
      state: "looking" as const,
    }));
    const summary = summarizeGazeSamples(samples, { detector: "canvas_presence" });
    expect(summary.eye_contact_score).toBe(100);
    expect(summary.detector).toBe("canvas_presence");
    expect(summary.notes.toLowerCase()).toMatch(/presence/);
  });
});

describe("liveGazeCoachMessage", () => {
  it("prompts after an away streak", () => {
    const msg = liveGazeCoachMessage(["looking", "away", "away", "away", "away"]);
    expect(msg).toMatch(/Look into the camera/i);
  });

  it("stays quiet when recently looking", () => {
    expect(liveGazeCoachMessage(["away", "away", "looking", "looking"])).toBeNull();
  });
});
