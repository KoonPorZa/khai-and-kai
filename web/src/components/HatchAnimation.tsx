import { useEffect, useRef, useState, type ReactNode } from "react";
import egg from "../assets/egg/egg.svg";
import crack1 from "../assets/egg/egg-crack-1.svg";
import crack2 from "../assets/egg/egg-crack-2.svg";
import shellTop from "../assets/egg/shell-top.svg";
import shellBottom from "../assets/egg/shell-bottom.svg";
import glow from "../assets/egg/glow.svg";

/**
 * wait   - the egg wobbles while the reveal block is mined
 * crack  - the reveal transaction is in flight, cracks appear
 * burst  - the shell halves separate, the chicken rises with a glow
 * `instant` starts in the final pose (hatch already finished when the page opened), without motion.
 */
export type HatchPhase = "wait" | "crack" | "burst";
type Stage = "wait" | "crack1" | "crack2" | "burst" | "done";

const reduce = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One timeline: stage advances by timers started when `phase` changes. */
export function HatchAnimation({ phase, instant, children, onSettled, label }: { phase: HatchPhase; instant?: boolean; children?: ReactNode; onSettled?: () => void; label: string }) {
  const [stage, setStage] = useState<Stage>(instant ? "done" : "wait");
  const first = useRef(true);
  const settled = useRef(onSettled);
  settled.current = onSettled;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (instant) return;
    }
    const k = reduce() ? 0.15 : 1;
    const timers: number[] = [];
    const at = (ms: number, s: Stage) => timers.push(window.setTimeout(() => setStage(s), ms * k));
    if (phase === "wait") setStage("wait");
    if (phase === "crack") {
      setStage("crack1");
      at(650, "crack2");
    }
    if (phase === "burst") {
      setStage((s) => (s === "wait" || s === "crack1" ? "crack2" : s));
      at(450, "burst");
      at(2000, "done");
      timers.push(window.setTimeout(() => settled.current?.(), 2000 * k));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const burst = stage === "burst" || stage === "done";
  const frame = stage === "crack1" ? crack1 : stage === "crack2" ? crack2 : egg;
  return (
    <div className={`hatch-stage stage-${stage}`} role="img" aria-label={label}>
      <img className="hs-layer hs-glow" src={glow} alt="" aria-hidden="true" />
      {!burst ? <img className="hs-layer hs-egg" src={frame} alt="" aria-hidden="true" /> : null}
      {burst ? (
        <>
          <img className="hs-layer hs-top" src={shellTop} alt="" aria-hidden="true" />
          <img className="hs-layer hs-bottom" src={shellBottom} alt="" aria-hidden="true" />
          <div className="hs-bird">{children}</div>
        </>
      ) : null}
    </div>
  );
}
