import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import "./TemplateRecipients.css";

const API =
  process.env.REACT_APP_BACKEND_SERVER_URL || "http://localhost:5002";

const ROLES = [["to", "To"], ["cc", "CC"], ["bcc", "BCC"]];
const ROLE_LABEL = { to: "TO", cc: "CC", bcc: "BCC" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roleOrder = (r) => Math.max(["to", "cc", "bcc"].indexOf(r), 0);

export default function TemplateRecipients() {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const token = localStorage.getItem("token");
  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [recipients, setRecipients] = useState([]);
  const [title, setTitle] = useState("");
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("to");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const initial = useMemo(() => {
    try {
      const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return String(JSON.parse(atob(b64)).name || "").trim().charAt(0).toUpperCase();
    } catch { return ""; }
  }, [token]);

  const fetchRecipients = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const res = await axios.get(`${API}/templaterecepients/getreceipients/${templateId}`, auth);
      setRecipients(Array.isArray(res.data) ? res.data : []);
      setError("");
    } catch {
      setError("COULD NOT LOAD RECIPIENTS. TRY AGAIN.");
    }
    setLoading(false);
  }, [templateId, auth]);

  useEffect(() => {
    if (!token) { navigate("/", { replace: true }); return; }
    fetchRecipients(false);
    axios.get(`${API}/checklists/${templateId}`, auth).then((r) => setTitle(r.data.title || "")).catch(() => {});
    axios.get(`${API}/onboarding/status`, auth).then((r) => setOrg(r.data.group_name || "")).catch(() => {});
  }, [templateId, token, auth, navigate, fetchRecipients]);

  const sorted = useMemo(
    () => [...recipients].sort(
      (a, b) => roleOrder(a.cc_bcc_emails) - roleOrder(b.cc_bcc_emails) || a.recipient_email.localeCompare(b.recipient_email)
    ),
    [recipients]
  );

  const addRecipient = async () => {
    const value = email.trim();
    if (!EMAIL_RE.test(value)) return setError("ENTER A VALID EMAIL ADDRESS");
    if (recipients.some((r) => r.recipient_email.toLowerCase() === value.toLowerCase() && r.cc_bcc_emails === role)) {
      return setError(`ALREADY ADDED AS ${ROLE_LABEL[role]}`);
    }
    setBusy(true);
    setError("");
    try {
      await axios.post(
        `${API}/templaterecepients/${templateId}/recipients`,
        { recipients: [{ email: value, type: role }] },
        auth
      );
      setEmail("");
      await fetchRecipients(true);
    } catch {
      setError("COULD NOT ADD RECIPIENT. CHECK THE EMAIL AND TRY AGAIN.");
    }
    setBusy(false);
  };

  const removeRecipient = async (id) => {
    setBusy(true);
    setError("");
    try {
      await axios.delete(`${API}/templaterecepients/recipients/${id}`, auth);
      await fetchRecipients(true);
    } catch {
      setError("COULD NOT REMOVE RECIPIENT. TRY AGAIN.");
    }
    setBusy(false);
  };

  return (
    <div className="tr-page">
      <div className="tr-shell">
        <header className="tr-top">
          <span className="tr-logo" aria-hidden="true" />
          <span className="tr-org">{org || "Organization Name"}</span>
          <span className="tr-avatar" aria-hidden="true">{initial}</span>
        </header>

        <div className="tr-body">
          <div className="tr-titlerow">
            <div>
              <h1>Template Recipients</h1>
              {title && <p className="tr-sub tr-mono">{title.toUpperCase()}</p>}
            </div>
            <button type="button" className="tr-link" onClick={() => navigate("/workspace")}>← All Checklists</button>
          </div>

          <section className="tr-sec">
            <h2 className="tr-sech">Add New Recipient</h2>
            <div className="tr-form">
              <input
                type="email"
                className="tr-input"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") addRecipient(); }}
              />
              <div className="tr-seg tr-mono" role="radiogroup" aria-label="Recipient type">
                {ROLES.map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={role === k}
                    className={role === k ? "tr-on" : ""} onClick={() => setRole(k)}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
              <button type="button" className="tr-add" disabled={busy} onClick={addRecipient}>
                {busy ? "Saving..." : "Add"}
              </button>
            </div>
            {error && <div className="tr-error tr-mono">{error}</div>}
          </section>

          <section className="tr-sec">
            <h2 className="tr-sech">
              Current Recipients{recipients.length > 0 && <em className="tr-mono">{recipients.length}</em>}
            </h2>

            {loading ? (
              <div className="tr-state tr-mono">LOADING...</div>
            ) : sorted.length === 0 ? (
              <div className="tr-state">
                <span className="tr-mono">NO RECIPIENTS ADDED YET</span>
                <small>Until you add some, submissions are emailed to the person who created this checklist.</small>
              </div>
            ) : (
              <ul className="tr-list">
                {sorted.map((r) => (
                  <li key={r.id} className="tr-row">
                    <span className="tr-email">{r.recipient_email}</span>
                    <span className="tr-chip tr-mono">{ROLE_LABEL[r.cc_bcc_emails] || "TO"}</span>
                    <button type="button" className="tr-remove" disabled={busy} onClick={() => removeRecipient(r.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}