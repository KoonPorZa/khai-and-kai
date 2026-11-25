import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="stack narrow">
      <h1 className="h1">Page not found</h1>
      <p className="muted">That address does not lead anywhere in the coop.</p>
      <Link to="/" className="btn btn-primary">Back to the home page</Link>
    </div>
  );
}
