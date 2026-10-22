require("dotenv").config();
const prisma = require("../utils/prisma");
const { getTransporter, senderFor } = require("../utils/mailer");


const escapeHtml = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const multiline = (v) => escapeHtml(v).replace(/\r?\n/g, "<br>");
const uniq = (arr) => [...new Set(arr.filter(Boolean).map((e) => String(e).trim()))];

const TD = 'style="padding: 10px; border: 1px solid #ddd;"';
const TH = 'style="padding: 10px; border: 1px solid #ddd;"';
const TH_C = 'style="padding: 8px 6px; border: 1px solid #ddd; text-align: center; white-space: nowrap;"';
const TD_C = 'style="padding: 8px 6px; border: 1px solid #ddd; text-align: center;"';
const TD_TODAY =
  'style="padding: 8px 6px; border: 1px solid #ddd; text-align: center; background-color: #f1f8f1; font-weight: bold;"';

const answerText = (input) => {
  if (input === true || input === "Yes") return "Yes";
  if (input === false || input === "No") return "No";
  if (input === null || input === undefined) return "";
  return String(input);
};

const shortIsoDate = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
};

const shortLabelDate = (label) => {
  const d = new Date(label);
  return isNaN(d)
    ? String(label || "")
    : d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
};

const splitRecipients = (rows) => {
  const out = { to: [], cc: [], bcc: [] };
  for (const r of rows || []) {
    if (!r.recipient_email) continue;
    const tag = String(r.cc_bcc_emails || "to").trim().toLowerCase();
    if (tag.includes("@")) {
      out.to.push(r.recipient_email);
      out.cc.push(r.cc_bcc_emails);
    } else if (out[tag]) {
      out[tag].push(r.recipient_email);
    } else {
      out.to.push(r.recipient_email);
    }
  }
  return { to: uniq(out.to), cc: uniq(out.cc), bcc: uniq(out.bcc) };
};


const formatChecklistDataForEmail = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return `<tr><td colspan="4" ${TD}>No checklist items found.</td></tr>`;
  }
  return items
    .map(
      (item, index) => `
      <tr>
        <td ${TD}>${index + 1}</td>
        <td ${TD}>${escapeHtml(item.checklist_name || "N/A")}</td>
        <td ${TD}>${escapeHtml(answerText(item.input))}</td>
        <td ${TD}>${item.comments ? multiline(item.comments) : "No comments"}</td>
      </tr>`
    )
    .join("");
};

const norm = (s) => String(s ?? "").trim().toLowerCase();
const dKey = (v) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s));
const keyOf = (pid, itemId, name) =>
  pid ? `pid:${norm(pid)}` : itemId ? `id:${itemId}` : `name:${norm(name)}`;

const previousDays = (isoDate, n = 4) => {
  const base = new Date(`${isoDate}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - (n - i));
    return d.toISOString().slice(0, 10);
  });
};

const renderChecklistTable = (items, history, selectedDate, includeHistory = false) => {
  const list = Array.isArray(items) ? items : [];
  const hist = Array.isArray(history) ? history : [];
  const withHistory = Boolean(includeHistory) || hist.length > 0;

  if (!withHistory) {
    return `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #ddd;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th ${TH}>S.No</th>
              <th ${TH}>Description</th>
              <th ${TH}>Response</th>
              <th ${TH}>Comments</th>
            </tr>
          </thead>
          <tbody>
            ${formatChecklistDataForEmail(list)}
          </tbody>
        </table>`;
  }

  const dates = isIso(selectedDate)
    ? previousDays(selectedDate)
    : [...new Set(hist.map((h) => dKey(h.date)))].sort();

  const past = new Map();
  for (const h of hist) {
    const key = keyOf(h.process_id, h.item_id, h.item_name);
    if (key === "name:") continue;
    if (!past.has(key)) past.set(key, { name: h.item_name, byDate: {} });
    const day = dKey(h.date);
    if (h.input !== null && h.input !== undefined && h.input !== "") past.get(key).byDate[day] = h.input;
  }

  const cell = (v, style = TD_C) => `<td ${style}>${escapeHtml(answerText(v) || "-")}</td>`;
  const buildRow = (no, name, byDate, todayInput, comments) => `
      <tr>
        <td ${TD_C}>${no}</td>
        <td ${TD}>${escapeHtml(name || "N/A")}</td>
        ${dates.map((d) => cell(byDate[d])).join("")}
        ${cell(todayInput, TD_TODAY)}
        <td ${TD}>${comments}</td>
      </tr>`;

  const seen = new Set();
  const rows = list.map((item, i) => {
    const key = keyOf(item.process_id, item.item_id, item.checklist_name);
    seen.add(key);
    const byDate = (past.get(key) || {}).byDate || {};
    return buildRow(i + 1, item.checklist_name, byDate, item.input, item.comments ? multiline(item.comments) : "No comments");
  });

  let no = list.length;
  for (const [key, p] of past) {
    if (seen.has(key)) continue;
    no += 1;
    rows.push(buildRow(no, p.name, p.byDate, "", ""));
  }

  const todayLabel = isIso(selectedDate) ? shortIsoDate(selectedDate) : shortLabelDate(selectedDate);
  const colCount = 4 + dates.length;
  return `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #ddd; font-size: 13px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th ${TH_C}>S.No</th>
              <th style="min-width: 140px; padding: 10px; border: 1px solid #ddd;">Description</th>
              ${dates.map((d) => `<th ${TH_C}>${escapeHtml(shortIsoDate(d))}</th>`).join("")}
              <th ${TH_C}>Today<br><span style="font-weight: normal; font-size: 11px;">${escapeHtml(todayLabel)}</span></th>
              <th ${TH}>Comments</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.join("") : `<tr><td colspan="${colCount}" ${TD}>No checklist items found.</td></tr>`}
          </tbody>
        </table>`;
};

const renderNote = (notesHtml) =>
  notesHtml
    ? `<h4 style="margin: 24px 0 8px;">Checklist Note</h4>
       <div style="padding: 12px 14px; border-left: 3px solid #4CAF50; background: #f9f9f9;">${notesHtml}</div>`
    : "";


const sendEmailToManager = async (
  username,
  checklistItems,
  recipientEmail,
  ccEmails,
  templateName,
  selectedDate,
  extras = {}
) => {
  try {
    if (!recipientEmail || recipientEmail.length === 0) {
      console.error("Error: No recipient emails found.");
      throw new Error("No recipients provided.");
    }

    const to = uniq(recipientEmail);
    const cc = uniq(ccEmails || []).filter((e) => !to.includes(e));
    const bcc = uniq(extras.bcc || []).filter((e) => !to.includes(e) && !cc.includes(e));

    const emailContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h3 style="color: #4CAF50;">Checklist Submission - ${escapeHtml(templateName)}</h3>
        <p><strong>Hi,</strong></p>
        <p><strong>${escapeHtml(username)}</strong> has successfully submitted the checklist for <strong>${escapeHtml(selectedDate)}</strong></p>

        ${renderChecklistTable(checklistItems, extras.history, selectedDate, extras.includeHistory)}

        ${renderNote(extras.notesHtml)}

        <p style="margin-top: 20px;"><strong>Thanks,</strong></p>
        <p><strong>${escapeHtml(username)}</strong></p>
      </div>
    `;

    await getTransporter().sendMail({
      from: senderFor("Checklist Submission"),
      sender: senderFor("Checklist Submission"),
      to: to.join(", "),
      cc: cc.join(", ") || undefined,
      bcc: bcc.join(", ") || undefined,
      subject: `Checklist Submitted by ${username}`,
      html: emailContent,
    });
    console.log("Email sent successfully.");
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send email.");
  }
};

const submitChecklist = async (req, res) => {
  try {
    const username = req.user?.name;
    const userEmail = req.user?.email;
    const { checklistTemplateId, checklistItems, selectedDate: selectedDateFromUI } = req.body;

    if (!checklistTemplateId) {
      console.error("Error: checklistTemplateId is undefined or missing.");
      return res.status(400).json({ error: "Checklist Template ID is required." });
    }

    const checklistTemplate = await prisma.checklist_template.findUnique({
      where: { id: checklistTemplateId },
      select: { template_name: true },
    });
    if (!checklistTemplate) {
      return res.status(404).json({ error: "Checklist template not found." });
    }
    const templateName = checklistTemplate.template_name;

    if (!selectedDateFromUI) {
      return res.status(400).json({ error: "Selected date is required." });
    }
    const formattedDate = new Date(selectedDateFromUI).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const templateRecipients = await prisma.templateRecipients.findMany({
      where: { checklist_template_id: checklistTemplateId },
      select: { recipient_email: true, cc_bcc_emails: true },
    });
    if (!templateRecipients || templateRecipients.length === 0) {
      console.error("No recipients found for template:", checklistTemplateId);
      return res.status(404).json({ message: "No recipients found for the template." });
    }

    const { to, cc, bcc } = splitRecipients(templateRecipients);
    if (userEmail) cc.push(userEmail);

    await sendEmailToManager(username, checklistItems, to, cc, templateName, formattedDate, { bcc });

    res.status(200).json({
      message: "Checklist submitted and email sent successfully!",
      checklist_template_name: templateName,
    });
  } catch (error) {
    console.error("Error submitting checklist:", error);
    res.status(500).json({ message: "Failed to submit checklist. Please try again." });
  }
};

const addRecipient = async (req, res) => {
  try {
    if (!req.user || !req.user.user_id) {
      return res.status(400).json({ message: "User not authenticated." });
    }

    const { checklist_template_id, recipient_email, recipient_role } = req.body;

    if (!["to", "cc", "bcc"].includes(recipient_role)) {
      return res.status(400).json({ message: "Recipient role must be 'to', 'cc', or 'bcc'." });
    }
    if (!checklist_template_id || !recipient_email) {
      return res.status(400).json({
        message: "Checklist Template ID and recipient email are required.",
      });
    }

    const userId = req.user.user_id;
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      return res.status(400).json({ message: "User not found." });
    }

    const newRecipient = await prisma.templateRecipients.create({
      data: {
        checklist_template_id,
        recipient_email,
        cc_bcc_emails: recipient_role,
        assigned_by_user_id: userId,
      },
    });

    res.status(200).json({ message: "Recipient added successfully", recipient: newRecipient });
  } catch (error) {
    console.error("Error adding recipient:", error);
    res.status(500).json({ message: "Failed to add recipient. Please try again." });
  }
};


const sendOtpEmail = async (recipientEmail, otp) => {
  try {
    const emailContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #00466a;">Your One-Time Password (OTP)</h2>
        <p>Thank you for registering. Please use the following OTP to complete your registration process. This OTP is valid for 10 minutes.</p>
        <h3 style="background: #00466a; margin: 0 auto; width: max-content; padding: 10px 20px; color: #fff; border-radius: 4px;">${escapeHtml(otp)}</h3>
        <p>If you did not request this, please ignore this email.</p>
        <hr/>
        <p>Thanks,<br/>The Team</p>
      </div>
    `;

    await getTransporter().sendMail({
      from: senderFor("Registration OTP"),
      sender: senderFor("Registration OTP"),
      to: recipientEmail,
      subject: "Your OTP for Registration",
      html: emailContent,
    });
    console.log(`OTP email sent successfully to ${recipientEmail}.`);
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw new Error("Failed to send OTP email.");
  }
};

const sendForgetPasswordOTP = async (email, otp) => {
  try {
    const emailContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #00466a;">Your Password Reset OTP</h2>
        <p>We received a request to reset your password. Please use the following OTP to proceed with resetting your password. This OTP is valid for 10 minutes.</p>
        <h3 style="background: #00466a; margin: 0 auto; width: max-content; padding: 10px 20px; color: #fff; border-radius: 4px;">${escapeHtml(otp)}</h3>
        <p>If you did not request this, please ignore this email.</p>
        <hr/>
        <p>Thanks,<br/>The Team</p>
      </div>
    `;

    await getTransporter().sendMail({
      from: senderFor("Password Reset"),
      sender: senderFor("Password Reset"),
      to: email,
      subject: "Your Password Reset OTP",
      html: emailContent,
    });
    console.log(`Password reset OTP email sent successfully to ${email}.`);
  } catch (error) {
    console.error("Error sending password reset OTP email:", error);
    throw new Error("Failed to send password reset OTP email.");
  }
};

module.exports = {
  submitChecklist,
  addRecipient,
  sendOtpEmail,
  sendForgetPasswordOTP,
  sendEmailToManager,
  splitRecipients,
};