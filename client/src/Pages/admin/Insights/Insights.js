import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Insights.css";

const BASE_URL = process.env.REACT_APP_BACKEND_SERVER_URL || "http://localhost:5002";
const HOME_ROUTE = "/workspace"; 
const MAX_RANGE_DAYS = 90; 
const api = async (path, method = "GET", body) => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || "Something went wrong.");
    e.status = res.status;
    throw e;
  }
  return data;
};

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const shiftDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const fmt = (n) =>
  n === null || n === undefined ? "-" : Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const prettyDay = (s) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
const periodLabel = (p, groupBy) => {
  if (groupBy === "month") {
    const [y, m] = p.split("-");
    return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }
  if (groupBy === "week") return `Week of ${prettyDay(p)}`;
  return prettyDay(p);
};

const PRESETS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["custom", "Custom"]];
const GROUPS = [["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"]];
const ENTRIES_LIMIT = 300;

const csvCell = (v) => {
  let s = String(v ?? "");
  if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

function Select({ value, onChange, options, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const outside = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("touchstart", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("touchstart", outside);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const current = options.find(([k]) => String(k) === String(value));

  return (
    <div className={`in-select ${open ? "in-select-open" : ""}`} ref={ref}>
      <button
        type="button"
        className="in-select-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(!open)}
      >
        <span>{current ? current[1] : ""}</span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <ul className="in-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map(([k, v]) => (
            <li key={k === "" ? "__all" : k}>
              <button
                type="button"
                role="option"
                aria-selected={String(k) === String(value)}
                className={`in-select-opt ${String(k) === String(value) ? "on" : ""}`}
                onClick={() => { onChange(String(k)); setOpen(false); }}
              >
                {v}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Bars({ series, groupBy }) {
  const max = Math.max(1, ...series.map((s) => s.value));
  return (
    <div className="in-chart">
      <div className={`in-bars ${series.length > 60 ? "in-dense" : ""}`} role="img" aria-label="Trend">
        {series.map((s) => {
          const has = s.value > 0;
          const pct = has ? Math.max(8, (s.value / max) * 100) : 0;
          return (
            <div
              key={s.period}
              className="in-col"
              title={`${periodLabel(s.period, groupBy)}: ${fmt(s.value)} (${s.entries} ${s.entries === 1 ? "entry" : "entries"})`}
            >
              <span className={has ? "in-bar" : "in-bar in-zero"} style={has ? { height: `${pct}%` } : undefined} />
            </div>
          );
        })}
      </div>
      <div className="in-axis in-mono">
        <span>{series.length ? periodLabel(series[0].period, groupBy) : ""}</span>
        <span>{series.length > 1 ? periodLabel(series[series.length - 1].period, groupBy) : ""}</span>
      </div>
    </div>
  );
}

function Entries({ state }) {
  if (!state || state.loading) return <div className="in-note in-mono">LOADING ENTRIES...</div>;
  if (state.error) return <div className="in-note in-mono in-err">{state.error.toUpperCase()}</div>;
  if (state.list.length === 0) return <div className="in-note in-mono">NO ENTRIES IN THIS RANGE</div>;
  return (
    <>
      <table className="in-etable">
        <thead>
          <tr><th>Date</th><th>Answer</th><th>By</th><th>Checklist</th><th>Note</th></tr>
        </thead>
        <tbody>
          {state.list.map((e) => (
            <tr key={e.id}>
              <td>{prettyDay(e.date)}</td>
              <td>{e.input === null || e.input === "" ? "-" : e.input}</td>
              <td>{e.user}</td>
              <td>{e.checklist}</td>
              <td>{e.comments || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.list.length >= ENTRIES_LIMIT && (
        <div className="in-note in-mono">SHOWING LATEST {ENTRIES_LIMIT} ENTRIES</div>
      )}
    </>
  );
}

export default function Insights() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState("30");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(iso(new Date()));
  const [groupBy, setGroupBy] = useState("day");
  const [teamId, setTeamId] = useState("");
  const [teams, setTeams] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [entries, setEntries] = useState({});
  const [editing, setEditing] = useState(null); 
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const reqId = useRef(0); 

  const query = useMemo(() => {
    const q = new URLSearchParams({ from, to, group_by: groupBy });
    if (teamId) q.set("team_id", teamId);
    return q.toString();
  }, [from, to, groupBy, teamId]);

  const teamOptions = useMemo(
    () => [["", "All teams"], ...teams.map((t) => [String(t.id), t.name])],
    [teams]
  );

  const pickPreset = (p) => {
    setPreset(p);
    if (p !== "custom") { setFrom(daysAgo(Number(p) - 1)); setTo(iso(new Date())); }
  };

  const changeFrom = (v) => {
    if (!v) return;
    setFrom(v);
  };
  const changeTo = (v) => {
    if (!v) return;
    setTo(v);
    const earliest = shiftDays(v, -MAX_RANGE_DAYS);
    if (from < earliest) setFrom(earliest);
  };

  useEffect(() => {
    api("/teams").then((d) => setTeams(Array.isArray(d) ? d : d.teams || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError("");
    setOpen(null);
    setEntries({});
    setEditing(null);
    try {
      const d = await api(`/insights/processes?${query}`);
      if (id !== reqId.current) return;
      setData(d);
    } catch (e) {
      if (id !== reqId.current) return;
      if (e.status === 401) return navigate("/", { replace: true });
      if (e.status === 403) return navigate("/my-workspace", { replace: true });
      setError(e.message);
    }
    setLoading(false);
  }, [query, navigate]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (pid) => {
    if (open === pid) return setOpen(null);
    setOpen(pid);
    if (entries[pid]) return;
    const startedWith = reqId.current;
    setEntries((s) => ({ ...s, [pid]: { loading: true } }));
    try {
      const d = await api(`/insights/processes/${encodeURIComponent(pid)}/entries?${query}`);
      if (startedWith !== reqId.current) return;
      setEntries((s) => ({ ...s, [pid]: { list: d.entries } }));
    } catch (e) {
      if (startedWith !== reqId.current) return;
      setEntries((s) => ({ ...s, [pid]: { error: e.message } }));
    }
  };

  const groups = useMemo(() => {
    const m = new Map();
    ((data && data.processes) || []).forEach((p) => {
      if (!m.has(p.group)) m.set(p.group, { name: p.group_name || "", list: [] });
      m.get(p.group).list.push(p);
    });
    return [...m.entries()];
  }, [data]);

  const startEdit = (group, name) => {
    setEditing(group);
    setDraft(name || "");
    setError("");
  };

  const saveName = async (group) => {
    const name = draft.trim();
    setSaving(true);
    setError("");
    try {
      const path = `/insights/business-processes/${encodeURIComponent(group)}`;
      if (name) await api(path, "PUT", { name });
      else await api(path, "DELETE");
      setData((d) => ({
        ...d,
        processes: d.processes.map((p) => (p.group === group ? { ...p, group_name: name || null } : p)),
      }));
      setEditing(null);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  const exportCsv = () => {
    if (!data) return;
    const lines = [["process_id", "business_process_code", "business_process", "item", "type", "period", "value", "entries"].join(",")];
    data.processes.forEach((p) =>
      p.series.forEach((s) =>
        lines.push(
          [p.process_id, p.group, p.group_name || "", p.name, p.input_type === "Boolean" ? "Yes/No (count of Yes)" : "Numeric (sum)", s.period, s.value, s.entries]
            .map(csvCell)
            .join(",")
        )
      )
    );
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `insights-by-process-${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onRowKey = (e, pid) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(pid); }
  };

  return (
    <div className="in-page">
      <div className="in-shell">
        <div className="in-topbar">
          <button type="button" className="in-link" onClick={() => navigate(HOME_ROUTE)}>← Back</button>
          <span className="in-mono in-tag">INSIGHTS</span>
        </div>

        <div className="in-head">
          <div>
            <h1>Insights by Process ID</h1>
            <p>Answers grouped by Process ID, so the same item is tracked across every checklist.</p>
          </div>
          <button type="button" className="in-btn" onClick={exportCsv} disabled={!data || loading}>Export CSV</button>
        </div>

        <div className="in-filters">
          <div className="in-seg">
            {PRESETS.map(([k, v]) => (
              <button type="button" key={k} className={preset === k ? "on" : ""} onClick={() => pickPreset(k)}>{v}</button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="in-dates">
              <input
                type="date"
                value={from}
                min={shiftDays(to, -MAX_RANGE_DAYS)}
                max={to}
                onChange={(e) => changeFrom(e.target.value)}
              />
              <span>to</span>
              <input
                type="date"
                value={to}
                min={from}
                max={iso(new Date())}
                onChange={(e) => changeTo(e.target.value)}
              />
            </div>
          )}
          <Select ariaLabel="Group by" value={groupBy} onChange={setGroupBy} options={GROUPS} />
          <Select ariaLabel="Team" value={teamId} onChange={setTeamId} options={teamOptions} />
        </div>

        {error && <div className="in-note in-mono in-err">{error.toUpperCase()}</div>}
        {loading && <div className="in-note in-mono">LOADING...</div>}

        {!loading && data && (
          <>
            {data.team_members === 0 && (
              <div className="in-note in-mono in-err">
                THIS TEAM HAS NO MEMBERS. ADD MEMBERS TO THE TEAM TO SEE ITS ANSWERS.
              </div>
            )}

            <div className="in-summary">
              <div><b>{data.summary.processes}</b><span className="in-mono">PROCESS IDS</span></div>
              <div><b>{data.summary.with_data}</b><span className="in-mono">WITH DATA</span></div>
              <div><b>{fmt(data.summary.entries)}</b><span className="in-mono">ENTRIES</span></div>
              <div><b>{data.summary.contributors}</b><span className="in-mono">CONTRIBUTORS</span></div>
            </div>

            {groups.length === 0 && (
              <div className="in-empty">
                <p>No Process IDs yet.</p>
                <small>Add a Process ID (e.g. LQ_1) to an item while creating a checklist, and its answers will show up here.</small>
              </div>
            )}

            {groups.map(([group, { name, list }]) => (
              <section className="in-group" key={group}>
                <h2>
                  <span className="in-chip in-mono">{group}</span>

                  {editing === group ? (
                    <span className="in-edit">
                      <input
                        autoFocus
                        value={draft}
                        maxLength={100}
                        placeholder="Business process name"
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveName(group);
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                      <button type="button" className="in-mini in-mini-on" disabled={saving} onClick={() => saveName(group)}>
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button type="button" className="in-mini" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
                    </span>
                  ) : (
                    <>
                      <span>{name || "Business Process"}</span>
                      <button type="button" className="in-mini" onClick={() => startEdit(group, name)}>
                        {name ? "Rename" : "Set name"}
                      </button>
                    </>
                  )}

                  <small>{list.length} Process ID{list.length === 1 ? "" : "s"}</small>
                </h2>

                {list.map((p) => (
                  <div className={`in-proc ${open === p.process_id ? "in-open" : ""}`} key={p.process_id}>
                    <div
                      role="button"
                      tabIndex={0}
                      className="in-prow"
                      onClick={() => toggle(p.process_id)}
                      onKeyDown={(e) => onRowKey(e, p.process_id)}
                      aria-expanded={open === p.process_id}
                    >
                      <div className="in-pname">
                        <span className="in-pid in-mono">{p.process_id}</span>
                        <span>{p.name}</span>
                        <small>{p.checklists.length > 0 ? `Used in: ${p.checklists.join(", ")}` : "No answers in this range"}</small>
                        {p.type_conflict && (
                          <small className="in-err">
                            Warning: this Process ID has items with different answer types (Numeric and Yes/No).
                            Only {p.input_type === "Numeric" ? "Numeric" : "Yes/No"} answers are counted
                            {p.skipped_mismatch > 0 ? `; ${p.skipped_mismatch} other answers skipped` : ""}.
                          </small>
                        )}
                        {(p.item_names || []).length > 1 && !p.type_conflict && (
                          <small>{p.item_names.length} items share this ID: {p.item_names.join(" / ")}</small>
                        )}
                      </div>

                      <div className="in-stat">
                        <b>{p.input_type === "Numeric" ? fmt(p.total) : `${fmt(p.yes)} Yes`}</b>
                        <span className="in-mono">{p.input_type === "Numeric" ? "TOTAL" : `${fmt(p.no)} NO`}</span>
                      </div>
                      <div className="in-stat">
                        <b>{p.input_type === "Numeric" ? fmt(p.average) : p.yes_rate === null ? "-" : `${fmt(p.yes_rate)}%`}</b>
                        <span className="in-mono">{p.input_type === "Numeric" ? "AVERAGE" : "YES RATE"}</span>
                      </div>
                      <div className="in-stat">
                        <b>{fmt(p.entries)}</b>
                        <span className="in-mono">ENTRIES</span>
                      </div>
                      <div className="in-stat">
                        <b>{p.contributors}</b>
                        <span className="in-mono">PEOPLE</span>
                      </div>
                      <div className="in-trend"><Bars series={p.series} groupBy={data.group_by} /></div>
                    </div>

                    {open === p.process_id && (
                      <div className="in-detail">
                        <div className="in-dhead in-mono">
                          <span>
                            {p.input_type === "Numeric" ? "NUMERIC" : "YES / NO"} • LAST ENTRY {prettyDay(p.last_entry).toUpperCase()}
                          </span>
                        </div>
                        {(p.by_checklist || []).length > 1 && (
                          <div className="in-dhead in-mono">
                            <span>
                              BY CHECKLIST: {p.by_checklist.map((c) => `${c.name.toUpperCase()} (${c.entries})`).join(" • ")}
                            </span>
                          </div>
                        )}
                        <Entries state={entries[p.process_id]} />
                      </div>
                    )}
                  </div>
                ))}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}