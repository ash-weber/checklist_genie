import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { setToken, setRole, clearAuth } from "../../../auth/auth";

const BASE_URL = process.env.REACT_APP_BACKEND_SERVER_URL || "http://localhost:5002";

const Login1 = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const t = new URLSearchParams(location.search).get("token");
    if (t) {
      setToken(t);
      window.history.replaceState(null, "", window.location.pathname);
    }

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/", { replace: true });
      return undefined;
    }

    let alive = true;
    setError("");
    axios
      .get(`${BASE_URL}/onboarding/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        if (!alive) return;
        const admin = !!data.isAdmin;
        setRole(admin ? "admin" : "member");
        if (admin && data.onboarded === false) return navigate("/onboarding", { replace: true });
        navigate(admin ? "/workspace" : "/my-workspace", { replace: true });
      })
      .catch((e) => {
        if (!alive) return;
        if (e.response?.status === 401) {
          clearAuth();
          navigate("/", { replace: true });
          return;
        }
        setError("Could not reach the server.");
      });

    return () => { alive = false; };
  }, [location.search, navigate, attempt]);

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <p>{error}</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>Try again</button>{" "}
        <button type="button" onClick={() => { clearAuth(); navigate("/", { replace: true }); }}>Logout</button>
      </div>
    );
  }

  return <div style={{ padding: 24 }}>Loading...</div>;
};

export default Login1;