import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Teams.css";

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
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong.");
    err.status = res.status;
    throw err;
  }
  return data;
};

export default function Teams() {
  const navigate = useNavigate();
  const [org, setOrg] = useState("");
  const [teams, setTeams] = useState([]);
  const [orgMembers, setOrgMembers] = useState([]);
  const [members, setMembers] = useState([]);
  const [selId, setSelId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [pick, setPick] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = teams.find((t) => t.id === selId) || null;
  const isMax = teams.length >= MAX_TEAMS;

  const fail = useCallback((e) => {
    if (e.status === 401) return navigate("/", { replace: true });
    setError(e.message);
    return undefined;
  }, [navigate]);

  const loadTeams = useCallback(async () => {
    const d = await api("/teams");
    const list = Array.isArray(d) ? d : d.teams || [];
    setTeams(list);
    return list;
  }, []);

  const loadMembers = useCallback(async (teamId) => {
    if (!teamId) { setMembers([]); return; }
    const d = await api(`/teams/${teamId}/members`);
    setMembers(d.members || []);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("token")) { navigate("/", { replace: true }); return; }
    (async () => {
      try {
        const s = await api("/onboarding/status");
        if (s.isAdmin === false) { navigate("/my-workspace", { replace: true }); return; }
        setOrg(s.group_name || "");
        const list = await loadTeams();
        if (list.length) setSelId(list[0].id);
        const m = await api("/teams/org-members");
        setOrgMembers(m.members || []);
      } catch (e) { fail(e); }
      setLoaded(true);
    })();
  }, [navigate, loadTeams, fail]);

  useEffect(() => {
    setRenaming(false);
    setConfirmDel(false);
    setPick("");
    loadMembers(selId).catch(fail);
  }, [selId, loadMembers, fail]);

  const available = useMemo(
    () => orgMembers.filter((m) => !members.some((x) => x.organisation_user_id === m.organisation_user_id)),
    [orgMembers, members]
  );

  const run = async (fn, okMessage) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      if (okMessage) setNotice(okMessage);
    } catch (e) {
      fail(e);
    }
    setBusy(false);
  };

  const addTeam = () => {
    const name = newName.trim();
    if (!name || isMax) return;
    run(async () => {
      const d = await api("/teams", { method: "POST", body: JSON.stringify({ name }) });
      await loadTeams();
      setNewName("");
      setSelId(d.team.id);
    }, "Team created.");
  };

  const saveRename = () => {
    const name = renameVal.trim();
    if (!name) return setError("Team name is required.");
    if (name === selected.name) return setRenaming(false);
    run(async () => {
      await api(`/teams/${selId}`, { method: "PUT", body: JSON.stringify({ name }) });
      await loadTeams();
      setRenaming(false);
    }, "Team renamed.");
  };

  const deleteTeam = () =>
    run(async () => {
      await api(`/teams/${selId}`, { method: "DELETE" });
      const list = await loadTeams();
      setConfirmDel(false);
      setSelId(list.length ? list[0].id : null);
    }, "Team deleted.");

  const addMember = () => {
    if (!pick) return;
    run(async () => {
      await api(`/teams/${selId}/members`, {
        method: "POST",
        body: JSON.stringify({ organisation_user_id: Number(pick) }),
      });
      setPick("");
      await Promise.all([loadMembers(selId), loadTeams()]);
    }, "Member added.");
  };

  const removeMember = (m) =>
    run(async () => {
      await api(`/teams/${selId}/members/${m.organisation_user_id}`, { method: "DELETE" });
      await Promise.all([loadMembers(selId), loadTeams()]);
    }, "Member removed.");

  const who = (m) => m.name || m.email || `User ${m.organisation_user_id}`;

  return (
    <div className="tm-page">
      <div className="tm-shell">
        <header className="tm-top">
          <span className="tm-logo" aria-hidden="true" />
          <span className="tm-org">{org || "Organization Name"}</span>
          <button type="button" className="tm-back" onClick={() => navigate("/workspace")}>← Back to checklists</button>
        </header>

        <div className="tm-titlerow">
          <h1>Teams</h1>
          <span className="tm-mono tm-count">{teams.length} / {MAX_TEAMS} TEAMS</span>
        </div>
        <hr className="tm-rule" />

        <div className="tm-msgrow" role="status">
          {error ? <span className="tm-error">{error}</span> : notice ? <span className="tm-notice">{notice}</span> : null}
        </div>

        <div className="tm-body">
          <section className="tm-left">
            <label className="tm-label tm-mono" htmlFor="tm-new">ADD A TEAM</label>
            <div className="tm-addrow">
              <input
                id="tm-new"
                className="tm-input"
                placeholder={isMax ? "MAXIMUM TEAMS CREATED" : "Team Name"}
                value={isMax ? "" : newName}
                maxLength={60}
                disabled={isMax || busy}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTeam()}
              />
              <button type="button" className="tm-plus" onClick={addTeam} disabled={isMax || busy || !newName.trim()} aria-label="Add team">+</button>
            </div>

            <div className="tm-list">
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`tm-team ${t.id === selId ? "tm-on" : ""}`}
                  onClick={() => setSelId(t.id)}
                >
                  <span className="tm-tname">{t.name}</span>
                  <span className="tm-tcount">{t.member_count === 1 ? "1 member" : `${t.member_count} members`}</span>
                </button>
              ))}
              {teams.length === 0 && loaded && <div className="tm-empty tm-mono">NO TEAMS YET</div>}
            </div>
          </section>

          {/* ---------- right: selected team ---------- */}
          <section className="tm-right">
            {!selected ? (
              <div className="tm-empty tm-mono">{loaded ? "SELECT OR CREATE A TEAM" : ""}</div>
            ) : (
              <>
                <div className="tm-head">
                  {renaming ? (
                    <div className="tm-renamerow">
                      <input
                        className="tm-input tm-rename"
                        value={renameVal}
                        maxLength={60}
                        autoFocus
                        onChange={(e) => setRenameVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename();
                          if (e.key === "Escape") setRenaming(false);
                        }}
                      />
                      <button type="button" className="tm-solid" onClick={saveRename} disabled={busy}>Save</button>
                      <button type="button" className="tm-link" onClick={() => setRenaming(false)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <h2>{selected.name}</h2>
                      <div className="tm-actions">
                        <button type="button" className="tm-link" onClick={() => { setRenameVal(selected.name); setRenaming(true); setConfirmDel(false); }}>Rename</button>
                        <button type="button" className="tm-link tm-danger" onClick={() => setConfirmDel(true)}>Delete</button>
                      </div>
                    </>
                  )}
                </div>

                {confirmDel && (
                  <div className="tm-confirm">
                    <span>
                      Delete <b>{selected.name}</b>? Its members are removed from the team and checklists
                      shared with it will no longer reach them. This can't be undone.
                    </span>
                    <span className="tm-confirm-btns">
                      <button type="button" className="tm-solid tm-solid-danger" onClick={deleteTeam} disabled={busy}>Yes, delete</button>
                      <button type="button" className="tm-link" onClick={() => setConfirmDel(false)}>Keep team</button>
                    </span>
                  </div>
                )}

                <div className="tm-sec">
                  <div className="tm-label tm-mono">ADD MEMBER</div>
                  <div className="tm-addrow">
                    <select className="tm-input tm-select" value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy || available.length === 0}>
                      <option value="">{available.length === 0 ? "Everyone is already in this team" : "Select a person"}</option>
                      {available.map((m) => (
                        <option key={m.organisation_user_id} value={m.organisation_user_id}>
                          {who(m)}{m.name && m.email ? ` (${m.email})` : ""}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="tm-solid" onClick={addMember} disabled={busy || !pick}>Add</button>
                  </div>
                </div>

                <div className="tm-sec">
                  <div className="tm-label tm-mono">MEMBERS ({members.length})</div>
                  <div className="tm-members">
                    {members.map((m) => (
                      <div className="tm-member" key={m.organisation_user_id}>
                        <span className="tm-avatar" aria-hidden="true">{who(m).charAt(0).toUpperCase()}</span>
                        <span className="tm-mtext">
                          <span>{who(m)}</span>
                          {m.name && m.email && <small>{m.email}</small>}
                        </span>
                        <button type="button" className="tm-link" onClick={() => removeMember(m)} disabled={busy}>Remove</button>
                      </div>
                    ))}
                    {members.length === 0 && <div className="tm-empty tm-mono">NO MEMBERS YET</div>}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}