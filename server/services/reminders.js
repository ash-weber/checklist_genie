
const prisma = require("../utils/prisma");
const { getTransporter, senderFor } = require("../utils/mailer");
const { reminderMinutes } = require("../utils/adminOptions");
const { startOfToday, isDueToday } = require("../utils/dueDates");

const TICK_MS = 60 * 1000;
const START_HOUR = Number(process.env.REMINDER_START_HOUR ?? 8);
const END_HOUR = Number(process.env.REMINDER_END_HOUR ?? 20);
const NAMES_SHOWN = 5; 

const escapeHtml = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const isoDay = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

const describe = (p) => {
  if (p.mode !== "MEMBER") return "not submitted yet";
  const shown = p.missingNames.slice(0, NAMES_SHOWN).join(", ");
  const more = p.missingNames.length > NAMES_SHOWN ? ` +${p.missingNames.length - NAMES_SHOWN} more` : "";
  return `${p.missingNames.length} of ${p.total} members have not submitted (${shown}${more})`;
};

const buildEmail = (name, pending) => {
  const link = process.env.CLIENT_URL ? `<p><a href="${escapeHtml(process.env.CLIENT_URL)}/workspace">Open Checklist Genie</a></p>` : "";
  return `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h3 style="color: #13213c;">Checklist reminder</h3>
    <p>Hi ${escapeHtml(name || "there")}, these checklists are due today and are still pending:</p>
    <ul>${pending.map((p) => `<li><b>${escapeHtml(p.template_name)}</b> - ${escapeHtml(describe(p))}</li>`).join("")}</ul>
    ${link}
    <p style="color: #777; font-size: 12px;">You get this because notifications are enabled in your Admin Panel. You can change how often you receive reminders there.</p>
  </div>`;
};

const findPending = async (dueToday, todayDb) => {
  const submitted = await prisma.checklist_submission.findMany({
    where: { checklist_template_id: { in: dueToday.map((t) => t.id) }, selected_date: todayDb, status: "SUBMITTED" },
    select: { checklist_template_id: true, organisation_user_id: true },
  });
  const doneBy = new Map(); 
  for (const s of submitted) {
    if (!doneBy.has(s.checklist_template_id)) doneBy.set(s.checklist_template_id, new Set());
    doneBy.get(s.checklist_template_id).add(s.organisation_user_id);
  }

  const memberTemplates = dueToday.filter((t) => t.assignee_type === "MEMBER");
  const teamIds = [...new Set(memberTemplates.flatMap((t) => t.SharedTeams.map((s) => s.team_id)))];
  const membersByTeam = new Map();
  if (teamIds.length > 0) {
    const rows = await prisma.team_member.findMany({
      where: { team_id: { in: teamIds } },
      select: {
        team_id: true,
        organisation_user_id: true,
        OrganisationUser: { select: { user: { select: { name: true, email: true } } } },
      },
    });
    for (const r of rows) {
      if (!membersByTeam.has(r.team_id)) membersByTeam.set(r.team_id, []);
      membersByTeam.get(r.team_id).push({
        id: r.organisation_user_id,
        name: r.OrganisationUser?.user?.name || r.OrganisationUser?.user?.email || `User ${r.organisation_user_id}`,
      });
    }
  }

  const pending = [];
  for (const t of dueToday) {
    const done = doneBy.get(t.id) || new Set();

    if (t.assignee_type === "MEMBER") {
      const members = new Map(); 
      for (const s of t.SharedTeams) (membersByTeam.get(s.team_id) || []).forEach((m) => members.set(m.id, m));
      if (members.size === 0) continue; 
      const missing = [...members.values()].filter((m) => !done.has(m.id));
      if (missing.length > 0) {
        pending.push({ template_name: t.template_name, mode: "MEMBER", total: members.size, missingNames: missing.map((m) => m.name) });
      }
    } else if (done.size === 0) {
      pending.push({ template_name: t.template_name, mode: "GROUP" });
    }
  }
  return pending;
};

const runOnce = async (now = new Date()) => {
  const hour = now.getHours();
  if (hour < START_HOUR || hour >= END_HOUR) return { sent: 0 };

  const prefs = await prisma.user_preference.findMany({
    where: { notifications: true },
    include: { User: { select: { id: true, email: true, name: true } } },
  });

  const today = startOfToday(now);
  const todayDb = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  let sent = 0;

  for (const p of prefs) {
    try {
      const gapMs = reminderMinutes(p.reminder_every, p.reminder_unit) * 60000;
      if (p.last_reminded_at && now - new Date(p.last_reminded_at) < gapMs) continue;
      if (!p.User?.email) continue;

      const ous = await prisma.organisation_Users.findMany({ where: { user_id: p.user_id }, select: { id: true } });
      const ouIds = ous.map((o) => o.id);
      if (ouIds.length === 0) continue;

      const templates = await prisma.checklist_template.findMany({
        where: {
          is_archived: false,
          due_date: { not: null },
          OR: [
            { organisation_user_id: { in: ouIds } },
            { ChecklistTemplateOwners: { is: { organisation_user_id: { in: ouIds } } } },
          ],
        },
        select: {
          id: true,
          template_name: true,
          due_date: true,
          recurrence: true,
          recurrence_custom_days: true,
          recurrence_ends_on: true,
          assignee_type: true,
          SharedTeams: { select: { team_id: true } },
        },
      });

      const dueToday = templates.filter((t) =>
        isDueToday(
          {
            due_date: isoDay(t.due_date),
            recurrence: t.recurrence,
            recurrence_custom_days: t.recurrence_custom_days,
            recurrence_ends_on: isoDay(t.recurrence_ends_on),
          },
          today
        )
      );
      if (dueToday.length === 0) continue;

      const pending = await findPending(dueToday, todayDb);
      if (pending.length === 0) continue;

      await getTransporter().sendMail({
        from: senderFor("Checklist Reminder"),
        sender: senderFor("Checklist Reminder"),
        to: p.User.email,
        subject: `Reminder: ${pending.length} checklist${pending.length === 1 ? "" : "s"} due today`,
        html: buildEmail(p.User.name, pending),
      });
      await prisma.user_preference.update({ where: { user_id: p.user_id }, data: { last_reminded_at: now } });
      sent += 1;
    } catch (error) {
      console.error(`Reminder failed for user ${p.user_id}:`, error.message);
    }
  }
  return { sent };
};

let timer = null;
let running = false;
const start = () => {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runOnce();
    } catch (error) {
      console.error("Reminder job error:", error.message);
    }
    running = false;
  }, TICK_MS);
  console.log(`Reminder job started (every minute, ${START_HOUR}:00-${END_HOUR}:00).`);
};

module.exports = { start, runOnce };