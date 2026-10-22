import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { GATEWAY, fetchRole, getRole, homeFor, isLoggedIn } from "./auth";

function RoleGate({ roles }) {
  const [role, setRole] = useState(getRole);
  const [checking, setChecking] = useState(() => getRole() === null);

  useEffect(() => {
    if (!checking) return undefined;
    let alive = true;
    fetchRole().then((r) => {
      if (alive) {
        setRole(r);
        setChecking(false);
      }
    });
    return () => { alive = false; };
  }, [checking]);

  if (checking) return <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>Loading...</div>;
  if (!isLoggedIn()) return <Navigate to="/" replace />;
  if (role && !roles.includes(role)) return <Navigate to={homeFor(role)} replace />;
  return <Outlet />;
}


export default function ProtectedRoute({ roles }) {
  const location = useLocation();
  if (!isLoggedIn()) return <Navigate to="/" replace state={{ from: location }} />;
  return roles ? <RoleGate roles={roles} /> : <Outlet />;
}

export function PublicOnlyRoute() {
  if (isLoggedIn()) return <Navigate to={GATEWAY} replace />;
  return <Outlet />;
}

export function FallbackRoute() {
  return <Navigate to={isLoggedIn() ? homeFor() : "/"} replace />;
}