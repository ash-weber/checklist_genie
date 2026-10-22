import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./SubmitChecklistModal.css";

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

const LIST_TYPE = {
  ONBOARDING: "Onboarding", COMPLIANCE_AUDIT: "Compliance & Audit",
  MAINTENANCE: "Maintenance", QUALITY_ASSURANCE: "Quality Assurance",
  SAFETY_CHECKS: "Safety Checks", DAILY_OPERATIONS: "Daily Operations",
};
const RECURRENCE = {
  WORKDAYS: "WEEKDAYS", WEEKLY: "WEEKLY", FORTNIGHTLY: "FORTNIGHTLY",
  MONTHLY: "MONTHLY", QUARTERLY: "EVERY 3 MONTHS", HALF_YEARLY: "EVERY 6 MONTHS",
  YEARLY: "YEARLY", CUSTOM: "CUSTOM",
};

const ICON = {
  cal: "M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2v3M10.5 2v3",
  repeat: "M3 7V6a2 2 0 012-2h7l-2-2M13 9v1a2 2 0 01-2 2H4l2 2",
  user: "M8 8a3 3 0 100-6 3 3 0 000 6zM2.5 14c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5",
  chev: "M4 6l4 4 4-4",
  check: "M3 8.5l3 3 7-7",
  x: "M3.5 3.5l9 9M12.5 3.5l-9 9", 
};
const Ico = ({ n, s = 14 }) => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICON[n]} />
  </svg>
);

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtLong = (s) => parse(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const snap = (v) => JSON.stringify([String(v.input ?? ""), (v.note || "").trim()]);
const EMPTY = { input: "", note: "" };

const MAIL_NOTE = {
  no_recipients: "Saved, but no email was sent: nobody is set up on the Recipients page.",
  failed: "Saved, but the email could not be sent. Please tell your admin.",
  mailer_missing: "Saved, but the email service is not available. Please tell your admin.",
};

function useFit(dep) {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () =>
      setScale(Math.min(1, (window.innerWidth - 32) / el.offsetWidth, (window.innerHeight - 32) / el.offsetHeight));
    fit();
    window.addEventListener("resize", fit);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => { window.removeEventListener("resize", fit); ro.disconnect(); };
  }, [dep]);
  return [ref, { transform: `scale(${scale})` }];
}

function NoteBox({ value, editing, onEdit, onChange, onClose }) {
  if (editing) {
    return (
      <div className="sc-note sc-note-edit">
        <textarea
          autoFocus
          maxLength={300}
          value={value}
          placeholder="Why could / couldn't this item be completed?"
          onChange={(e) => onChange(e.target.value)}
          onBlur={onClose}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onClose(); } }}
        />
      </div>
    );
  }
  const has = value.trim();
  return (
    <button type="button" className={`sc-note ${has ? "sc-has" : ""}`} onClick={onEdit}>
      {has || "+"}
    </button>
  );
}

export default function SubmitChecklistModal({ checklistId, dueDate, onClose, onDone }) {
  const today = iso(new Date());
  const [entryDate, setEntryDate] = useState(today);
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [vals, setVals] = useState({});
  const [sent, setSent] = useState({});
  const [entries, setEntries] = useState({});
  const [noteOpen, setNoteOpen] = useState(null);
  const [step, setStep] = useState("fill"); 
  const [tried, setTried] = useState(false);
  const [history, setHistory] = useState(false); 
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mailNote, setMailNote] = useState("");
  const richRef = useRef(null);
  const dateRef = useRef(null);

  const [fitRef, fitStyle] = useFit(`${step}-${data ? 1 : 0}`);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    let alive = true;
    setData(null);
    setLoadErr("");
    setError("");
    setTried(false);
    api(`/my-checklists/${checklistId}?date=${entryDate}`)
      .then((d) => {
        if (!alive) return;
        const v = {}, s = {}, e = {};
        d.items.forEach((it) => {
          const id = it.linked_item_id;
          const input = it.response_type === "Boolean"
            ? (it.existing_input === "Yes" ? "Yes" : "")
            : (it.existing_input ?? "");
          v[id] = { input, note: it.existing_comments || "" };
          if (it.entries_count > 0) { s[id] = snap(v[id]); e[id] = it.entries_count; }
        });
        setVals(v); setSent(s); setEntries(e); setData(d);
      })
      .catch((err) => alive && setLoadErr(err.message));
    return () => { alive = false; };
  }, [checklistId, entryDate]);

  const items = data ? data.items : [];
  const bools = items.filter((i) => i.response_type === "Boolean");
  const nums = items.filter((i) => i.response_type === "Numeric");

  const val = (it) => vals[it.linked_item_id] || EMPTY;
  const setVal = (id, patch) => setVals((s) => ({ ...s, [id]: { ...(s[id] || EMPTY), ...patch } }));
  const isReady = (it) => {
    const v = val(it);
    const answered = it.response_type === "Boolean" ? v.input === "Yes" : String(v.input).trim() !== "";
    return answered || v.note.trim() !== "";
  };
  const isSent = (it) => sent[it.linked_item_id] === snap(val(it));
  const toPayload = (it) => {
    const v = val(it);
    const raw = String(v.input).trim();
    return {
      linked_item_id: it.linked_item_id,
      input: it.response_type === "Boolean" ? (v.input === "Yes" ? "Yes" : "No") : (raw === "" ? null : raw),
      comments: v.note.trim() || undefined,
    };
  };

  const pending = items.filter((it) => isReady(it) && !isSent(it));
  const notReady = items.filter((it) => !isReady(it));
  const showWarn = tried && notReady.length > 0;

  const sendItems = async (list) => {
    if (!list.length || busy) return;
    setBusy(true);
    setError("");
    const snaps = Object.fromEntries(list.map((it) => [it.linked_item_id, snap(val(it))]));
    try {
      const r = await api("/submissions/items", {
        method: "POST",
        body: JSON.stringify({ checklist_template_id: data.id, selected_date: entryDate, responses: list.map(toPayload) }),
      });
      setSent((s) => ({ ...s, ...snaps }));
      setEntries((e) => ({ ...e, ...(r.entries || {}) }));
    } catch (e) {
      setError(e.message.toUpperCase());
    }
    setBusy(false);
  };

  const goFinal = () => {
    setError("");
    if (notReady.length > 0) { setTried(true); return; }
    setStep("final");
  };

  const sendChecklist = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api("/submissions", {
        method: "POST",
        body: JSON.stringify({
          checklist_template_id: data.id,
          selected_date: entryDate,
          notes_html: richRef.current ? richRef.current.innerHTML : "",
          include_history: history,
          responses: items.map(toPayload),
        }),
      });
      setMailNote(MAIL_NOTE[res.email_status] || "");
      setStep("success");
      onDone && onDone();
    } catch (e) {
      setError(e.message.toUpperCase());
    }
    setBusy(false);
  };

  const exec = (cmd) => { if (richRef.current) richRef.current.focus(); document.execCommand(cmd); };
  const openDate = () => {
    const el = dateRef.current;
    if (!el) return;
    if (el.showPicker) el.showPicker(); else el.focus();
  };

  const due = dueDate || (data && data.due_date ? data.due_date.slice(0, 10) : "");

  const renderRow = (it) => {
    const id = it.linked_item_id;
    const v = val(it);
    const numeric = it.response_type === "Numeric";
    const sentNow = isSent(it);
    const can = isReady(it) && !sentNow;
    const bad = tried && !isReady(it);
    const n = entries[id] || 0;
    return (
      <div key={id} className={`sc-row ${numeric ? "sc-num" : ""} ${bad ? "sc-bad" : ""}`}>
        {numeric ? (
          <input
            className={`sc-numin sc-mono ${String(v.input).trim() ? "sc-on" : ""}`}
            inputMode="decimal"
            placeholder="000"
            value={v.input}
            onChange={(e) => setVal(id, { input: e.target.value.replace(/[^0-9.-]/g, "") })}
          />
        ) : (
          <button type="button" className={`sc-cb ${v.input === "Yes" ? "sc-on" : ""}`} aria-label="Mark as done"
            onClick={() => setVal(id, { input: v.input === "Yes" ? "" : "Yes" })}>
            {v.input === "Yes" && <Ico n="check" s={13} />}
          </button>
        )}
        <div className="sc-text">
          <div>{it.statement}</div>
          {it.notes && <small>{it.notes}</small>}
        </div>
        <NoteBox
          value={v.note}
          editing={noteOpen === id}
          onEdit={() => setNoteOpen(id)}
          onChange={(note) => setVal(id, { note })}
          onClose={() => setNoteOpen(null)}
        />
        <div className="sc-sendc">
          {sentNow ? <span className="sc-sent">Item Sent</span>
            : can ? <button type="button" className="sc-send" disabled={busy} onClick={() => sendItems([it])}>Send</button>
            : <span className="sc-send sc-off">Send</span>}
        </div>
        <div className="sc-recc">{n > 0 && <span className="sc-rec">{n} {n === 1 ? "entry" : "entries"}</span>}</div>
      </div>
    );
  };

  if (step === "success") {
    return (
      <div className="sc-overlay">
        <div className="sc-success" ref={fitRef} style={fitStyle}>
          <button type="button" className="sc-x" onClick={onClose} aria-label="Close"><Ico n="x" s={20} /></button>
          <div className="sc-tick"><Ico n="check" s={34} /></div>
          <p>Your checklist is sent successfully!</p>
          {mailNote && <p className="sc-mailnote">{mailNote}</p>}
          <button type="button" className="sc-ulink" onClick={onClose}>Submit another Checklist</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sc-overlay">
      <div className="sc-modal" ref={fitRef} style={fitStyle}>
        <button type="button" className="sc-x" onClick={onClose} aria-label="Close"><Ico n="x" s={20} /></button>
        <h2 className="sc-title">{data ? data.title : "\u00A0"}</h2>
        <div>
          {data && data.list_types.map((l) => (
            <span key={l} className="sc-chip sc-mono">{(LIST_TYPE[l] || l).toUpperCase()}</span>
          ))}
        </div>

        <div className="sc-meta">
          <span className="sc-pdate">
            <Ico n="cal" s={16} />
            <button type="button" className="sc-pill" onClick={openDate}>
              <span>Entry for {entryDate === today ? "Today, " : ""}{fmtLong(entryDate)}</span><Ico n="chev" s={12} />
            </button>
            <input ref={dateRef} className="sc-datein" type="date" max={today} value={entryDate}
              onChange={(e) => e.target.value && setEntryDate(e.target.value)} tabIndex={-1} />
          </span>
          {due && (
            <span className="sc-mono sc-due">
              DUE {fmtLong(due).toUpperCase()}
              {data && RECURRENCE[data.recurrence] && <> <Ico n="repeat" s={13} /> {RECURRENCE[data.recurrence]}</>}
            </span>
          )}
          {data && data.my_team_names.length > 0 && (
            <span className="sc-mono sc-team"><Ico n="user" s={14} /> {data.my_team_names.join(", ").toUpperCase()}</span>
          )}
        </div>
        <hr className="sc-hr" />

        <div className="sc-cols sc-mono"><span>SUPPORTING NOTE</span><span>INDIVIDUAL ITEM • RECORDS</span></div>

        <div className="sc-list">
          {loadErr && <div className="sc-state sc-err sc-mono">{loadErr.toUpperCase()}</div>}
          {!loadErr && !data && <div className="sc-state sc-mono">LOADING...</div>}
          {data && items.length === 0 && <div className="sc-state sc-mono">NO ITEMS IN THIS CHECKLIST</div>}
          {bools.map(renderRow)}
          {nums.length > 0 && <div className="sc-qty sc-mono">QUANTITY</div>}
          {nums.map(renderRow)}
        </div>

        <div className="sc-foot">
          <div className="sc-footl">
            {error && step !== "final" ? <span className="sc-err sc-mono">{error}</span>
              : showWarn ? (
                <div className="sc-warnbox sc-mono">
                  <div>COMPLETE CHECKLIST</div>
                  <div>If you can't check off an item, leave a note to help keep the workflow on track.</div>
                </div>
              )
              : pending.length > 0 ? <button type="button" className="sc-ulink" disabled={busy} onClick={() => sendItems(pending)}>Send Completed Items</button>
              : <span className="sc-tip sc-mono"><b>TIP</b>If you can't check off an item, leave a note to help keep the workflow on track.</span>}
          </div>

          {step !== "final" && (
            <button type="button" className="sc-share" disabled={busy || !data || items.length === 0} onClick={goFinal}>
              Send Checklist
            </button>
          )}
        </div>

        <div className={`sc-final ${step === "final" ? "" : "sc-hide"}`}>
          <div className="sc-ftitle">Before you send</div>
          <label className="sc-flabel sc-mono">CHECKLIST NOTE (OPTIONAL) • INCLUDED IN THE EMAIL</label>
          <div className="sc-tools" onMouseDown={(e) => e.preventDefault()}>
            <button type="button" onClick={() => exec("bold")} aria-label="Bold"><b>B</b></button>
            <button type="button" onClick={() => exec("italic")} aria-label="Italic"><i>I</i></button>
            <button type="button" onClick={() => exec("underline")} aria-label="Underline"><u>U</u></button>
            <button type="button" onClick={() => exec("insertUnorderedList")} aria-label="Bullet list">•≡</button>
          </div>
          <div
            ref={richRef}
            className="sc-rich"
            contentEditable
            suppressContentEditableWarning
            data-ph="Add a note for this checklist..."
            onPaste={(e) => {
              e.preventDefault();
              document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
            }}
          />
          <label className="sc-check">
            <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />
            <span>Include 5-day history <small>(adds the last 4 days of entries, without comments)</small></span>
          </label>
          {error && step === "final" && <div className="sc-err sc-mono">{error}</div>}
          <div className="sc-factions">
            <button type="button" className="sc-ulink" onClick={() => { setError(""); setStep("fill"); }}>Back</button>
            <button type="button" className="sc-share sc-auto" disabled={busy} onClick={sendChecklist}>
              {busy ? "Sending..." : "Send Checklist"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}