import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import NewChecklistModal from "../NewChecklist/NewChecklistModal"; 
import AccountMenu from "../../../auth/AccountMenu";
import "./AdminHome.css";

const BASE_URL =
  process.env.REACT_APP_BACKEND_SERVER_URL || "http://localhost:5002";
const MEMBER_ROUTE = "/my-workspace"; 

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

const formatSubmittedDate = (value) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return `${DAY_SHORT[date.getDay()]} ${date.getDate()} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`;
};

function ChecklistMeta({ c }) {
  return (
    <>
      <span className="ah-cdate">Last submitted: {formatSubmittedDate(c.last_submitted_at)}</span>
      <span className={`ah-status ${c.is_active ? "ah-status-active" : "ah-status-inactive"}`}>
        {c.is_active ? "Active" : "Inactive"}
      </span>
    </>
  );
}

function Card({ c, onRecipients, onEdit, onStatusEdit }) {
  const when = c.next || (c.due_date ? parseDay(c.due_date) : null);
  const rep = REPEAT[c.recurrence];
  const firstType = c.list_types && c.list_types[0];
  const tag = firstType
    ? LIST_TYPE[firstType] || firstType
    : c.position
      ? POSITION[c.position] || c.position
      : null;
  return (
    <div className={`ah-card ${c.is_active ? "" : "ah-card-inactive"}`}>
      <p className="ah-ctitle">{c.title}</p>
      <div className="ah-cmeta">
        <span className="ah-cteam">{(c.shared_to || []).join(", ")}</span>
        {tag && <span className="ah-tag ah-mono">{tag.toUpperCase()}</span>}
        <span className="ah-cdate">
          {when ? dateLabel(when) : "No due date"}{rep ? ` • Repeats: ${rep}` : ""}
        </span>
        <ChecklistMeta c={c} />
      </div>
      <div className="ah-cactions">
        <button type="button" className="ah-rcpt" onClick={() => onEdit(c.id)}>Edit</button>
        <button type="button" className="ah-rcpt" onClick={() => onRecipients(c.id)}>Recipients</button>
        <button type="button" className="ah-rcpt" onClick={() => onStatusEdit(c)}>Status</button>
      </div>
    </div>
  );
}

function ChecklistTable({ rows, onRecipients, onEdit, onStatusEdit }) {
  return (
    <div className="ah-table-wrap">
      <table className="ah-table">
        <thead>
          <tr>
            <th>Checklist</th><th>Due / Recurrence</th><th>Last Submitted</th><th>No. of Submissions</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const firstType = c.list_types && c.list_types[0];
            const tag = firstType ? (LIST_TYPE[firstType] || firstType) : c.position ? (POSITION[c.position] || c.position) : "—";
            const when = c.next || (c.due_date ? parseDay(c.due_date) : null);
            const rep = REPEAT[c.recurrence];
            return (
              <tr key={c.id} className={!c.is_active ? "ah-row-inactive" : ""}>
                <td className="ah-table-title">
                  <div className="ah-table-checklist-name">{c.title}</div>
                  <div className="ah-table-submeta">
                    <span><strong>Team:</strong> {(c.shared_to || []).join(", ") || "—"}</span>
                    <span><strong>Category:</strong> {tag}</span>
                  </div>
                </td>
                <td>{when ? dateLabel(when) : "No due date"}{rep ? ` • ${rep}` : ""}</td>
                <td>{formatSubmittedDate(c.last_submitted_at)}</td>
                <td className="ah-submission-count">{Number(c.submissions_count || 0).toLocaleString("en-IN")}</td>
                <td><span className={`ah-status ${c.is_active ? "ah-status-active" : "ah-status-inactive"}`}>{c.is_active ? "Active" : "Inactive"}</span></td>
                <td>
                  <div className="ah-table-actions">
                    <button type="button" onClick={() => onEdit(c.id)}>Edit</button>
                    <button type="button" onClick={() => onRecipients(c.id)}>Recipients</button>
                    <button type="button" onClick={() => onStatusEdit(c)}>Status</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChecklistCollection({ rows, view, onViewChange, onRecipients, onEdit, onStatusEdit, statusFilter }) {
  const hasSubmission = (c) => c.last_submitted_at && !Number.isNaN(new Date(c.last_submitted_at).getTime());
  const sortByLatestSubmission = (items) => items.sort((a, b) => {
    const aTime = hasSubmission(a) ? new Date(a.last_submitted_at).getTime() : 0;
    const bTime = hasSubmission(b) ? new Date(b.last_submitted_at).getTime() : 0;
    return bTime - aTime || String(a.title || "").localeCompare(String(b.title || ""));
  });

  // Keep active and inactive checklists in separate groups. Inactive items must
  // never be folded into the active "Never Submitted" group.
  const activeRows = rows.filter((c) => c.is_active === true || c.is_active === 1 || c.is_active === "1");
  const inactiveRows = rows.filter((c) => !(c.is_active === true || c.is_active === 1 || c.is_active === "1"));
  const activeRecentlySubmitted = sortByLatestSubmission(activeRows.filter(hasSubmission));
  const activeNeverSubmitted = activeRows
    .filter((c) => !hasSubmission(c))
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
  const inactiveChecklists = sortByLatestSubmission([...inactiveRows]);

  const renderRows = (items) => view === "grid" ? (
    <div className="ah-grid">{items.map((c) => <Card key={c.id} c={c} onRecipients={onRecipients} onEdit={onEdit} onStatusEdit={onStatusEdit} />)}</div>
  ) : <ChecklistTable rows={items} onRecipients={onRecipients} onEdit={onEdit} onStatusEdit={onStatusEdit} />;

  const renderGroup = (title, items) => items.length > 0 && (
    <div className="ah-list-group">
      <h3 className="ah-list-group-title">{title}</h3>
      {renderRows(items)}
    </div>
  );

  return (
    <>
      <div className="ah-view-toggle" role="group" aria-label="Checklist view">
        <button type="button" className={view === "grid" ? "ah-view-active" : ""} onClick={() => onViewChange("grid")} aria-pressed={view === "grid"}>▦ Grid</button>
        <button type="button" className={view === "table" ? "ah-view-active" : ""} onClick={() => onViewChange("table")} aria-pressed={view === "table"}>☷ Table</button>
      </div>
      {renderGroup("Active Checklists – Recently Submitted", activeRecentlySubmitted)}
      {renderGroup("Active Checklists", activeNeverSubmitted)}
      {renderGroup("Inactive Checklists", inactiveChecklists)}
      {rows.length === 0 && <div className="ah-empty ah-mono">NO CHECKLISTS MATCH THE SELECTED FILTERS</div>}
    </>
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
  const [listView, setListView] = useState("grid");
  const [checklistStatusFilter, setChecklistStatusFilter] = useState("active");
  const [submissionFilter, setSubmissionFilter] = useState("all");
  const [statusChecklist, setStatusChecklist] = useState(null);
  const [statusValue, setStatusValue] = useState(true);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState("");

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

  const filteredRows = useMemo(() => {
    let result = rows;
    if (checklistStatusFilter !== "all") {
      result = result.filter((c) => checklistStatusFilter === "active" ? Boolean(c.is_active) : !Boolean(c.is_active));
    }
    if (submissionFilter === "submitted") result = result.filter((c) => c.last_submitted_at && !Number.isNaN(new Date(c.last_submitted_at).getTime()));
    if (submissionFilter === "never") result = result.filter((c) => !c.last_submitted_at || Number.isNaN(new Date(c.last_submitted_at).getTime()));
    return result;
  }, [rows, checklistStatusFilter, submissionFilter]);
  const teamLists = teamId ? filteredRows.filter(inTeam) : [];
  const tiles = teams.map((t) => ({
    ...t,
    n: lists.filter((c) => (c.shared_team_ids || []).includes(t.id)).length,
  }));
  const activeTeam = teams.find((t) => t.id === teamId);
  const countLabel = (n) => (n === 0 ? "No Lists" : n === 1 ? "1 List" : `${n} Lists`);
  const go = (path) => { if (path) navigate(path); };
  const openRecipients = (id) => navigate(`/admin/templaterecepients/${id}`);
  const closeModal = () => { setShowNew(false); setEditId(null); load(); };
  const openStatusEditor = (checklist) => {
    setStatusChecklist(checklist);
    setStatusValue(Boolean(checklist.is_active));
    setStatusError("");
  };
  const saveChecklistStatus = async () => {
    if (!statusChecklist || statusSaving) return;
    setStatusSaving(true);
    setStatusError("");
    try {
      const response = await fetch(`${BASE_URL}/checklists/${statusChecklist.id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: statusValue }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to update checklist status.");
      setStatusChecklist(null);
      await load();
    } catch (error) {
      setStatusError(error.message || "Unable to update checklist status.");
    } finally {
      setStatusSaving(false);
    }
  };

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
              <button type="button" className={`ah-item ${MEMBER_ROUTE ? "" : "ah-off"}`} onClick={() => go(MEMBER_ROUTE)}>My Submissions</button>
            

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

            <div className="ah-list-filters">
              <label>Checklist Status
                <select value={checklistStatusFilter} onChange={(event) => setChecklistStatusFilter(event.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="all">All</option>
                </select>
              </label>
              <label>Submission Status
                <select value={submissionFilter} onChange={(event) => setSubmissionFilter(event.target.value)}>
                  <option value="all">All</option>
                  <option value="submitted">Last Submitted</option>
                  <option value="never">Never Submitted</option>
                </select>
              </label>
            </div>

            {!activeTeam && (
              <Section title="All Checklists">
                <ChecklistCollection rows={filteredRows} view={listView} onViewChange={setListView}
                  onRecipients={openRecipients} onEdit={setEditId} onStatusEdit={openStatusEditor} statusFilter={checklistStatusFilter} />
              </Section>
            )}

            {activeTeam && (
              <Section title={`${activeTeam.name} Checklists`}>
                {teamLists.length > 0
                  ? <ChecklistCollection rows={teamLists} view={listView} onViewChange={setListView}
                      onRecipients={openRecipients} onEdit={setEditId} onStatusEdit={openStatusEditor} statusFilter={checklistStatusFilter} />
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

      {statusChecklist && (
        <div className="ah-status-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !statusSaving) setStatusChecklist(null); }}>
          <div className="ah-status-modal" role="dialog" aria-modal="true" aria-labelledby="ah-status-title">
            <h2 id="ah-status-title">Update Checklist Status</h2>
            <p>{statusChecklist.title}</p>
            <label htmlFor="ah-checklist-status">Status</label>
            <select id="ah-checklist-status" value={statusValue ? "active" : "inactive"} onChange={(event) => setStatusValue(event.target.value === "active")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {statusError && <div className="ah-status-error" role="alert">{statusError}</div>}
            <div className="ah-status-modal-actions">
              <button type="button" onClick={() => setStatusChecklist(null)} disabled={statusSaving}>Cancel</button>
              <button type="button" className="ah-status-save" onClick={saveChecklistStatus} disabled={statusSaving}>{statusSaving ? "Saving…" : "Submit"}</button>
            </div>
          </div>
        </div>
      )}

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