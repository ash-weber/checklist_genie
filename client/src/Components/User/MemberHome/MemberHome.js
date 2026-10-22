import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SubmitChecklistModal from "../SubmitChecklist/SubmitChecklistModal";
import { clearAuth } from "../../../auth/auth";
import "./MemberHome.css"; 

const BASE_URL = process.env.REACT_APP_BACKEND_SERVER_URL || "http://localhost:5002";

const RECURRENCE = {
  WORKDAYS: "Weekdays", WEEKLY: "Weekly", FORTNIGHTLY: "Fortnightly", MONTHLY: "Monthly",
  QUARTERLY: "Every 3 months", HALF_YEARLY: "Every 6 months", YEARLY: "Yearly", CUSTOM: "Custom",
};
const LIST_TYPE = {
  ONBOARDING: "Onboarding", COMPLIANCE_AUDIT: "Compliance & Audit", MAINTENANCE: "Maintenance",
  QUALITY_ASSURANCE: "Quality Assurance", SAFETY_CHECKS: "Safety Checks", DAILY_OPERATIONS: "Daily Operations",
};
const DAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MS_DAY = 86400000;

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const startOfToday = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

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

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ord = (n) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
const dateLabel = (d) => `${DAY_SHORT[d.getDay()]} ${d.getDate()}${ord(d.getDate())} ${d.toLocaleDateString("en-GB", { month: "short" })}`;

/* one colour per team (Figma: Team A = green, Team B = blue) */
const PALETTE = [
  { bg: "#cfe5c6", ring: "#8fbf7c" },
  { bg: "#c6d3ea", ring: "#8fa6d6" },
  { bg: "#ece3c2", ring: "#cdb86a" },
  { bg: "#e3cfe5", ring: "#b88fc0" },
];

const StatusIcon = ({ s, tone }) => {
  if (s === "done") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-label="Completed"><circle cx="9" cy="9" r="8" fill="#3fae6a" /><path d="M5.5 9.3l2.4 2.4 4.6-4.9" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    );
  }
  const ring = tone ? tone.ring : "#a6aec4";
  const fill = tone ? tone.ring : "#13213c";
  if (s === "progress") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-label="In progress"><circle cx="9" cy="9" r="7.5" fill="none" stroke={ring} strokeWidth="1.2" /><path d="M9 1.5a7.5 7.5 0 010 15z" fill={fill} /></svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-label="Not started"><circle cx="9" cy="9" r="7.5" fill="none" stroke={ring} strokeWidth="1.2" /></svg>
  );
};

function Card({ c, onOpen }) {
  const rec = RECURRENCE[c.recurrence];
  const types = (c.list_types || []).map((l) => LIST_TYPE[l] || l);
  const showDate = (c.overdue || c.diff > 0) && c.status !== "done";
  const tagBg = c.tone ? c.tone.bg : "#e3e5ec";
  return (
    <button type="button" className="mr-card" onClick={() => onOpen(c)}>
      <div className="mr-ctop">
        <p>{c.title}</p>
        <StatusIcon s={c.status} tone={c.tone} />
      </div>
      <div className="mr-tags">
        {types.slice(0, 2).map((t) => (
          <span key={t} className="mr-tag" style={{ background: tagBg }}>{t}</span>
        ))}
      </div>
      {(showDate || rec) && (
        <div className="mr-meta">
          {showDate && <span className={c.overdue ? "mr-late" : ""}>{dateLabel(c.next)}</span>}
          {showDate && rec && " \u2022 "}
          {rec && <span>Repeats: {rec}</span>}
        </div>
      )}
    </button>
  );
}

function Section({ label, open, onToggle, empty, items, onOpen }) {
  return (
    <section className="mr-sec">
      <button type="button" className={`mr-sech ${open ? "mr-open" : ""}`} onClick={onToggle} aria-expanded={open}>
        {label}
      </button>
      {open && (items.length ? <Grid items={items} onOpen={onOpen} /> : <div className="mr-empty">{empty}</div>)}
    </section>
  );
}

const Grid = ({ items, onOpen }) => (
  <div className="mr-grid">{items.map((c) => <Card key={c.id} c={c} onOpen={onOpen} />)}</div>
);

export default function MemberHome() {
  const navigate = useNavigate();
  const [org, setOrg] = useState("");
  const [teams, setTeams] = useState([]);
  const [lists, setLists] = useState([]);
  const [teamId, setTeamId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(null);
  const [show, setShow] = useState({});
  const [showDone, setShowDone] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const h = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenu(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const logout = () => { clearAuth(); navigate("/", { replace: true }); };

  const token = localStorage.getItem("token");
  const initials = useMemo(() => {
    try { return String(JSON.parse(atob(token.split(".")[1])).name || "").trim().slice(0, 1).toUpperCase(); } catch { return ""; }
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return navigate("/", { replace: true });
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [sRes, cRes] = await Promise.all([
        fetch(`${BASE_URL}/onboarding/status`, { headers }),
        fetch(`${BASE_URL}/my-checklists`, { headers }),
      ]);
      if (sRes.ok) setOrg((await sRes.json()).group_name || "");
      if (cRes.status === 401) { clearAuth(); return navigate("/", { replace: true }); }
      if (cRes.ok) {
        const d = await cRes.json();
        const t = d.teams || [];

        const visible = (d.checklists || []).filter(
          (c) => !c.is_draft && !c.archived && c.published !== false
        );

        if (t.length === 0 && visible.length === 0) {
          return navigate("/member-onboarding", { replace: true });
        }

        setTeams(t);
        setLists(visible);
        setTeamId((cur) => (cur && t.some((x) => x.id === cur) ? cur : null));
      }
    } catch {
    }
    setLoaded(true);
  }, [navigate, token]);

  useEffect(() => { load(); }, [load]);

  const today = startOfToday();
  const buckets = useMemo(() => {
    const b = { today: [], upcoming: [], scheduled: [], done: [], doneToday: 0, overdue: 0 };
    lists
      .filter((c) => !teamId || (c.shared_team_ids || []).includes(teamId))
      .forEach((c) => {
        const next = nextDue(c, today);
        if (!next) return;
        const sub = c.today_submission;
        const submittedToday = sub && sub.status === "SUBMITTED";
        const oneOffDone = c.recurrence === "NONE" && c.ever_submitted;
        const status = submittedToday || oneOffDone ? "done" : sub && sub.response_count > 0 ? "progress" : "new";
        const diff = Math.round((next - today) / MS_DAY);
        const tIdx = teams.findIndex((t) => (c.shared_team_ids || []).includes(t.id));
        const tone = teams.length > 1 && tIdx >= 0 ? PALETTE[tIdx % PALETTE.length] : null;
        const item = { ...c, next, status, diff, tone, nextISO: iso(next), overdue: false };
        if (status === "done") {
          if (submittedToday) b.doneToday += 1;
          return b.done.push(item);
        }
        if (diff < 0) { item.overdue = true; b.overdue += 1; b.today.unshift(item); }
        else if (diff === 0) b.today.push(item);
        else if (diff <= 7) b.upcoming.push(item);
        else b.scheduled.push(item);
      });
    b.upcoming.sort((x, y) => x.next - y.next);
    b.scheduled.sort((x, y) => x.next - y.next);
    return b;
  }, [lists, teamId, teams]);

  const firstTime = loaded && lists.length === 0;
  const todayItems = overdueOnly ? buckets.today.filter((c) => c.overdue) : buckets.today;

  return (
    <div className="mr-page">
      <div className="mr-shell">
        <header className="mr-top">
          <span className="mr-logo" aria-hidden="true" />
          <span className="mr-org">{org || "Organization Name"}</span>
          <div className="mr-menuwrap" ref={menuRef}>
            <button type="button" className="mr-avatar" aria-label="Account menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              {initials}
            </button>
            {menu && (
              <div className="mr-menu" role="menu">
                <button type="button" role="menuitem" onClick={logout}>Logout</button>
              </div>
            )}
          </div>
        </header>

        <main className="mr-main">
          <div className={`mr-trow ${firstTime ? "mr-plain" : ""}`}>
            <h2>Today</h2>
            {teams.length > 1 && (
              <nav className={`mr-teams mr-mono ${firstTime ? "mr-faint" : ""}`} aria-label="Teams">
                {teams.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={firstTime}
                    className={`mr-chipbtn ${t.id === teamId ? "mr-on" : ""}`}
                    style={{ background: PALETTE[i % PALETTE.length].bg }}
                    onClick={() => { setTeamId(t.id === teamId ? null : t.id); setOverdueOnly(false); }}
                  >
                    {t.name}
                  </button>
                ))}
              </nav>
            )}
            {!firstTime && buckets.overdue > 0 ? (
              <button type="button" className="mr-link mr-right" onClick={() => setOverdueOnly((v) => !v)}>
                {overdueOnly ? "Show all" : `${buckets.overdue} Overdue`}
              </button>
            ) : (
              <span className="mr-nolate">No Overdue</span>
            )}
          </div>

          {firstTime ? (
            <div className="mr-blank">
              No checklists yet. Checklists shared with your team will show up here.
            </div>
          ) : (
            <>
              {loaded && todayItems.length > 0 ? (
                <Grid items={todayItems} onOpen={setOpen} />
              ) : (
                loaded && <div className="mr-empty">All done for today. Nothing due.</div>
              )}

              <Section label="Upcoming" open={show.upcoming ?? buckets.upcoming.length > 0}
                onToggle={() => setShow((s) => ({ ...s, upcoming: !(s.upcoming ?? buckets.upcoming.length > 0) }))}
                items={buckets.upcoming} onOpen={setOpen} empty="Nothing due in the next 7 days." />

              <Section label="Scheduled" open={show.scheduled ?? buckets.scheduled.length > 0}
                onToggle={() => setShow((s) => ({ ...s, scheduled: !(s.scheduled ?? buckets.scheduled.length > 0) }))}
                items={buckets.scheduled} onOpen={setOpen} empty="Nothing scheduled further out." />

              {showDone && (
                <Section label="Completed" open onToggle={() => setShowDone(false)}
                  items={buckets.done} onOpen={setOpen} empty="No completed checklists yet." />
              )}
            </>
          )}
        </main>

        <footer className="mr-foot">
          <button
            type="button"
            className={`mr-link ${firstTime ? "mr-faintlink" : ""}`}
            disabled={firstTime}
            onClick={() => setShowDone((v) => !v)}
          >
            Completed Checklists
          </button>
          {buckets.doneToday > 0 && (
            <div className="mr-act">(Today's Activity: {buckets.doneToday} List{buckets.doneToday > 1 ? "s" : ""})</div>
          )}
        </footer>
      </div>

      {open && (
        <SubmitChecklistModal
          checklistId={open.id}
          dueDate={open.nextISO}
          onClose={() => { setOpen(null); load(); }}
          onDone={load}
        />
      )}
    </div>
  );
}