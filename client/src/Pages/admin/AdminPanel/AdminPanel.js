import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AccountMenu from "../../../auth/AccountMenu"; // same folder depth as MemberHome
import { clearAuth } from "../../../auth/auth";
import "./AdminPanel.css";

const BASE_URL = process.env.REACT_APP_BACKEND_SERVER_URL || "http://localhost:5002";
const HOME_ROUTE = "/workspace";
const MEMBER_ROUTE = "/my-workspace"; 

const api = async (path, method = "GET", body) => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || data.message || "Something went wrong.");
    e.status = res.status;
    throw e;
  }
  return data;
};

const FALLBACK_OPTIONS = {
  positions: [],
  font_sizes: [{ key: "Small", px: 13 }, { key: "Medium", px: 14.5 }, { key: "Large", px: 16.5 }],
  reminder_units: [{ key: "Minutes", minutes: 1 }, { key: "Hours", minutes: 60 }, { key: "Days", minutes: 1440 }],
  limits: { min_minutes: 15, max_minutes: 10080 },
};

const PREF_KEY = "cg_admin_prefs";
const DEFAULT_PREFS = { theme: "light", font_size: "Medium", notifications: false, reminder_every: 1, reminder_unit: "Hours" };
const readPrefs = () => {
  try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREF_KEY)) || {}) }; }
  catch { return DEFAULT_PREFS; }
};
const writePrefs = (p) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* private mode */ } };

const pretty = (p) => String(p || "").split("_").join(" ");
const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const memberSince = (s) =>
  s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "-";

export default function AdminPanel() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const prefsLoaded = useRef(false);

  const [options, setOptions] = useState(FALLBACK_OPTIONS);
  const [profile, setProfile] = useState(null);
  const [positions, setPositions] = useState([]);
  const [pick, setPick] = useState("");
  const [org, setOrg] = useState("");
  const [counts, setCounts] = useState({ checklists: null, teams: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "" });
  const [busy, setBusy] = useState(false);

  const [prefs, setPrefs] = useState(readPrefs);
  const [saved, setSaved] = useState(readPrefs);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [flash, setFlash] = useState("");
  const [testMsg, setTestMsg] = useState("");

  const norm = (p) => JSON.stringify({ ...p, reminder_every: Number(p.reminder_every) });
  const dirty = norm(prefs) !== norm(saved);

  const load = useCallback(async () => {
    if (!token) return navigate("/", { replace: true });
    setError("");
    const [p, s, c, t, o, pr] = await Promise.allSettled([
      api("/admin-panel/profile"),
      api("/onboarding/status"),
      api("/checklists"),
      api("/teams"),
      api("/admin-panel/options"),
      api("/admin-panel/preferences"),
    ]);
    if ([p, s, c].some((r) => r.status === "rejected" && r.reason.status === 401)) {
      return navigate("/", { replace: true });
    }
    if (s.status === "fulfilled") {
      if (s.value.isAdmin === false) return navigate("/my-workspace", { replace: true });
      setOrg(s.value.group_name || "");
    }
    if (p.status === "fulfilled") {
      setProfile(p.value.profile || null);
      setPositions(p.value.positions || []);
      setDraft({ name: p.value.profile?.name || "" });
    } else {
      setError("Could not load your account. Please try again.");
    }
    if (o.status === "fulfilled") setOptions({ ...FALLBACK_OPTIONS, ...o.value });
    // preferences are read once, so a reload never wipes unsaved changes
    if (pr.status === "fulfilled" && !prefsLoaded.current) {
      prefsLoaded.current = true;
      const next = { ...DEFAULT_PREFS, ...pr.value.preferences };
      setPrefs(next);
      setSaved(next);
      writePrefs(next);
    }
    const teamList = t.status === "fulfilled" ? (Array.isArray(t.value) ? t.value : t.value.teams || []) : [];
    setCounts({
      checklists: c.status === "fulfilled" ? (c.value.checklists || []).length : null,
      teams: t.status === "fulfilled" ? teamList.length : null,
    });
    setLoading(false);
  }, [navigate, token]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn, failMsg) => {
    setBusy(true);
    setError("");
    try { await fn(); await load(); } catch (e) { setError(e.message || failMsg); }
    setBusy(false);
  };

  const saveProfile = () =>
    run(async () => {
      await api("/admin-panel/profile", "PATCH", { name: draft.name.trim() });
      setEditing(false);
    }, "Could not update your profile.");

  const cancelProfile = () => {
    setEditing(false);
    setDraft({ name: profile?.name || "" });
  };

  const addPosition = () =>
    run(async () => {
      await api("/admin-panel/positions", "POST", { position: pick });
      setPick("");
    }, "Could not add the position.");

  const removePosition = (id) =>
    run(() => api(`/admin-panel/positions/${id}`, "DELETE"), "Could not remove the position.");

  const available = useMemo(
    () => (options.positions || []).filter((p) => !positions.some((x) => x.user_position === p)),
    [options.positions, positions]
  );

  /* ---------- preferences ---------- */
  const setP = (patch) => setPrefs((p) => ({ ...p, ...patch }));

  const unitMinutes = (options.reminder_units.find((u) => u.key === prefs.reminder_unit) || {}).minutes || 1;
  const every = Number(prefs.reminder_every);
  const totalMin = every * unitMinutes;
  const { min_minutes: minMin, max_minutes: maxMin } = options.limits;
  const reminderError = !prefs.notifications
    ? ""
    : !Number.isInteger(every) || every < 1
    ? "Enter a whole number, 1 or more."
    : totalMin < minMin
    ? `Reminders can be at most every ${minMin} minutes.`
    : totalMin > maxMin
    ? `Maximum is every ${Math.round(maxMin / 1440)} days.`
    : "";

  const savePrefs = async () => {
    setSavingPrefs(true);
    setError("");
    try {
      const r = await api("/admin-panel/preferences", "PUT", { ...prefs, reminder_every: every });
      const next = { ...DEFAULT_PREFS, ...r.preferences };
      setPrefs(next);
      setSaved(next);
      writePrefs(next);
      setFlash("Saved");
      setTimeout(() => setFlash(""), 2200);
    } catch (e) {
      setError(e.message);
    }
    setSavingPrefs(false);
  };
  const resetPrefs = () => setPrefs(saved);

  const sendTest = async () => {
    setTestMsg("Sending...");
    try {
      const r = await api("/admin-panel/notifications/test", "POST");
      setTestMsg(r.message || "Test email sent.");
    } catch (e) {
      setTestMsg(e.message);
    }
  };

  const logout = () => {
    clearAuth();
    navigate("/", { replace: true });
  };

  const fontPx = (options.font_sizes.find((f) => f.key === prefs.font_size) || {}).px || 14.5;
  const initial = String(profile?.name || "").trim().charAt(0).toUpperCase();

  const tiles = [
    { label: "CHECKLISTS", value: counts.checklists, sub: "Create, edit and share", to: "/workspace" },
    { label: "TEAMS", value: counts.teams, sub: "Members and teams", to: "/admin/teams" },
    { label: "INSIGHTS", value: null, sub: "Answers by Process ID", to: "/admin/insights" },
  ];

  return (
    <div className="ap-page" style={{ fontSize: fontPx }}>
      <div className="ap-shell">
        <header className="ap-top">
          <span className="ap-logo" aria-hidden="true" />
          <span className="ap-org">{org || "Organization Name"}</span>
          <AccountMenu initial={initial} image={profile?.image} />
        </header>


          <main className="ap-main">
            <header className="ap-head">
              <div>
                <h1>Admin Panel</h1>
                <p>Your account, preferences and shortcuts to everything you manage.</p>
              </div>
              <div className="ap-headbtns">
                {/* shown only when the same person is both admin and member */}
                {profile?.is_member && (
                  <button type="button" className="ap-cta ap-cta-alt" onClick={() => navigate(MEMBER_ROUTE)}>
                    My Workspace →
                  </button>
                )}
                <button type="button" className="ap-cta" onClick={() => navigate(HOME_ROUTE)}>← All Checklists</button>
              </div>
            </header>
            <hr className="ap-rule" />

            {error && <div className="ap-error ap-mono">{error.toUpperCase()}</div>}

            <section className="ap-tiles">
              {tiles.map((t) => (
                <button type="button" key={t.label} className="ap-tile" onClick={() => navigate(t.to)}>
                  <span className="ap-mono ap-tlabel">{t.label}</span>
                  <b>{t.value === null || t.value === undefined ? "→" : t.value}</b>
                  <span className="ap-tsub">{t.sub}</span>
                </button>
              ))}
            </section>

            {loading ? (
              <div className="ap-note ap-mono">LOADING...</div>
            ) : (
              <div className="ap-grid">
                <section className="ap-card">
                  <h2>My Account</h2>
                  <div className="ap-who">
                    <span className="ap-big">{profile?.image ? <img src={profile.image} alt="" /> : initial}</span>
                    {editing ? (
                      <div className="ap-editfields">
                        <input className="ap-input" value={draft.name} maxLength={100} placeholder="Name" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                      </div>
                    ) : (
                      <div className="ap-name">{profile?.name || "-"}</div>
                    )}
                  </div>

                  <dl className="ap-dl">
                    <div><dt className="ap-mono">EMAIL</dt><dd>{profile?.email || "-"}</dd></div>
                    <div><dt className="ap-mono">USER TYPE</dt><dd>{profile?.user_type || "-"}</dd></div>
                    <div><dt className="ap-mono">ORGANISATION</dt><dd>{profile?.organisation || org || "-"}</dd></div>
                    <div><dt className="ap-mono">MEMBER SINCE</dt><dd>{memberSince(profile?.created_at)}</dd></div>
                  </dl>

                  <div className="ap-actions">
                    {editing ? (
                      <>
                        <button type="button" className="ap-btn" disabled={busy || !draft.name.trim()} onClick={saveProfile}>{busy ? "Saving..." : "Save"}</button>
                        <button type="button" className="ap-ghost" disabled={busy} onClick={cancelProfile}>Cancel</button>
                      </>
                    ) : (
                      <button type="button" className="ap-btn" onClick={() => setEditing(true)}>Edit Profile</button>
                    )}
                  </div>
                </section>

                <section className="ap-card">
                  <h2>Your Positions</h2>
                  {positions.length === 0 ? (
                    <div className="ap-empty ap-mono">NO POSITIONS ADDED YET</div>
                  ) : (
                    <ul className="ap-chips">
                      {positions.map((p) => (
                        <li key={p.id}>
                          <span>{pretty(p.user_position)}</span>
                          <button type="button" disabled={busy} onClick={() => removePosition(p.id)} aria-label={`Remove ${pretty(p.user_position)}`}>✕</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="ap-addrow">
                    <select className="ap-input" value={pick} disabled={busy || available.length === 0} onChange={(e) => setPick(e.target.value)} aria-label="Position">
                      <option value="">{available.length ? "Select a position" : options.positions.length ? "All positions added" : "No positions available"}</option>
                      {available.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}
                    </select>
                    <button type="button" className="ap-btn" disabled={busy || !pick} onClick={addPosition}>Add</button>
                  </div>
                </section>

                <section className="ap-card">
                  <h2>Preferences</h2>
                  <div className="ap-field">
                    <span className="ap-mono ap-flabel">FONT SIZE</span>
                    <div className="ap-seg" role="radiogroup" aria-label="Font size">
                      {options.font_sizes.map((f) => (
                        <button type="button" key={f.key} role="radio" aria-checked={prefs.font_size === f.key} className={prefs.font_size === f.key ? "on" : ""} onClick={() => setP({ font_size: f.key })}>{f.key}</button>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="ap-card">
                  <h2>Notifications</h2>
                  <label className="ap-switchrow">
                    <span>Email me reminders for my checklists that are due today</span>
                    <input type="checkbox" role="switch" checked={prefs.notifications} onChange={(e) => setP({ notifications: e.target.checked })} />
                    <i className="ap-switch" aria-hidden="true" />
                  </label>
                  {prefs.notifications && (
                    <div className="ap-field">
                      <span className="ap-mono ap-flabel">REMIND ME EVERY</span>
                      <div className="ap-every">
                        <input
                          className="ap-input ap-num"
                          type="number"
                          min="1"
                          step="1"
                          value={prefs.reminder_every}
                          onChange={(e) => setP({ reminder_every: e.target.value })}
                          aria-label="Reminder frequency"
                        />
                        <select className="ap-input" value={prefs.reminder_unit} onChange={(e) => setP({ reminder_unit: e.target.value })} aria-label="Reminder unit">
                          {options.reminder_units.map((u) => <option key={u.key} value={u.key}>{u.key}</option>)}
                        </select>
                      </div>
                      {reminderError ? (
                        <small className="ap-bad">{reminderError}</small>
                      ) : (
                        <small>You get an email while a checklist you created is due today and members still have to submit it.</small>
                      )}
                      <div className="ap-testrow">
                        <button type="button" className="ap-ghost" onClick={sendTest}>Send test email</button>
                        {testMsg && <small>{testMsg}</small>}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}

            <section className="ap-card ap-logout">
              <h2>Logout</h2>
              <p>Sign out of Checklist Genie on this device.</p>
              <button type="button" className="ap-btn" onClick={logout}>Logout</button>
            </section>
          </main>
      </div>

      <div className={`ap-savebar ${dirty || flash ? "ap-show" : ""}`} aria-live="polite">
        {flash ? <span className="ap-mono ap-flash">{flash.toUpperCase()} ✓</span> : <span className="ap-mono">UNSAVED PREFERENCES</span>}
        {dirty && (
          <>
            <button type="button" className="ap-ghost" disabled={savingPrefs} onClick={resetPrefs}>Cancel</button>
            <button type="button" className="ap-btn" disabled={savingPrefs || !!reminderError} onClick={savePrefs}>
              {savingPrefs ? "Saving..." : "Save Changes"}
            </button>
          </>
        )}
      </div>

    </div>
  );
}