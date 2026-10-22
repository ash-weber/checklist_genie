import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./NewChecklistModal.css";

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

const RECURRENCE = [
  ["NONE", "None"], ["WORKDAYS", "Workdays"], ["WEEKLY", "Weekly"],
  ["FORTNIGHTLY", "Fortnightly"], ["MONTHLY", "Monthly"],
  ["QUARTERLY", "Every 3 Months"], ["HALF_YEARLY", "Every 6 Months"],
  ["YEARLY", "Yearly"], ["CUSTOM", "Custom"],
];
const PRIORITY = [[null, "None", ""], ["LOW", "Low", "!"], ["MEDIUM", "Medium", "!!"], ["HIGH", "High", "!!!"]];
const LIST_TYPES = [
  ["ONBOARDING", "Onboarding"], ["COMPLIANCE_AUDIT", "Compliance & Audit"],
  ["MAINTENANCE", "Maintenance"], ["QUALITY_ASSURANCE", "Quality Assurance"],
  ["SAFETY_CHECKS", "Safety Checks"], ["DAILY_OPERATIONS", "Daily Operations"],
];
const DAYS = [["SUN", "S"], ["MON", "M"], ["TUE", "T"], ["WED", "W"], ["THU", "T"], ["FRI", "F"], ["SAT", "S"]];
const DEFAULT_GUIDE = {
  heading: "Here's How to Build Clear, Action-Ready Checklists",
  max_items: 10,
  sections: [
    { title: "PHRASE IT AS AN ACTION", bullets: ["Timesheet filled in", "Server health check complete"],
      text: 'Write each item like a statement your team can check off; meaning no questions or "did you..."' },
    { title: "PICK THE RIGHT RESPONSE TYPE", text: "Decide how users should answer:",
      bullets: ["Checkbox for yes/no steps", "Number field for counts or quantities"] },
    { title: "ADD CONTEXT (IF NEEDED)", text: 'Use the "Note" field sparingly to clarify when an item might be ambiguous.' },
  ],
  examples: [
    { label: "Bugs found in automation process", type: "Numeric" },
    { label: "Server Health Check Complete", note: "No failed services in the last 24 hours", type: "Yes/No" },
  ],
};

const ICON = {
  user: "M8 8a3 3 0 100-6 3 3 0 000 6zM2.5 14c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5",
  cal: "M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2v3M10.5 2v3",
  repeat: "M3 7V6a2 2 0 012-2h7l-2-2M13 9v1a2 2 0 01-2 2H4l2 2",
  bell: "M4 11V7a4 4 0 018 0v4l1 1.5H3zM6.5 14h3",
  folder: "M2 4.5h4l1.5 1.5H14v7H2z",
  chev: "M4 6l4 4 4-4",
  check: "M3 8.5l3 3 7-7",
  warn: "M8 2.5l6 10.5H2zM8 7v3M8 11.3v.2",
  eye: "M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 9.8a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6z",
  eyeoff: "M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 9.8a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM2.5 2.5l11 11",
};
const Ico = ({ n, s = 14 }) => (
  <svg width={s * 1.7} height={s * 1.7} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICON[n]} />
  </svg>
);

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const longDate = (s) => parse(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const label = (list, v) => (list.find(([k]) => k === v) || [])[1];
const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const STATEMENT_LIMIT = 60; 
const MOBILE_MAX = 820;    
const emptyItem = () => ({ statement: "", notes: "", response_type: "", process_id: "" });
const cleanPid = (v) => v.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
const addYear = (s) => { const d = parse(s); d.setFullYear(d.getFullYear() + 1); return iso(d); };
const endFmt = (s) => { const d = parse(s); return `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}, ${d.getFullYear()}`; };
const dayOnly = (s) => String(s || "").slice(0, 10);

function useFit(dep) {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      if (window.innerWidth <= MOBILE_MAX) return setScale(1);
      setScale(Math.min(1, (window.innerWidth - 32) / el.offsetWidth, (window.innerHeight - 32) / el.offsetHeight));
    };
    fit();
    window.addEventListener("resize", fit);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => { window.removeEventListener("resize", fit); ro.disconnect(); };
  }, [dep]);
  return [ref, { transform: `scale(${scale})` }];
}

/* ---------- field + popover shell ---------- */
function Field({ icon, text, placeholder, invalid, sub, up, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="nc-field" ref={ref}>
      <span className="nc-ficon"><Ico n={icon} /></span>
      <div className="nc-fbody">
        <button type="button" className={`nc-pill ${invalid ? "nc-invalid" : ""} ${text ? "" : "nc-empty"}`} onClick={() => setOpen(!open)}>
          <span>{text || placeholder}</span><Ico n="chev" s={11} />
        </button>
        {sub}
        {open && <div className={`nc-pop ${up ? "nc-up" : ""}`}>{children(() => setOpen(false))}</div>}
      </div>
    </div>
  );
}

const Foot = ({ onCancel, onDone }) => (
  <div className="nc-popfoot">
    <button type="button" className="nc-ulink" onClick={onCancel}>Cancel</button>
    <button type="button" className="nc-done" onClick={onDone}>Done</button>
  </div>
);

function RecipientMenu({ teams, assignee, teamIds, onApply, close }) {
  const [mode, setMode] = useState(assignee);
  const [sel, setSel] = useState(teamIds);
  return (
    <div className="nc-rec">
      <div className="nc-menu">
        <div className="nc-menu-title">Select recipients</div>
        {[["MEMBER", "Member", "(to individually work on the checklist)"], ["GROUP", "Group", "(to collaborate on the checklist)"]].map(([k, t, s]) => (
          <button type="button" key={k} className={`nc-opt2 ${mode === k ? "on" : ""}`} onClick={() => setMode(k)}>
            <Ico n="user" s={13} /><span>{t}<small>{s}</small></span>
          </button>
        ))}
      </div>
      {mode && (
        <div className="nc-menu nc-teams">
          <div className="nc-menu-title">{mode === "GROUP" ? "Group between members in:" : "Each member in:"}</div>
          {teams.length === 0 && <small>No teams yet.</small>}
          {teams.map((t) => (
            <label key={t.id} className="nc-check">
              <input type="checkbox" checked={sel.includes(t.id)} onChange={() => setSel(toggle(sel, t.id))} />{t.name}
            </label>
          ))}
          <Foot onCancel={close} onDone={() => { onApply(mode, sel); close(); }} />
        </div>
      )}
    </div>
  );
}

function DateMenu({ value, onApply, close }) {
  const [sel, setSel] = useState(value);
  const [view, setView] = useState(parse(value));
  const y = view.getFullYear(), m = view.getMonth();
  const first = new Date(y, m, 1).getDay();
  const count = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  const today = iso(new Date());
  return (
    <div className="nc-menu nc-cal">
      <div className="nc-cal-head">
        <span>{view.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
        <span>
          <button type="button" onClick={() => setView(new Date(y, m - 1, 1))}>‹</button>
          <button type="button" onClick={() => setView(new Date(y, m + 1, 1))}>›</button>
        </span>
      </div>
      <div className="nc-cal-grid nc-mono">
        {DAYS.map(([k]) => <span key={k} className="nc-dow">{k}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const id = `${y}-${pad(m + 1)}-${pad(d)}`;
          return (
            <button type="button" key={i} className={`nc-day ${id === sel ? "on" : ""} ${id === today ? "today" : ""}`} onClick={() => setSel(id)}>{d}</button>
          );
        })}
      </div>
      <div className="nc-popfoot">
        <button type="button" className="nc-ulink" onClick={() => { setSel(today); setView(new Date()); }}>Today</button>
        <button type="button" className="nc-done" onClick={() => { onApply(sel); close(); }}>Done</button>
      </div>
    </div>
  );
}

function ListTypeMenu({ value, onApply, close }) {
  const [sel, setSel] = useState(value);
  return (
    <div className="nc-menu">
      <div className="nc-menu-title">Select applicable types</div>
      <small className="nc-hint">(Group checklists into intuitive categories for quick setup, clear team context, and easier reporting.)</small>
      {LIST_TYPES.map(([k, v]) => (
        <label key={k} className="nc-check">
          <input type="checkbox" checked={sel.includes(k)} onChange={() => setSel(toggle(sel, k))} />{v}
        </label>
      ))}
      <Foot onCancel={close} onDone={() => { onApply(sel); close(); }} />
    </div>
  );
}

const TypeCells = ({ type, onPick }) => (
  <div className="nc-tcells">
    <button type="button" disabled={!onPick} className={`nc-tbox ${type === "Boolean" ? "on" : ""}`} onClick={() => onPick && onPick("Boolean")} aria-label="Yes/No">
      <Ico n="check" s={7} />
    </button>
    <button type="button" disabled={!onPick} className={`nc-nbox nc-mono ${type === "Numeric" ? "on" : ""}`} onClick={() => onPick && onPick("Numeric")} aria-label="Numeric">000</button>
  </div>
);

const PreviewRow = ({ it, box }) => (
  <div className="nc-prow">
    {box}
    <div className="nc-ptext"><div>{it.statement}</div>{it.notes && <small>{it.notes}</small>}</div>
    <div className="nc-pplus">+</div>
    <span className="nc-psend">Send</span>
  </div>
);


export default function NewChecklistModal({ onClose, onCreated, editId }) {
  const isEdit = Boolean(editId);
  const today = iso(new Date());
  const guide = DEFAULT_GUIDE; 
  const [showGuide, setShowGuide] = useState(!isEdit);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState("");

  const [title, setTitle] = useState("");
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(null);
  const [assignee, setAssignee] = useState("");
  const [teamIds, setTeamIds] = useState([]);
  const [legacy, setLegacy] = useState(false); 
  const [due, setDue] = useState(today);
  const [recurrence, setRecurrence] = useState("NONE");
  const [recEnd, setRecEnd] = useState("");
  const [customDays, setCustomDays] = useState(["MON", "TUE", "WED", "THU", "FRI"]);
  const [shift, setShift] = useState(true);
  const [priority, setPriority] = useState(null);
  const [listTypes, setListTypes] = useState([]);

  const [step, setStep] = useState("form");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [sugs, setSugs] = useState([]); 
  const [sugOpen, setSugOpen] = useState(false);
  const sugReq = useRef(0);
  const [rowSug, setRowSug] = useState({ idx: null, list: [] }); 
  const rowReq = useRef(0);

  const [fitRef, fitStyle] = useFit(`${step}-${loading}`);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    api("/teams").then((d) => setTeams(d.teams || d)).catch(() => {});
  }, []);

  const draftPid = draft ? draft.process_id : null;
  useEffect(() => {
    if (!draftPid) { setSugs([]); return undefined; }
    const my = ++sugReq.current;
    const t = setTimeout(() => {
      api(`/checklists/items/search?process_id=${encodeURIComponent(draftPid)}`)
        .then((d) => { if (my === sugReq.current) setSugs((d && d.items) || []); })
        .catch(() => { if (my === sugReq.current) setSugs([]); });
    }, 250);
    return () => clearTimeout(t);
  }, [draftPid]);

  useEffect(() => {
    if (!editId) return;
    api(`/checklists/${editId}?include_hidden=true`)
      .then((d) => {
        setTitle(d.title || "");
        setItems((d.items || []).map((it) => ({
          linked_item_id: it.linked_item_id,
          item_id: it.item_id,
          statement: it.statement,
          notes: it.notes || "",
          response_type: it.response_type,
          process_id: it.process_id || "",
          hidden: Boolean(it.is_hidden),
          
          pid_locked: Boolean(it.process_id),
        })));
        setAssignee(d.assignee_type || "MEMBER");
        setLegacy(Boolean(d.legacy));
        setTeamIds((d.shared_to || []).map((t) => t.id));
        setDue(dayOnly(d.due_date) || today);
        setRecurrence(d.recurrence || "NONE");
        setRecEnd(dayOnly(d.recurrence_ends_on));
        if (d.recurrence_custom_days) setCustomDays(d.recurrence_custom_days.split(",").map((s) => s.trim()).filter(Boolean));
        setShift(Boolean(d.workday_shift));
        setPriority(d.priority || null);
        setListTypes(d.list_types || []);
        setLoading(false);
      })
      .catch((e) => { setLoadError(e.message); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const endDate = recEnd && recEnd >= due ? recEnd : addYear(due);
  const maxItems = guide.max_items || 10;
  const setD = (patch) => setDraft((cur) => ({ ...cur, ...patch }));
  const isEmpty = items.length === 0 && !draft;
  const canToggle = !isEmpty || !showGuide;
  const overLimit = !!draft && draft.statement.length > STATEMENT_LIMIT;
  const visibleItems = items.filter((i) => !i.hidden);
  const hiddenCount = items.length - visibleItems.length;

  /* reuse an existing checklist item by Process ID */
  const lookupProcess = async () => {
    const pid = (draft && draft.process_id.trim()) || "";
    if (!pid) return;
    if (items.some((it) => it.process_id === pid)) {
      setInfo("");
      return setError(`PROCESS ID ${pid} IS ALREADY IN THIS CHECKLIST. USE IT IN ANOTHER CHECKLIST TO REUSE IT.`);
    }
    try {
      const d = await api(`/checklists/items/search?process_id=${encodeURIComponent(pid)}`);
      const found = ((d && d.items) || []).find((it) => it.process_id === pid);
      if (found) {
        setDraft((cur) => cur && {
          ...cur,
          statement: found.checklist_name,
          notes: found.notes || "",
          response_type: found.input_type || cur.response_type,
        });
        setInfo(`REUSING EXISTING ITEM ${pid}`);
        setError("");
        return;
      }
    } catch (e) { /* not found -> new process id */ }
    setInfo(`NEW PROCESS ID ${pid}`);
  };

  const pickSuggestion = (it) => {
    setDraft((cur) => cur && {
      ...cur,
      process_id: it.process_id,
      statement: it.checklist_name,
      notes: it.notes || "",
      response_type: it.input_type || cur.response_type,
    });
    setSugOpen(false);
    setInfo(`REUSING EXISTING ITEM ${it.process_id}`);
    setError("");
  };

  const commitDraft = () => {
    const pid = draft.process_id.trim();
    if (draft.statement.length > STATEMENT_LIMIT) return;
    if (!draft.statement.trim()) return setError("WRITE THE ACTION STATEMENT");
    if (!draft.response_type) return setError("ADD A RESPONSE TYPE TO PROCEED");
    if (pid && items.some((it) => it.process_id === pid)) return setError(`PROCESS ID ${pid} IS ALREADY IN THIS CHECKLIST`);
    setItems([...items, { ...draft, statement: draft.statement.trim(), process_id: pid, hidden: false }]);
    setDraft(null);
    setError("");
    setInfo("");
  };

  const toggleHidden = (idx) => {
    const target = items[idx];
    if (!target.hidden && visibleItems.length <= 1) {
      return setError("AT LEAST ONE ITEM MUST STAY VISIBLE");
    }
    setError("");
    setItems(items.map((it, k) => (k === idx ? { ...it, hidden: !it.hidden } : it)));
  };

  const setItemPid = (idx, value) => {
    setError("");
    setItems(items.map((it, k) => (k === idx ? { ...it, process_id: cleanPid(value) } : it)));
  };

  const searchRowPid = (idx, value) => {
    const my = ++rowReq.current;
    if (!value) return setRowSug({ idx: null, list: [] });
    api(`/checklists/items/search?process_id=${encodeURIComponent(value)}`)
      .then((d) => { if (my === rowReq.current) setRowSug({ idx, list: (d && d.items) || [] }); })
      .catch(() => { if (my === rowReq.current) setRowSug({ idx: null, list: [] }); });
  };

  const pickRowSuggestion = (idx, found) => {
    setItems((cur) => cur.map((it, k) => (k === idx ? {
      ...it,
      item_id: found.id,
      process_id: found.process_id,
      statement: found.checklist_name,
      notes: found.notes || "",
      response_type: found.input_type || it.response_type,
      pid_locked: true,
    } : it)));
    setRowSug({ idx: null, list: [] });
    setInfo(`REUSING EXISTING ITEM ${found.process_id}`);
    setError("");
  };

  const errs = {
    title: !title.trim(),
    items: visibleItems.length === 0,
    recipients: !assignee || (teamIds.length === 0 && !legacy),
  };
  const hasErrors = Object.values(errs).some(Boolean);

  const goPreview = () => {
    setTried(true);
    if (draft) return setError("FINISH THE DRAFT ITEM (PRESS DONE)");
    const pids = items.map((it) => it.process_id).filter(Boolean);
    const dup = pids.find((p, i) => pids.indexOf(p) !== i);
    if (dup) return setError(`PROCESS ID ${dup} IS USED TWICE IN THIS CHECKLIST`);
    if (hasErrors) return;
    setError("");
    setStep("preview");
  };

  const share = async () => {
    setSaving(true);
    setError("");
    try {
      await api(isEdit ? `/checklists/${editId}` : "/checklists", {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify({
          title: title.trim(),
          items: items.map((it) => ({
            linked_item_id: it.linked_item_id,
            item_id: it.item_id,
            statement: it.statement,
            notes: it.notes.trim() || undefined,
            response_type: it.response_type,
            process_id: it.process_id || undefined,
            hidden: Boolean(it.hidden),
          })),
          assignee_type: assignee,
          team_ids: teamIds,
          due_date: due,
          recurrence,
          recurrence_ends_on: recurrence !== "NONE" ? endDate : undefined,
          recurrence_custom_days: recurrence === "CUSTOM" ? customDays.join(",") : undefined,
          workday_shift: shift,
          priority: priority || undefined,
          list_types: listTypes,
        }),
      });
      setStep("success");
      onCreated && onCreated();
    } catch (e) {
      setError(e.message);
      setStep("form");
    }
    setSaving(false);
  };

  const reset = () => {
    setTitle(""); setItems([]); setDraft(null); setAssignee(""); setTeamIds([]);
    setDue(today); setRecurrence("NONE"); setRecEnd(""); setPriority(null); setListTypes([]);
    setTried(false); setError(""); setInfo(""); setStep("form");
  };

  const teamNames = teams.filter((t) => teamIds.includes(t.id)).map((t) => t.name).join(", ");

  if (loading || loadError) {
    return (
      <div className="nc-overlay">
        <div className="nc-success" ref={fitRef} style={fitStyle}>
          <button type="button" className="nc-x" onClick={onClose} aria-label="Close">✕</button>
          {loadError ? <p className="nc-error">{loadError}</p> : <p>Loading checklist...</p>}
          {loadError && <button type="button" className="nc-ulink" onClick={onClose}>Close</button>}
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="nc-overlay">
        <div className="nc-success" ref={fitRef} style={fitStyle}>
          <button type="button" className="nc-x" onClick={onClose} aria-label="Close">✕</button>
          <div className="nc-tick"><Ico n="check" s={22} /></div>
          <p>{isEdit ? "Your checklist is updated!" : "Your checklist is created and shared!"}</p>
          {isEdit
            ? <button type="button" className="nc-ulink" onClick={onClose}>Back to checklists</button>
            : <button type="button" className="nc-ulink" onClick={reset}>Create New Checklist</button>}
        </div>
      </div>
    );
  }

  if (step === "preview") {
    const bool = visibleItems.filter((i) => i.response_type === "Boolean");
    const num = visibleItems.filter((i) => i.response_type === "Numeric");
    return (
      <div className="nc-overlay">
        <div className="nc-preview" ref={fitRef} style={fitStyle}>
          <button type="button" className="nc-x" onClick={onClose} aria-label="Close">✕</button>
          <h2 className="nc-ptitle">{title}</h2>
          <div>{listTypes.map((l) => <span key={l} className="nc-chip nc-mono">{label(LIST_TYPES, l).toUpperCase()}</span>)}</div>
          <div className="nc-pmeta">
            <span className="nc-pdate"><Ico n="cal" s={13} />
              <span className="nc-pill nc-small"><span>Entry for Today, {parse(today).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span><Ico n="chev" s={11} /></span>
            </span>
            <span className="nc-mono nc-due">
              DUE {parse(due).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
              {recurrence !== "NONE" && <> <Ico n="repeat" s={11} /> {label(RECURRENCE, recurrence).toUpperCase()}</>}
            </span>
            <span className="nc-mono nc-team"><Ico n="user" s={12} /> {teamNames.toUpperCase()}</span>
          </div>
          <hr className="nc-hr" />
          <div className="nc-pcols nc-mono"><span>SUPPORTING NOTE</span><span>INDIVIDUAL ITEM • RECORDS</span></div>
          <div className="nc-plist">
            {bool.map((it, i) => <PreviewRow key={`b${i}`} it={it} box={<span className="nc-cb" />} />)}
            {num.length > 0 && <div className="nc-qty nc-mono">QUANTITY</div>}
            {num.map((it, i) => <PreviewRow key={`n${i}`} it={it} box={<span className="nc-num nc-mono">000</span>} />)}
          </div>
          {hiddenCount > 0 && <div className="nc-hidnote nc-mono">{hiddenCount} HIDDEN ITEM{hiddenCount === 1 ? "" : "S"} NOT SHOWN TO MEMBERS</div>}
          {error && <div className="nc-error">{error}</div>}
          <div className="nc-pfoot">
            <button type="button" className="nc-back" onClick={() => setStep("form")}>← Edit Checklist</button>
            <button type="button" className="nc-share nc-auto" disabled={saving} onClick={share}>
              {saving ? (isEdit ? "Saving..." : "Sending...") : (isEdit ? "Save Changes" : "Send Checklist")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ----- form ----- */
  return (
    <div className="nc-overlay">
      <div className="nc-modal" ref={fitRef} style={fitStyle}>
        <section className="nc-left">
          <span className="nc-mono nc-tag">{isEdit ? "EDIT CHECKLIST" : "NEW CHECKLIST"}</span>
          <input
            className={`nc-title ${tried && errs.title ? "nc-invalid-line" : ""}`}
            placeholder="Enter Title"
            value={title}
            maxLength={150}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <div className="nc-itemhead">
            <button type="button" className="nc-add" onClick={() => !draft && items.length < maxItems && setDraft(emptyItem())} disabled={items.length >= maxItems}>
              <span className="nc-addico">+</span>
              <span className="nc-mono">{items.length >= maxItems ? "MAXIMUM ITEMS ADDED" : "ADD NEW ITEM"}</span>
            </button>
            {(items.length > 0 || draft) && (
              <div className="nc-rt nc-mono"><div>RESPONSE TYPE</div><div className="nc-rt-sub"><span>Yes/No</span><span>Numeric</span></div></div>
            )}
          </div>

          <div className="nc-items">
            {items.map((it, i) => (
              <div key={it.linked_item_id || `new-${i}`} className={`nc-item ${it.hidden ? "nc-hidden" : ""}`}>
                <div className="nc-itext">
                  <span>
                    {it.statement}
                    {isEdit && it.item_id && !it.pid_locked ? (
                      <input
                        className="nc-pidedit nc-mono"
                        placeholder="PROCESS ID"
                        value={it.process_id}
                        maxLength={30}
                        title="Optional. Set a Process ID (e.g. LQ_1) on this existing item."
                        onChange={(e) => { setItemPid(i, e.target.value); searchRowPid(i, cleanPid(e.target.value)); }}
                        onFocus={() => it.process_id && searchRowPid(i, it.process_id)}
                        onBlur={() => {
                          const exact = rowSug.idx === i && rowSug.list.find((x) => x.process_id === it.process_id);
                          if (exact) pickRowSuggestion(i, exact);
                          else setRowSug({ idx: null, list: [] });
                        }}
                        onKeyDown={(e) => { if (e.key === "Escape") setRowSug({ idx: null, list: [] }); }}
                      />
                    ) : (
                      it.process_id && <em className="nc-pid nc-mono">{it.process_id}</em>
                    )}
                    {it.hidden && <em className="nc-hidtag nc-mono">HIDDEN</em>}
                  </span>
                  {it.notes && <small>{it.notes}</small>}
                </div>
                {rowSug.idx === i && rowSug.list.length > 0 && (
                  <div className="nc-sugs" role="listbox">
                    <div className="nc-sug-head nc-mono">REUSE AN EXISTING ITEM</div>
                    {rowSug.list.map((f) => {
                      const used = items.some((x, k) => k !== i && x.process_id === f.process_id);
                      return (
                        <button
                          type="button"
                          key={f.id}
                          role="option"
                          className={`nc-sug ${used ? "nc-sug-used" : ""}`}
                          disabled={used}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickRowSuggestion(i, f)}
                        >
                          <span className="nc-sug-id nc-mono">{f.process_id}</span>
                          <span className="nc-sug-t">{f.checklist_name}</span>
                          <span className="nc-sug-s nc-mono">
                            {used ? "IN THIS CHECKLIST" : f.input_type === "Numeric" ? "NUMERIC" : "YES/NO"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <TypeCells type={it.response_type} />
                <button
                  type="button"
                  className="nc-hx"
                  onClick={() => toggleHidden(i)}
                  aria-label={it.hidden ? "Show item again" : "Hide item from new submissions"}
                  title={it.hidden ? "Hidden from new submissions - click to show again" : "Hide from new submissions"}
                >
                  <Ico n={it.hidden ? "eyeoff" : "eye"} s={9} />
                </button>
                <button type="button" className="nc-ix" onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label="Remove item">✕</button>
              </div>
            ))}

            {draft && (
              <div className="nc-draftwrap">
                <div className="nc-item nc-draft">
                  <div className="nc-itext">
                    <input autoFocus className={overLimit ? "nc-over" : ""} placeholder="Draft Action Statement" value={draft.statement} onChange={(e) => setD({ statement: e.target.value })} />
                    <div className="nc-subrow">
                      <input className="nc-note" placeholder="Notes (optional)" value={draft.notes} onChange={(e) => setD({ notes: e.target.value })} />
                      <input
                        className="nc-pidin nc-mono"
                        placeholder="PROCESS ID"
                        value={draft.process_id}
                        maxLength={30}
                        title="Optional. Enter an existing Process ID (e.g. LQ_1) to reuse that item."
                        onChange={(e) => { setD({ process_id: cleanPid(e.target.value) }); setInfo(""); setSugOpen(true); }}
                        onFocus={() => setSugOpen(true)}
                        onBlur={() => { setSugOpen(false); lookupProcess(); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); setSugOpen(false); lookupProcess(); }
                          if (e.key === "Escape") setSugOpen(false);
                        }}
                      />
                      {sugOpen && sugs.length > 0 && (
                        <div className="nc-sugs" role="listbox">
                          <div className="nc-sug-head nc-mono">REUSE AN EXISTING ITEM</div>
                          {sugs.map((it) => {
                            const used = items.some((x) => x.process_id === it.process_id);
                            return (
                              <button
                                type="button"
                                key={it.id}
                                role="option"
                                className={`nc-sug ${used ? "nc-sug-used" : ""}`}
                                disabled={used}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => pickSuggestion(it)}
                              >
                                <span className="nc-sug-id nc-mono">{it.process_id}</span>
                                <span className="nc-sug-t">{it.checklist_name}</span>
                                <span className="nc-sug-s nc-mono">
                                  {used ? "IN THIS CHECKLIST" : it.input_type === "Numeric" ? "NUMERIC" : "YES/NO"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <TypeCells type={draft.response_type} onPick={(v) => setD({ response_type: v })} />
                  <span className="nc-eyeph" aria-hidden="true" />
                </div>
                <button type="button" className="nc-ulink nc-donelink" onClick={commitDraft}>Done</button>
              </div>
            )}
          </div>

          <div className="nc-lfoot nc-mono">
            {overLimit ? <span className="nc-warn"><Ico n="warn" s={8} />CHARACTER LIMIT EXCEEDED. KEEP IT SHORT AND EASY TO UNDERSTAND.</span>
              : error ? <span className="nc-warn">{error}</span>
              : info ? <span>{info}</span>
              : tried && hasErrors ? <span className="nc-warn">COMPLETE REQUIRED INFORMATION TO CREATE AN EFFECTIVE CHECKLIST</span>
              : isEmpty ? <span>TIP: Keeping it to {maxItems} items makes the list easier to follow + easier to finish!</span>
              : <span>
                  {items.length} CHECKLIST ITEM{items.length === 1 ? "" : "S"}
                  {hiddenCount > 0 ? ` • ${hiddenCount} HIDDEN` : ""}
                </span>}
          </div>
        </section>

        <aside className="nc-right">
          <div className="nc-topbar">
            {canToggle && (
              <button type="button" className="nc-ulink nc-sm" onClick={() => setShowGuide(!showGuide)}>{showGuide ? "Hide Guide" : "Show Guide"}</button>
            )}
            <button type="button" className="nc-x-s" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {showGuide ? (
            <div className={`nc-guide ${canToggle ? "nc-guide-low" : ""}`}>
              <h3>{guide.heading}</h3>
              {guide.sections.map((s) => {
                const bullets = s.bullets && <ul>{s.bullets.map((b) => <li key={b}>{b}</li>)}</ul>;
                const text = s.text && <p>{s.text}</p>;
                const textFirst = s.text && s.text.trim().endsWith(":");
                return (
                  <div className="nc-sec" key={s.title}>
                    <div className="nc-mono nc-sec-t">{s.title}</div>
                    {textFirst ? <>{text}{bullets}</> : <>{bullets}{text}</>}
                  </div>
                );
              })}
              <div className="nc-sec">
                <div className="nc-mono nc-sec-t">HIDE ITEMS YOU DON'T NEED</div>
                <p>Use the eye icon on a row to hide it from new submissions. Past answers are kept.</p>
              </div>
              <div className="nc-mono nc-sec-t nc-ex-title">EXAMPLES</div>
              <div className="nc-examples">
                {guide.examples.map((ex) => (
                  <div className="nc-ex" key={ex.label}>
                    <div>{ex.label}{ex.note && <small>{ex.note}</small>}</div>
                    <span className="nc-mono nc-ex-t">{ex.type}<b>{ex.type === "Numeric" ? "000" : "✓"}</b></span>
                  </div>
                ))}
              </div>
              {isEmpty && (
                <button type="button" className="nc-first" onClick={() => setShowGuide(false)}>Share your first checklist →</button>
              )}
            </div>
          ) : (
            <>
              <div className="nc-details">
                <div className="nc-mono nc-tag">DETAILS</div>

                <Field icon="user" placeholder="Select recipients" invalid={tried && errs.recipients}
                  text={assignee
                    ? legacy && teamIds.length === 0
                      ? `${assignee === "MEMBER" ? "Members" : "Group"} • by position`
                      : `${assignee === "MEMBER" ? "Members" : "Group"} in ${teamIds.length} Team${teamIds.length === 1 ? "" : "s"}`
                    : ""}>
                  {(close) => <RecipientMenu teams={teams} assignee={assignee} teamIds={teamIds} close={close}
                    onApply={(a, ids) => { setAssignee(a); setTeamIds(ids); }} />}
                </Field>

                <Field icon="cal" text={`Due ${due === today ? "Today • " : ""}${longDate(due)}`}
                  sub={
                    <Field icon="repeat" placeholder="Add Frequency" text={recurrence !== "NONE" ? <>{label(RECURRENCE, recurrence)}<small className="nc-ends">ends {endFmt(endDate)}</small></> : ""}>
                      {(close) => (
                        <div className="nc-menu">
                          {recurrence !== "NONE" && (
                            <label className="nc-endrow">
                              <span>Ends on</span>
                              <input type="date" min={due} value={endDate} onChange={(e) => setRecEnd(e.target.value)} />
                            </label>
                          )}
                          <button type="button" className={`nc-opt ${recurrence === "NONE" ? "on" : ""}`} onClick={() => { setRecurrence("NONE"); close(); }}>None</button>
                          {recurrence === "CUSTOM" && (
                            <div className="nc-workdays">
                              <div className="nc-menu-title">Set Up Workdays</div>
                              <div className="nc-days">
                                {DAYS.map(([k, l]) => <button type="button" key={k} className={customDays.includes(k) ? "on" : ""} onClick={() => setCustomDays(toggle(customDays, k))}>{l}</button>)}
                              </div>
                              <label className="nc-check nc-tiny">
                                <input type="checkbox" checked={shift} onChange={(e) => setShift(e.target.checked)} />
                                Checklists due on non-working days shift to the next workday
                              </label>
                            </div>
                          )}
                          {RECURRENCE.filter(([k]) => k !== "NONE").map(([k, v]) => (
                            <button type="button" key={k} className={`nc-opt ${recurrence === k ? "on" : ""}`} onClick={() => { setRecurrence(k); if (k !== "CUSTOM") close(); }}>{v}</button>
                          ))}
                        </div>
                      )}
                    </Field>
                  }>
                  {(close) => <DateMenu value={due} onApply={setDue} close={close} />}
                </Field>

                <Field icon="bell" placeholder="Select Priority (Optional)" text={priority ? `${label(PRIORITY, priority)} Priority` : ""}>
                  {(close) => (
                    <div className="nc-menu">
                      {PRIORITY.map(([k, v, bang]) => (
                        <button type="button" key={v} className={`nc-opt ${priority === k ? "on" : ""}`} onClick={() => { setPriority(k); close(); }}>
                          {bang && <b className="nc-bang">{bang}</b>}{v}
                        </button>
                      ))}
                    </div>
                  )}
                </Field>

                <Field up icon="folder" placeholder="Assign List Type (Optional)" text={listTypes.map((l) => label(LIST_TYPES, l)).join(", ")}>
                  {(close) => <ListTypeMenu value={listTypes} onApply={setListTypes} close={close} />}
                </Field>
              </div>

              <div className="nc-rfoot">
                <button type="button" className="nc-ulink nc-sm" onClick={goPreview}>View Preview</button>
                <button type="button" className="nc-share" onClick={goPreview}>{isEdit ? "Save Changes" : "Share Checklist"}</button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}