import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Onboarding.css";

const MAX_TEAMS = 10;
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
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
};

const nameFromToken = () => {
  try {
    const p = JSON.parse(atob(localStorage.getItem("token").split(".")[1]));
    return String(p.name || "").trim().split(" ")[0];
  } catch {
    return "";
  }
};

export default function Onboarding({ userName }) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [groupName, setGroupName] = useState("");
  const [teamInput, setTeamInput] = useState("");
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const displayName = userName || nameFromToken() || "Admin";
  const isMax = teams.length >= MAX_TEAMS;

  useEffect(() => {
    api("/onboarding/status")
      .then((d) => {
        if (d.onboarded || !d.isAdmin) navigate("/user/login1", { replace: true });
        else setChecking(false);
      })
      .catch((e) => {
        if (/unauthorized|token/i.test(e.message)) {
          navigate("/", { replace: true });
          return;
        }
        setError(e.message);
        setChecking(false);
      });
  }, [navigate]);

  const addTeam = () => {
    if (isMax) return;
    const names = teamInput.split(",").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;

    const next = [...teams];
    for (const name of names) {
      if (next.some((t) => t.toLowerCase() === name.toLowerCase())) continue;
      if (next.length >= MAX_TEAMS) {
        setError(`You can add up to ${MAX_TEAMS} teams only.`);
        setTeams(next);
        setTeamInput("");
        return;
      }
      next.push(name);
    }
    setTeams(next);
    setTeamInput("");
    setError("");
  };

  const removeTeam = (idx) => {
    setTeams(teams.filter((_, i) => i !== idx));
    setError("");
  };

  const canSubmit = groupName.trim() && teams.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      await api("/onboarding", {
        method: "POST",
        body: JSON.stringify({ group_name: groupName.trim(), teams }),
      });
      navigate("/workspace", { replace: true });
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  if (checking) return <div className="ob-page" />;

  return (
    <div className="ob-page">
      <div className="ob-card">
        <section className="ob-left">
          <h1 className="ob-title">Welcome, {displayName}!</h1>
          <p className="ob-text">You're now the admin for this workspace.</p>
          <p className="ob-text">
            Let's set things up in a way that fits how your team works best.
          </p>
          <p className="ob-text">
            To get started, simply give your group a name &amp; add any teams that
            belong to it.
          </p>

          <p className="ob-small ob-mt">Here are some examples of possible structures:</p>
          <div className="ob-example">
            <span className="ob-mono">ORGANIZATION &gt; TEAMS</span>
            <span>Ideal for managing multiple departments</span>
            <span>Eg: Acme Corp › HR, Marketing, IT</span>
          </div>
          <div className="ob-example">
            <span className="ob-mono">DEPARTMENT &gt; SUB-TEAMS</span>
            <span>Great for focused teams</span>
            <span>Eg: Marketing › Social Media, Events, etc</span>
          </div>
          <div className="ob-example">
            <span className="ob-mono">CUSTOM (YOUR STRUCTURE)</span>
            <span>Want to name things your own way? Go for it.</span>
            <span>Eg: APAC › Japan Team, India Team</span>
          </div>

          <hr className="ob-rule" />
          <p className="ob-small">
            Not sure which one to pick? Don't worry, just get started with what you
            think suits best. You can adjust these at any time if your needs change.
          </p>
          <div className="ob-brand">
            <span className="ob-dot" />
            <span className="ob-mono">CHECKLIST GENIE</span>
          </div>
        </section>

        <section className="ob-right">
          <div>
            <label className="ob-label ob-mono" htmlFor="group">ADD GROUP NAME</label>
            <input
              id="group"
              className="ob-group-input"
              placeholder="Group Name"
              value={groupName}
              maxLength={100}
              onChange={(e) => setGroupName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="ob-teams">
            <label className="ob-label ob-mono" htmlFor="team">
              ADD UPTO {MAX_TEAMS} TEAMS
            </label>
            <div className="ob-team-row">
              <input
                id="team"
                className={`ob-team-input ${isMax ? "ob-team-input-max" : ""}`}
                placeholder={isMax ? "MAXIMUM TEAMS CREATED" : "Team Name"}
                value={isMax ? "" : teamInput}
                maxLength={60}
                disabled={isMax}
                onChange={(e) => setTeamInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTeam()}
              />
              <button
                type="button"
                className="ob-plus"
                onClick={addTeam}
                disabled={isMax}
                aria-label="Add team"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M6 1v10M1 6h10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="ob-chips">
              {teams.map((t, i) => (
                <div
                  className={`ob-chip ${i === teams.length - 1 ? "ob-chip-new" : ""}`}
                  key={t.toLowerCase()}
                >
                  <span className="ob-chip-name">{t}</span>
                  <button
                    type="button"
                    className="ob-chip-x"
                    onClick={() => removeTeam(i)}
                    aria-label={`Remove ${t}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="ob-footer">
            <span className="ob-error" role="alert">{error}</span>
            <button type="button" className="ob-cta" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? "Setting up..." : "Get started"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}