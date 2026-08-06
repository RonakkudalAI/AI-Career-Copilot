import { describe, expect, it } from "vitest";
import {
  extractSpeechTranscript,
  mediaReadyMessage,
  mergeSpokenAnswer,
  nextActiveIndex,
  phaseAfterQuestionSpoken,
  sessionMediaFlags,
  shouldAutoSubmitOnSilence,
} from "../interview-voice";

describe("extractSpeechTranscript", () => {
  it("shows interim speech while the user is still talking", () => {
    const results = {
      length: 1,
      0: { isFinal: false, 0: { transcript: "I led a team of " } },
    };
    const { finalChunk, interimText } = extractSpeechTranscript(results, 0);
    expect(finalChunk).toBe("");
    expect(interimText).toBe("I led a team of");
  });

  it("captures finalized phrases for the answer box", () => {
    const results = {
      length: 2,
      0: { isFinal: true, 0: { transcript: "I led a team of five engineers." } },
      1: { isFinal: false, 0: { transcript: "We shipped " } },
    };
    const { finalChunk, interimText } = extractSpeechTranscript(results, 0);
    expect(finalChunk).toContain("five engineers");
    expect(interimText).toBe("We shipped");
  });

  it("does not crash on empty recognition payloads (voice not taking regression)", () => {
    expect(extractSpeechTranscript(null)).toEqual({ finalChunk: "", interimText: "" });
    expect(extractSpeechTranscript({ length: 0 })).toEqual({ finalChunk: "", interimText: "" });
  });
});

describe("mergeSpokenAnswer", () => {
  it("appends finals and keeps interim visible in display only", () => {
    const first = mergeSpokenAnswer("", "Hello world.", "");
    expect(first.committed).toBe("Hello world.");
    expect(first.display).toBe("Hello world.");

    const second = mergeSpokenAnswer(first.committed, "", "and more");
    expect(second.committed).toBe("Hello world.");
    expect(second.display).toBe("Hello world. and more");

    const third = mergeSpokenAnswer(second.committed, "and more things.", "");
    expect(third.committed).toBe("Hello world. and more things.");
    expect(third.display).toBe("Hello world. and more things.");
  });
});

describe("turn sequencing", () => {
  it("starts listening automatically after the question is spoken when mic is on", () => {
    expect(phaseAfterQuestionSpoken(true, true)).toBe("listening");
    expect(phaseAfterQuestionSpoken(false, true)).toBe("idle");
    expect(phaseAfterQuestionSpoken(true, false)).toBe("idle");
  });

  it("auto-submits only after silence with a committed answer", () => {
    expect(
      shouldAutoSubmitOnSilence({
        phase: "listening",
        committedAnswer: "My answer",
        msSinceLastSpeech: 2500,
        silenceMs: 2200,
      }),
    ).toBe(true);
    expect(
      shouldAutoSubmitOnSilence({
        phase: "listening",
        committedAnswer: "",
        msSinceLastSpeech: 5000,
        silenceMs: 2200,
      }),
    ).toBe(false);
    expect(
      shouldAutoSubmitOnSilence({
        phase: "asking",
        committedAnswer: "My answer",
        msSinceLastSpeech: 5000,
        silenceMs: 2200,
      }),
    ).toBe(false);
  });

  it("advances questions back-and-forth until the last one", () => {
    expect(nextActiveIndex(0, 3)).toBe(1);
    expect(nextActiveIndex(1, 3)).toBe(2);
    expect(nextActiveIndex(2, 3)).toBe(null);
  });
});

describe("session media flags", () => {
  it("defaults missing flags to enabled so voice UI is not silently dead", () => {
    expect(sessionMediaFlags({})).toEqual({ camera: true, microphone: true });
    expect(sessionMediaFlags({ camera_enabled: false, microphone_enabled: false })).toEqual({
      camera: false,
      microphone: false,
    });
  });

  it("describes ready media accurately", () => {
    expect(mediaReadyMessage(true, true)).toMatch(/Camera and microphone/);
    expect(mediaReadyMessage(true, false)).toBe("Camera is ready.");
    expect(mediaReadyMessage(false, true)).toBe("Microphone is ready.");
  });
});
