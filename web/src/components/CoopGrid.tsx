import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useT } from "../i18n";
import { bandId } from "../lib/format";

/** One cell per registered bird. Lit = sponsored (opens the chicken), violet = hatching, dark = waiting. */
export function CoopGrid({ total, sponsored, pending, columns, collected }: { total: number; sponsored: Set<number>; pending: number; columns: number; collected?: Set<number> }) {
  const navigate = useNavigate();
  const t = useT();
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
        aria-label={t("coop.gridAria", { total, lit, done, pending, waiting })}
      >
        {cells.map((c, i) =>
          c.kind === "lit" || c.kind === "collected" ? (
            <button key={c.id} type="button" className={`cell cell-${c.kind}`} style={{ animationDelay: `${Math.min(i, 120) * 6}ms` }} aria-label={t(c.kind === "collected" ? "coop.cellOpenCollected" : "coop.cellOpen", { band: bandId(c.id) })} onClick={() => navigate(`/chicken/${c.id}`)} />
          ) : c.kind === "dark" ? (
            <button key={c.id} type="button" className="cell cell-dark" title={t("coop.cellWaiting", { band: bandId(c.id) })} style={{ animationDelay: `${Math.min(i, 120) * 6}ms` }} aria-label={t("coop.cellWaiting", { band: bandId(c.id) })} onClick={() => navigate(`/chicken/${c.id}`)} />
          ) : (
            <span key={c.id} className={`cell cell-${c.kind}`} style={{ animationDelay: `${Math.min(i, 120) * 6}ms` }} />
          ),
        )}
      </div>
      <div className="legend">
        <span><i className="swatch swatch-lit" />{t("coop.legendSponsored", { n: lit })}</span>
        {done > 0 ? <span><i className="swatch swatch-collected" />{t("coop.legendCollected", { n: done })}</span> : null}
        <span><i className="swatch swatch-hatch" />{t("coop.legendHatching", { n: pending })}</span>
        <span><i className="swatch swatch-dark" />{t("coop.legendWaiting", { n: waiting })}</span>
      </div>
    </>
  );
}
