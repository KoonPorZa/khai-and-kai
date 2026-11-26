import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { bandId } from "../lib/format";

/** One cell per registered bird. Lit = sponsored (opens the chicken), violet = hatching, dark = waiting. */
export function CoopGrid({ total, sponsored, pending, columns, collected }: { total: number; sponsored: Set<number>; pending: number; columns: number; collected?: Set<number> }) {
  const navigate = useNavigate();
  const cells = useMemo(() => {
    let violet = pending;
    return Array.from({ length: total }, (_, i) => {
      const id = i + 1;
      if (sponsored.has(id)) return { id, kind: collected?.has(id) ? ("collected" as const) : ("lit" as const) };
      if (violet > 0) {
        violet -= 1;
        return { id, kind: "hatch" as const };
      }
      return { id, kind: "dark" as const };
    });
  }, [total, sponsored, pending, collected]);
  const done = collected ? [...collected].filter((id) => sponsored.has(id)).length : 0;
  const lit = sponsored.size - done;
  const waiting = Math.max(0, total - lit - done - pending);
  return (
    <>
      <div
        className="grid-cells"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        role="group"
        aria-label={`Grid of ${total} nest boxes. ${lit} are lit, meaning sponsored. ${done} are collected. ${pending} are hatching. ${waiting} are dark, waiting for a sponsor.`}
      >
        {cells.map((c, i) =>
          c.kind === "lit" || c.kind === "collected" ? (
            <button key={c.id} type="button" className={`cell cell-${c.kind}`} style={{ animationDelay: `${Math.min(i, 120) * 6}ms` }} aria-label={`Open chicken ${bandId(c.id)}${c.kind === "collected" ? ", collected" : ""}`} onClick={() => navigate(`/chicken/${c.id}`)} />
          ) : c.kind === "dark" ? (
            <button key={c.id} type="button" className="cell cell-dark" title={`${bandId(c.id)}, waiting for a sponsor`} style={{ animationDelay: `${Math.min(i, 120) * 6}ms` }} aria-label={`${bandId(c.id)}, waiting for a sponsor`} onClick={() => navigate(`/chicken/${c.id}`)} />
          ) : (
            <span key={c.id} className={`cell cell-${c.kind}`} style={{ animationDelay: `${Math.min(i, 120) * 6}ms` }} />
          ),
        )}
      </div>
      <div className="legend">
        <span><i className="swatch swatch-lit" />{lit} sponsored</span>
        {done > 0 ? <span><i className="swatch swatch-collected" />{done} collected</span> : null}
        <span><i className="swatch swatch-hatch" />{pending} hatching now</span>
        <span><i className="swatch swatch-dark" />{waiting} waiting</span>
      </div>
    </>
  );
}
