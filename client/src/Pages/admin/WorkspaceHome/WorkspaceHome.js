import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import NewChecklistModal from "../NewChecklist/NewChecklistModal";
import AccountMenu from "../../../auth/AccountMenu"; 
import "./WorkspaceHome.css";

const BASE_URL =
  process.env.REACT_APP_BACKEND_SERVER_URL || "http://localhost:5002";

const readToken = () => {
  const token = localStorage.getItem("token");
  try {
    return { token, payload: JSON.parse(atob(token.split(".")[1])) };
  } catch {
    return { token, payload: {} };
  }
};

const RECURRENCE = {
  WORKDAYS: "WEEKDAYS", WEEKLY: "WEEKLY", FORTNIGHTLY: "FORTNIGHTLY",
  MONTHLY: "MONTHLY", QUARTERLY: "EVERY 3 MONTHS", HALF_YEARLY: "EVERY 6 MONTHS",
  YEARLY: "YEARLY", CUSTOM: "CUSTOM",
};
const LIST_TYPE = {
  ONBOARDING: "Onboarding", COMPLIANCE_AUDIT: "Compliance & Audit",
  MAINTENANCE: "Maintenance", QUALITY_ASSURANCE: "Quality Assurance",
  SAFETY_CHECKS: "Safety Checks", DAILY_OPERATIONS: "Daily Operations",
};

const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  if (dt.toDateString() === new Date().toDateString()) return "TODAY";
  return dt
    .toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
    .replace(",", " •")
    .toUpperCase();
};

const Svg = ({ d, s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const USER = "M8 8a3 3 0 100-6 3 3 0 000 6zM2.5 14c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5";
const GROUP = "M6 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 3.2a2.5 2.5 0 010 4.6M12 9.6c1.6.4 2.5 1.6 2.5 3.4";
const CAL = "M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2v3M10.5 2v3";
const REPEAT = "M3 7V6a2 2 0 012-2h7l-2-2M13 9v1a2 2 0 01-2 2H4l2 2";

export default function WorkspaceHome() {
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState("");
  const [checklists, setChecklists] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState(null); 

  const { token, payload } = readToken();
  const firstName = String(payload.name || "").trim().split(" ")[0];
  const title = firstName ? `${firstName}'s Workspace` : "Your Workspace";

  const load = useCallback(async () => {
    if (!token) return navigate("/", { replace: true });
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const sRes = await fetch(`${BASE_URL}/onboarding/status`, { headers });
      if (sRes.ok) {
        const s = await sRes.json();
        if (s.onboarded === false) return navigate("/onboarding", { replace: true });
        setGroupName(s.group_name || "");
      }
      const cRes = await fetch(`${BASE_URL}/checklists`, { headers });
      if (cRes.ok) setChecklists((await cRes.json()).checklists || []);
    } catch {
     
    }
  }, [navigate, token]);

  useEffect(() => {
    load();
  }, [load]);

  const hasLists = checklists.length > 0;
  const closeModal = () => { setShowNew(false); setEditId(null); load(); };

  return (
    <div className="ws-page">
      <div className="ws-shell">
        <header className="ws-top">
          <span className="ws-logo" aria-hidden="true" />
          <span className="ws-org">{groupName || "Organization Name"}</span>
          <AccountMenu initial={firstName.charAt(0).toUpperCase()} size={20} />
        </header>

        <nav className="ws-nav ws-mono">
          <span className="ws-nav-item ws-active">HOME</span>
          <span className="ws-nav-item" onClick={() => navigate("/admin/teams")}>TEAMS</span>
          <span className="ws-nav-item">INSIGHTS</span>
          <span className="ws-nav-item" onClick={() => navigate("/my-workspace")}>MY CHECKLISTS</span>
          <span className="ws-nav-item" onClick={() => navigate("/admin/manage-checklist")}>ADMIN</span>
        </nav>

        <main className="ws-main">
          <header className="ws-head">
            <div>
              <h1 className="ws-title">{title}</h1>
              <p className="ws-sub">
                {hasLists
                  ? "Track team progress with ease and consistency"
                  : "Get started by creating a checklist and share it with members!"}
              </p>
            </div>
            <button type="button" className="ws-cta" onClick={() => setShowNew(true)}>
              Create checklist <span aria-hidden="true">+</span>
            </button>
          </header>
          <hr className="ws-rule" />

          <div className="ws-grid">
            {!hasLists && (
              <button type="button" className="ws-card" onClick={() => setShowNew(true)}>
                <span className="ws-badge" aria-hidden="true">+</span>
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
                  <path d="M3 6l2 2 3-3.5M3 13l2 2 3-3.5M3 20l2 2 3-3.5M12 7h11M12 14h11M12 21h11" stroke="#13213C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="ws-mono ws-card-label">CREATE NEW CHECKLIST</span>
              </button>
            )}

            {checklists.map((c) => {
              // CHANGED: old checklists have no list types -> show their position instead
              const chips =
                c.list_types && c.list_types.length > 0
                  ? c.list_types.map((l) => LIST_TYPE[l] || l)
                  : c.position
                    ? [c.position.replace(/_/g, " ")]
                    : [];
              const shared = c.shared_to || [];
              return (
                <div className="ws-list-card" key={c.id}>
                  <div className="ws-list-top">
                    <p>{c.title}</p>
                    <Svg d={c.assignee_type === "GROUP" ? GROUP : USER} s={14} />
                  </div>
                  {(c.due_date || RECURRENCE[c.recurrence]) && (
                    <div className="ws-list-meta ws-mono">
                      {c.due_date && <span><Svg d={CAL} s={11} /> {fmtDate(c.due_date)}</span>}
                      {RECURRENCE[c.recurrence] && (
                        <span><Svg d={REPEAT} s={11} /> {RECURRENCE[c.recurrence]}</span>
                      )}
                    </div>
                  )}
                  <div>
                    {chips.map((l) => (
                      <span key={l} className="ws-chip ws-mono">{l.toUpperCase()}</span>
                    ))}
                  </div>
                  {shared.length > 0 && (
                    <div className="ws-shared ws-mono">
                      SHARED TO: {shared.join(" + ").toUpperCase()}
                    </div>
                  )}
                  <div className="ws-cactions">
                    <button type="button" className="ws-rcpt" onClick={() => setEditId(c.id)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ws-rcpt"
                      onClick={() => navigate(`/admin/templaterecepients/${c.id}`)}
                    >
                      Recipients
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
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