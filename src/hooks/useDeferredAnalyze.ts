import { useEffect, useState } from "react";
import { analyze } from "../lib/analyze";
import { findStyleViolations } from "../lib/settings";
import type { Highlight, Mode, StyleRule } from "../lib/types";

// 入力中は走らせない。idle中に静かに解析。
export function useDeferredAnalyze(
  text: string,
  mode: Mode,
  styleRule: StyleRule = "off",
  delay = 400
): Highlight[] {
  const [hl, setHl] = useState<Highlight[]>([]);
  useEffect(() => {
    let cancelled = false;
    const ric: any = (window as any).requestIdleCallback ?? ((cb: any) => setTimeout(cb, delay));
    const cic: any = (window as any).cancelIdleCallback ?? clearTimeout;
    const t = setTimeout(() => {
      const handle = ric(
        () => {
          if (cancelled) return;
          const base = analyze(text, mode);
          const style = findStyleViolations(text, styleRule);
          setHl(base.concat(style));
        },
        { timeout: 1500 }
      );
      return () => cic(handle);
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, mode, styleRule, delay]);
  return hl;
}
