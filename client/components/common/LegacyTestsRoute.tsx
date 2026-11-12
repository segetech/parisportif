import { Navigate, useLocation } from "react-router-dom";

/** Preserve bookmarked filters while moving the public URL to /tests. */
export function LegacyTestsRoute() {
  const location = useLocation();
  return <Navigate replace to={{ pathname: "/tests", search: location.search, hash: location.hash }} />;
}
