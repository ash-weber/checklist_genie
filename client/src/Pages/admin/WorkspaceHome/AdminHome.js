import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import NewChecklistModal from "../NewChecklist/NewChecklistModal"; 
import AccountMenu from "../../../auth/AccountMenu";
import "./AdminHome.css";

const BASE_URL =
  process.env.REACT_APP_BACKEND_SERVER_URL || "http://localhost:5002";

const ROUTES = { insights: "/admin/insights", admin: "/admin/panel", teams: "/admin/teams", help: null };
const REPEAT = {
  WORKDAYS: "Weekdays", WEEKLY: "Weekly", FORTNIGHTLY: "Fortnightly",
  MONTHLY: "Monthly", QUARTERLY: "Every 3 months", HALF_YEARLY: "Every 6 months",
  YEARLY: "Yearly", CUSTOM: "Custom",
};
const LIST_TYPE = {
  ONBOARDING: "Onboarding", COMPLIANCE_AUDIT: "Compliance & Audit",
  MAINTENANCE: "Maintenance", QUALITY_ASSURANCE: "Quality Assurance",
  SAFETY_CHECKS: "Safety Checks", DAILY_OPERATIONS: "Daily Operations",
};
const POSITION = {
  FULL_STACK_DEVELOPER: "Full Stack Developer", POWER_BI_DEVELOPER: "Power BI Developer",
  SALES: "Sales", HUMAN_RESOURCE: "Human Resource", TESTING: "Testing",
  SALESFORCE: "Salesforce", PUBLIC: "Public", DIGITAL_TRANSFORMATION: "Digital Transformation",
  MARKETING: "Marketing", ERODE_INTERN: "Erode Intern",
};
const DAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MS_DAY = 86400000;

const parseDay = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const startOfToday = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const dateLabel = (d) => `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;

function nextDue(c, today) {
  if (!c.due_date) return null;
  const base = parseDay(c.due_date);
  const rec = c.recurrence || "NONE";
  if (rec === "NONE" || base >= today) return base;

  const end = c.recurrence_ends_on ? parseDay(c.recurrence_ends_on) : null;
  let d = null;

  if (rec === "WORKDAYS" || rec === "CUSTOM") {
    const allowed = rec === "WORKDAYS"
      ? ["MON", "TUE", "WED", "THU", "FRI"]
      : String(c.recurrence_custom_days || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (allowed.length) {
      d = new Date(today);
      for (let i = 0; i < 8 && !allowed.includes(DAY[d.getDay()]); i++) d.setDate(d.getDate() + 1);
    }
  } else if (rec === "WEEKLY" || rec === "FORTNIGHTLY") {
    const step = rec === "WEEKLY" ? 7 : 14;
    const k = Math.ceil(Math.round((today - base) / MS_DAY) / step);
    d = new Date(base);
    d.setDate(d.getDate() + k * step);
  } else {
    const months = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 }[rec];
    if (months) {
      let k = 0;
      do {
        d = new Date(base);
        d.setMonth(base.getMonth() + k * months);
        k += 1;
      } while (d < today && k < 600);
    }
  }
  if (!d) return base;
  return end && d > end ? null : d;
}

function Card({ c, onRecipients, onEdit }) {
  const when = c.next || (c.due_date ? parseDay(c.due_date) : null);
  const rep = REPEAT[c.recurrence];
  const firstType = c.list_types && c.list_types[0];
  const tag = firstType
    ? LIST_TYPE[firstType] || firstType
    : c.position
      ? POSITION[c.position] || c.position
      : null;
  return (
    <div className="ah-card">
      <p className="ah-ctitle">{c.title}</p>
      <div className="ah-cmeta">
        <span className="ah-cteam">{(c.shared_to || []).join(", ")}</span>
        {tag && <span className="ah-tag ah-mono">{tag.toUpperCase()}</span>}
        <span className="ah-cdate">
          {when ? dateLabel(when) : "No due date"}{rep ? ` • Repeats: ${rep}` : ""}
        </span>
      </div>
      <div className="ah-cactions">
        <button type="button" className="ah-rcpt" onClick={() => onEdit(c.id)}>
          Edit
        </button>
        <button type="button" className="ah-rcpt" onClick={() => onRecipients(c.id)}>
          Recipients
        </button>
      </div>
    </div>
  );
}

const Section = ({ title, children }) => (
  <section className="ah-sec">
    <h2 className="ah-sech">{title}</h2>
    {children}
  </section>
);

export default function AdminHome() {
  const navigate = useNavigate();
  const [org, setOrg] = useState("");
  const [teams, setTeams] = useState([]);
  const [lists, setLists] = useState([]);
  const [teamId, setTeamId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState(null); 

  const token = localStorage.getItem("token");
  const initial = useMemo(() => {
    try {
      const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return String(JSON.parse(atob(b64)).name || "").trim().charAt(0).toUpperCase();
    } catch { return ""; }
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return navigate("/", { replace: true });
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [sRes, cRes, tRes] = await Promise.all([
        fetch(`${BASE_URL}/onboarding/status`, { headers }),
        fetch(`${BASE_URL}/checklists`, { headers }),
        fetch(`${BASE_URL}/teams`, { headers }),
      ]);
      if (sRes.status === 401 || cRes.status === 401) return navigate("/", { replace: true });
      if (sRes.ok) {
        const s = await sRes.json();
        if (s.isAdmin === false) return navigate("/my-workspace", { replace: true });
        setOrg(s.group_name || "");
      }
      if (cRes.ok) setLists((await cRes.json()).checklists || []);
      if (tRes.ok) {
        const d = await tRes.json();
        setTeams(Array.isArray(d) ? d : d.teams || []);
      }
    } catch {
    }
    setLoaded(true);
  }, [navigate, token]);

  useEffect(() => { load(); }, [load]);

  const today = useMemo(startOfToday, []);
  const rows = useMemo(() => lists.map((c) => ({ ...c, next: nextDue(c, today) })), [lists, today]);
  const inTeam = (c) => !teamId || (c.shared_team_ids || []).includes(teamId);

  const todays = rows.filter((c) => inTeam(c) && c.next && c.next.getTime() === today.getTime());
  const teamLists = teamId ? rows.filter(inTeam) : [];
  const tiles = teams.map((t) => ({
    ...t,
    n: lists.filter((c) => (c.shared_team_ids || []).includes(t.id)).length,
  }));
  const activeTeam = teams.find((t) => t.id === teamId);
  const countLabel = (n) => (n === 0 ? "No Lists" : n === 1 ? "1 List" : `${n} Lists`);
  const go = (path) => { if (path) navigate(path); };
  const openRecipients = (id) => navigate(`/admin/templaterecepients/${id}`);
  const closeModal = () => { setShowNew(false); setEditId(null); load(); };

  return (
    <div className="ah-page">
      <div className="ah-shell">
        <header className="ah-top">
          <span className="ah-logo" aria-hidden="true" />
          <span className="ah-org">{org || "Organization Name"}</span>
          <AccountMenu initial={initial} />
        </header>

        <div className="ah-body">
          <aside className="ah-side">
            <button type="button" className="ah-plus" onClick={() => setShowNew(true)} aria-label="Create new checklist">+</button>

            <nav className="ah-nav">
              <button type="button" className={`ah-item ${!teamId ? "ah-on" : ""}`} onClick={() => setTeamId(null)}>
                All Checklists
              </button>

              <div className="ah-label">
                Teams
                <button type="button" className="ah-manage" onClick={() => go(ROUTES.teams)}>Manage</button>
              </div>
              <div className="ah-sub">
                {teams.length === 0 && loaded && <span className="ah-none">No teams yet</span>}
                {teams.map((t) => (
                  <button key={t.id} type="button" className={`ah-subitem ${t.id === teamId ? "ah-on" : ""}`}
                    onClick={() => setTeamId(t.id === teamId ? null : t.id)}>
                    {t.name}
                  </button>
                ))}
              </div>

              <button type="button" className={`ah-item ah-muted ${ROUTES.insights ? "" : "ah-off"}`} onClick={() => go(ROUTES.insights)}>Insights</button>
              <button type="button" className={`ah-item ah-muted ${ROUTES.admin ? "" : "ah-off"}`} onClick={() => go(ROUTES.admin)}>Admin Panel</button>
            </nav>

            <button type="button" className={`ah-help ${ROUTES.help ? "" : "ah-off"}`} onClick={() => go(ROUTES.help)}>Help</button>
          </aside>

          <main className="ah-main">
            <div className="ah-titlerow">
              <h1>{activeTeam ? activeTeam.name : "All Checklists"}</h1>
              <button type="button" className="ah-link" onClick={() => setShowNew(true)}>Create New Checklist</button>
            </div>

            <Section title="Today's Activity">
              {todays.length > 0
                ? <div className="ah-grid">{todays.map((c) => <Card key={c.id} c={c} onRecipients={openRecipients} onEdit={setEditId} />)}</div>
                : loaded && <div className="ah-empty ah-mono">NO CHECKLISTS DUE TODAY</div>}
            </Section>

            
            {!activeTeam && rows.length > 0 && (
              <Section title="All Checklists">
                <div className="ah-grid">
                  {rows.map((c) => <Card key={c.id} c={c} onRecipients={openRecipients} onEdit={setEditId} />)}
                </div>
              </Section>
            )}

            {activeTeam && (
              <Section title={`${activeTeam.name} Checklists`}>
                {teamLists.length > 0
                  ? <div className="ah-grid">{teamLists.map((c) => <Card key={c.id} c={c} onRecipients={openRecipients} onEdit={setEditId} />)}</div>
                  : <div className="ah-empty ah-mono">NO LISTS SHARED WITH THIS TEAM YET</div>}
              </Section>
            )}

            <Section title="Team Checklists">
              <div className="ah-tiles">
                {tiles.map((t) => (
                  <button key={t.id} type="button" className={`ah-tile ${t.id === teamId ? "ah-on" : ""}`}
                    onClick={() => setTeamId(t.id === teamId ? null : t.id)}>
                    <span className="ah-tname">{t.name}</span>
                    <span className={`ah-tcount ${t.n === 0 ? "ah-zero" : ""}`}>{countLabel(t.n)}</span>
                  </button>
                ))}
                {tiles.length === 0 && loaded && <div className="ah-empty ah-mono">NO TEAMS YET</div>}
              </div>
            </Section>
          </main>
        </div>
      </div>

      {(showNew || editId) && (
        <NewChecklistModal
          key={editId || "new"}
          editId={editId || undefined}
          onClose={closeModal}
          onCreated={load}
        />
      )}
    </div>
  );
}