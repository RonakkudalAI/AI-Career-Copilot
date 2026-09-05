import { describe, expect, it } from "vitest";
import {
  CANONICAL_APP_ORIGIN,
  authCallbackUrl,
  isLoopbackOrigin,
  publicAppOrigin,
} from "../public-origin";

describe("publicAppOrigin", () => {
  it("never uses loopback for auth emails", () => {
    expect(isLoopbackOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isLoopbackOrigin("http://localhost:3000")).toBe(true);
    expect(
      publicAppOrigin({
        envOrigin: "",
        currentOrigin: "http://127.0.0.1:3000",
      }),
    ).toBe(CANONICAL_APP_ORIGIN);
  });

  it("keeps a real deployed origin", () => {
    expect(
      publicAppOrigin({
        envOrigin: "",
        currentOrigin: "https://career-copilot-neon.vercel.app",
      }),
    ).toBe("https://career-copilot-neon.vercel.app");
  });

  it("prefers a non-loopback env origin", () => {
    expect(
      publicAppOrigin({
        envOrigin: "https://careercopilotai.vercel.app",
        currentOrigin: "http://127.0.0.1:3000",
      }),
    ).toBe("https://careercopilotai.vercel.app");
  });

  it("builds a callback URL on the public origin", () => {
    const url = authCallbackUrl("/onboarding", {
      envOrigin: "",
      currentOrigin: "http://localhost:3000",
    });
    expect(url.startsWith(CANONICAL_APP_ORIGIN)).toBe(true);
    expect(url).toContain("/auth/callback?next=%2Fonboarding");
    expect(url).not.toContain("127.0.0.1");
  });
});
