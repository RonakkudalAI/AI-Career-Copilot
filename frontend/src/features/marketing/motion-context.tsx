import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface MotionContextType {
  isMotionPaused: boolean;
  toggleMotion: () => void;
  setMotionPaused: (paused: boolean) => void;
}

export const MotionContext = createContext<MotionContextType>({
  isMotionPaused: false,
  toggleMotion: () => {},
  setMotionPaused: () => {},
});

export function MotionProvider({ children }: { children: ReactNode }) {
  const [isMotionPaused, setIsMotionPaused] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem("career-copilot-motion-paused");
    if (stored !== null) return stored === "true";
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (e: MediaQueryListEvent) => {
      if (window.localStorage.getItem("career-copilot-motion-paused") === null) {
        setIsMotionPaused(e.matches);
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const toggleMotion = () => {
    setIsMotionPaused((prev) => {
      const next = !prev;
      window.localStorage.setItem("career-copilot-motion-paused", String(next));
      return next;
    });
  };

  const setMotionPaused = (paused: boolean) => {
    setIsMotionPaused(paused);
    window.localStorage.setItem("career-copilot-motion-paused", String(paused));
  };

  return (
    <MotionContext.Provider value={{ isMotionPaused, toggleMotion, setMotionPaused }}>
      {children}
    </MotionContext.Provider>
  );
}

export function useMotion() {
  return useContext(MotionContext);
}
