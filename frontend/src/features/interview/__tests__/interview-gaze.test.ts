import { describe, expect, it } from "vitest";
import {
  classifyFaceLooking,
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
