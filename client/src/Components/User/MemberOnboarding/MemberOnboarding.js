import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./MemberOnboarding.css";

const BASE_URL =
  process.env.REACT_APP_BACKEND_SERVER_URL || "http://localhost:5002";

const api = async (path, options = {}) => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong.");
    err.status = res.status;
    throw err;
  }
  return data;
};

export default function MemberOnboarding() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [teams, setTeams] = useState([]);
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const firstName = useMemo(() => {
    try {
      const token = localStorage.getItem("token");
      return String(JSON.parse(atob(token.split(".")[1])).name || "").trim().split(" ")[0];
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // already in a team -> nothing to set up
        const mine = await api("/my-teams");
        if ((mine.teams || []).length > 0) return navigate("/my-workspace", { replace: true });
        const all = await api("/teams");
        setTeams(all.teams || all || []);
      } catch (e) {
        if (e.status === 401) return navigate("/", { replace: true });
        setError(e.message);
      }
      setChecking(false);
    })();
  }, [navigate]);

  const toggle = (id) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    setError("");
  };

  const submit = async () => {
    if (!picked.length || saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/my-teams", { method: "POST", body: JSON.stringify({ team_ids: picked }) });
      navigate("/my-workspace", { replace: true });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  if (checking) return <div className="mo-page" />;

  return (
    <div className="mo-page">
      <div className="mo-card">
        <h1>Welcome{firstName ? `, ${firstName}` : ""}!</h1>
        <p>You're all set to get started.</p>
        <p>Let's add the teams you're part of so you can stay on top of your checklists.</p>

        <div className="mo-label mo-mono">SELECT YOUR TEAMS</div>
        {teams.length === 0 ? (
          <div className="mo-none mo-mono">NO TEAMS HAVE BEEN CREATED YET. ASK YOUR ADMIN TO ADD THEM.</div>
        ) : (
          <div className="mo-grid">
            {teams.map((t) => {
              const on = picked.includes(t.id);
              return (
                <button key={t.id} type="button" className={`mo-team ${on ? "mo-on" : ""}`} onClick={() => toggle(t.id)} aria-pressed={on}>
                  <span>{t.name}</span>
                  <i className="mo-ico" aria-hidden="true">{on ? "✕" : "+"}</i>
                </button>
              );
            })}
          </div>
        )}
        <p className="mo-hint">You can adjust these at any time if your needs change.</p>

        <div className="mo-foot">
          <span className="mo-brand mo-mono"><i aria-hidden="true" /> CHECKLIST GENIE</span>
          <span className="mo-err" role="alert">{error}</span>
          <button type="button" className="mo-go" disabled={!picked.length || saving} onClick={submit}>
            {saving ? "Saving..." : "Get started"} <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}