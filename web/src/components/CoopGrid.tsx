import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { bandId } from "../lib/format";

/** One cell per registered bird. Lit = sponsored (opens the chicken), violet = hatching, dark = waiting. */
export function CoopGrid({ total, sponsored, pending, columns }: { total: number; sponsored: Set<number>; pending: number; columns: number }) {
  const navigate = useNavigate();
  const cells = useMemo(() => {
    let violet = pending;
    return Array.from({ length: total }, (_, i) => {
      const id = i + 1;
      if (sponsored.has(id)) return { id, kind: "lit" as const };
      if (violet > 0) {
        violet -= 1;
        return { id, kind: "hatch" as const };
      }
      return { id, kind: "dark" as const };
    });
  }, [total, sponsored, pending]);
  const lit = sponsored.size;
  const waiting = Math.max(0, total - lit - pending);
  return (
    <>
      <div
        className="grid-cells"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        role="group"
        aria-label={`Grid of ${total} nest boxes. ${lit} are lit, meaning sponsored. ${pending} are hatching. ${waiting} are dark, waiting for a sponsor.`}
      >
        {cells.map((c, i) =>
          c.kind === "lit" ? (
            <button key={c.id} type="button" className="cell cell-lit" style={{ animationDelay: `${Math.min(i, 120) * 6}ms` }} aria-label={`Open chicken ${bandId(c.id)}`} onClick={() => navigate(`/chicken/${c.id}`)} />
          ) : c.kind === "dark" ? (
            <button key={c.id} type="button" className="cell cell-dark" title={`${bandId(c.id)}, waiting for a sponsor`} style={{ animationDelay: `${Math.min(i, 120) * 6}ms` }} aria-label={`${bandId(c.id)}, waiting for a sponsor`} onClick={() => navigate(`/chicken/${c.id}`)} />
          ) : (
            <span key={c.id} className={`cell cell-${c.kind}`} style={{ animationDelay: `${Math.min(i, 120) * 6}ms` }} />
          ),
        )}
      </div>
      <div className="legend">
        <span><i className="swatch swatch-lit" />{lit} sponsored</span>
        <span><i className="swatch swatch-hatch" />{pending} hatching now</span>
        <span><i className="swatch swatch-dark" />{waiting} waiting</span>
      </div>
    </>
  );
}
