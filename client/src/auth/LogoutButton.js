import { useNavigate } from "react-router-dom";
import { clearAuth } from "./auth";

export function useLogout() {
  const navigate = useNavigate();
  return () => {
    clearAuth();
    navigate("/", { replace: true });
  };
}

export default function LogoutButton({ className = "", children = "Logout" }) {
  const logout = useLogout();
  return (
    <button type="button" className={className} onClick={logout}>
      {children}
    </button>
  );
}