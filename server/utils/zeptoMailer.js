// server/utils/zeptoMailer.js
// Sends mail through the ZeptoMail HTTP API (no Gmail / SMTP involved).
// Env (server/.env):
//   ZEPTOMAIL_TOKEN       full value incl. the "Zoho-enczapikey " prefix
//   ZEPTOMAIL_FROM_EMAIL  must be on a domain verified in ZeptoMail
//   ZEPTOMAIL_FROM_NAME
//   ZEPTOMAIL_URL         https://api.zeptomail.in/v1.1/email  (.in data centre)
// Uses the global fetch (Node 18+).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// accepts "a@x.com", "a@x.com, b@y.com", ["a@x.com", ...] or undefined
// -> unique, valid list
const clean = (v) => {
  const list = (Array.isArray(v) ? v : [v])
    .flatMap((x) => String(x || "").split(/[,;]/))
    .map((e) => e.trim())
    .filter((e) => EMAIL_RE.test(e));
  const seen = new Set();
  return list.filter((e) => {
    const k = e.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const lower = (arr) => arr.map((e) => e.toLowerCase());
const toRecipients = (emails) => emails.map((address) => ({ email_address: { address } }));

async function sendMail({ to, cc, bcc, subject, html, text, fromName }) {
  const { ZEPTOMAIL_TOKEN, ZEPTOMAIL_FROM_EMAIL, ZEPTOMAIL_FROM_NAME, ZEPTOMAIL_URL } = process.env;
  if (!ZEPTOMAIL_TOKEN || !ZEPTOMAIL_FROM_EMAIL || !ZEPTOMAIL_URL) {
    throw new Error("ZeptoMail is not configured (check ZEPTOMAIL_* in server/.env).");
  }

  const toList = clean(to);
  const ccList = clean(cc).filter((e) => !lower(toList).includes(e.toLowerCase()));
  const bccList = clean(bcc).filter(
    (e) => !lower(toList).includes(e.toLowerCase()) && !lower(ccList).includes(e.toLowerCase())
  );
  if (toList.length === 0) throw new Error("No valid 'to' email address.");

  const body = {
    from: {
      address: ZEPTOMAIL_FROM_EMAIL,
      name: fromName || ZEPTOMAIL_FROM_NAME || "Checklist Genie",
    },
    to: toRecipients(toList),
    subject: subject || "(no subject)",
  };
  if (ccList.length) body.cc = toRecipients(ccList);
  if (bccList.length) body.bcc = toRecipients(bccList);
  if (html) body.htmlbody = html;
  else body.textbody = text || "";

  const res = await fetch(ZEPTOMAIL_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: ZEPTOMAIL_TOKEN,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason =
      (data && data.error && (data.error.message || data.error.code)) || data.message || res.statusText;
    throw new Error(`ZeptoMail ${res.status}: ${reason}`);
  }
  return data;
}

module.exports = { sendMail };