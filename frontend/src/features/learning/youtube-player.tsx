import { useEffect, useRef } from "react";

type YTPlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

type YTNamespace = {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number; target: YTPlayer }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { UNSTARTED: number; ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoader: Promise<YTNamespace> | null = null;

function loadYoutubeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube player is only available in the browser."));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiLoader) return apiLoader;
  apiLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-yt-iframe-api="true"]');
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube player API did not initialize."));
    };
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.ytIframeApi = "true";
      script.onerror = () => {
        apiLoader = null;
        reject(new Error("Could not load the YouTube player."));
      };
      document.head.appendChild(script);
    }
    if (window.YT?.Player) resolve(window.YT);
  });
  return apiLoader;
}

export type LessonHeartbeat = {
  currentTime: number;
  duration: number;
  playing: boolean;
  ended: boolean;
  range: [number, number] | null;
};

export function YoutubeLessonPlayer({
  videoId,
  startSeconds = 0,
  title,
  onHeartbeat,
  onUnavailable,
}: {
  videoId: string;
  startSeconds?: number;
  title: string;
  onHeartbeat: (payload: LessonHeartbeat) => void;
  onUnavailable?: (message: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const lastSampleRef = useRef<number | null>(null);
  const onHeartbeatRef = useRef(onHeartbeat);
  const onUnavailableRef = useRef(onUnavailable);
  const startRef = useRef(startSeconds);

  useEffect(() => {
    onHeartbeatRef.current = onHeartbeat;
  }, [onHeartbeat]);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);
  useEffect(() => {
    startRef.current = startSeconds;
  }, [startSeconds]);

  useEffect(() => {
    let cancelled = false;
    let poll: number | null = null;
    const host = hostRef.current;
    if (!host || !videoId) return undefined;

    function emit(player: YTPlayer, playing: boolean, ended: boolean) {
      let current = 0;
      let duration = 0;
      try {
        current = Number(player.getCurrentTime()) || 0;
        duration = Number(player.getDuration()) || 0;
      } catch {
        return;
      }
      const previous = lastSampleRef.current;
      let range: [number, number] | null = null;
      if (playing && previous != null) {
        const delta = current - previous;
        if (delta > 0 && delta <= 2.8) {
          range = [previous, current];
        }
      }
      if (playing || ended) lastSampleRef.current = current;
      else lastSampleRef.current = current;
      onHeartbeatRef.current({ currentTime: current, duration, playing, ended, range });
    }

    void loadYoutubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        hostRef.current.replaceChildren();
        const mount = document.createElement("div");
        hostRef.current.appendChild(mount);
        const start = Math.max(0, Math.floor(startRef.current || 0));
        let player: YTPlayer;
        try {
          player = new YT.Player(mount, {
            videoId,
            host: "https://www.youtube-nocookie.com",
            playerVars: {
              autoplay: 0,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
              origin: window.location.origin,
              start,
              enablejsapi: 1,
            },
            events: {
              onReady: (event) => {
                if (cancelled) return;
                if (start > 1) {
                  try {
                    event.target.seekTo(start, true);
                  } catch {
                    /* player may reject seek before data loads */
                  }
                }
                lastSampleRef.current = start;
                emit(event.target, false, false);
              },
              onStateChange: (event) => {
                if (cancelled) return;
                const playing = event.data === YT.PlayerState.PLAYING;
                const ended = event.data === YT.PlayerState.ENDED;
                if (event.data === YT.PlayerState.PAUSED || ended) {
                  emit(event.target, false, ended);
                }
                if (playing) {
                  lastSampleRef.current = Number(event.target.getCurrentTime()) || lastSampleRef.current;
                }
              },
              onError: () => {
                onUnavailableRef.current?.("This video cannot be played here. Open it on YouTube instead.");
              },
            },
          });
        } catch {
          onUnavailableRef.current?.("This video cannot be played here. Open it on YouTube instead.");
          return;
        }
        playerRef.current = player;
        poll = window.setInterval(() => {
          const current = playerRef.current;
          if (!current || cancelled) return;
          try {
            if (current.getPlayerState() === YT.PlayerState.PLAYING) {
              emit(current, true, false);
            }
          } catch {
            /* destroyed */
          }
        }, 1000);
      })
      .catch((error: Error) => {
        if (!cancelled) onUnavailableRef.current?.(error.message || "YouTube player is unavailable.");
      });

    return () => {
      cancelled = true;
      if (poll != null) window.clearInterval(poll);
      const player = playerRef.current;
      playerRef.current = null;
      lastSampleRef.current = null;
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
    };
  }, [videoId]);

  return <div ref={hostRef} className="lp-player-mount" role="group" aria-label={title} />;
}
