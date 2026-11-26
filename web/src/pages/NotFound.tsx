import { Link } from "react-router-dom";
import { useT } from "../i18n";

export function NotFound() {
  const t = useT();
  return (
    <div className="stack narrow">
      <h1 className="h1">{t("notfound.title")}</h1>
      <p className="muted">{t("notfound.body")}</p>
      <Link to="/" className="btn btn-primary">{t("notfound.home")}</Link>
    </div>
  );
}
