const prisma = require("../utils/prisma");
const { effectiveTeams, legacyDue } = require("../utils/legacyTeams");

let sendEmailToManager = null;
let splitRecipients = null;
try {
  ({ sendEmailToManager, splitRecipients } = require("./mail.controllers"));
} catch (e) {
  console.warn("mail.controllers sendEmailToManager not found — submission emails will be skipped.");
}

const EMAIL_ON_ITEM_SEND = true;

const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };

const pad = (n) => String(n).padStart(2, "0");
const toDateOnly = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDateStr = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const dayKey = (v) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const daysBefore = (dateStr, n) => {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};


const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "br", "p", "div", "ul", "ol", "li"]);
const escapeAngles = (s) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sanitizeNotes = (html) => {
  if (!html || typeof html !== "string") return null;
  const src = html
    .slice(0, 20000)
    .replace(/<!--[\s\S]*?-->/g, "") 
    .replace(/<![^>]*>/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  const re = /<(\/?)([a-z][a-z0-9:-]*)(?:[\s/][^>]*)?>/gi; 
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    out += escapeAngles(src.slice(last, m.index));
    const tag = m[2].toLowerCase();
    if (ALLOWED_TAGS.has(tag)) out += `<${m[1]}${tag}>`;
    last = re.lastIndex;
  }
  out += escapeAngles(src.slice(last));
  out = out.trim();
  return out.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() ? out : null;
};

const htmlToText = (html) =>
  String(html || "")
    .replace(/<li>/gi, "• ")
    .replace(/<(br|\/p|\/div|\/li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const getMyTeamIds = async (organisation_user_id) =>
  (
    await prisma.team_member.findMany({
      where: { organisation_user_id },
      select: { team_id: true },
    })
  ).map((t) => t.team_id);

const getMyPositions = async (organisation_user_id) =>
  (
    await prisma.organisation_User_position.findMany({
      where: { organisation_user_id },
      select: { user_position: true },
    })
  )
    .map((p) => p.user_position)
    .filter(Boolean);


const visibilityOr = async (organisation_user_id) => {
  const [teamIds, positions] = await Promise.all([
    getMyTeamIds(organisation_user_id),
    getMyPositions(organisation_user_id),
  ]);
  const or = [];
  if (teamIds.length) {
    or.push({ SharedTeams: { some: { team_id: { in: teamIds } } } });
  }
  or.push({
    SharedTeams: { none: {} },
    Tags: { is: { user_position: { in: [...new Set([...positions, "PUBLIC"])] } } },
  });
  return or;
};

const loadSharedTemplate = async (organisation_id, organisation_user_id, id) => {
  return prisma.checklist_template.findFirst({
    where: {
      id,
      organisation_id,
      OR: await visibilityOr(organisation_user_id),
    },
    include: {
      TemplateVersion: {
        include: {
          ChecklistTemplateLinkedItems: {
            where: { is_hidden: false },
            orderBy: { sort_order: "asc" },
            include: { ChecklistItems: true },
          },
        },
      },
    },
  });
};

const validateResponses = (responses, linkedById) => {
  for (const r of responses) {
    const li = linkedById.get(r.linked_item_id);
    if (!li) return `Invalid linked_item_id: ${r.linked_item_id}`;
    const name = li.ChecklistItems.checklist_name;
    const type = li.ChecklistItems.input_type;
    const hasInput = !(r.input === undefined || r.input === null || r.input === "");
    const hasComment = Boolean(r.comments && String(r.comments).trim());
    if (!hasInput && !hasComment) return `Item "${name}" needs a response or a note.`;
    if (hasInput && type === "Boolean" && !["Yes", "No"].includes(r.input)) {
      return `Item "${name}" must be answered "Yes" or "No".`;
    }
    if (hasInput && type === "Numeric" && !Number.isFinite(Number(r.input))) {
      return `Item "${name}" must be a number.`;
    }
  }
  return null;
};

const responseData = (r, li, submission_id, template, organisation_user_id, dateStr) => {
  const hasInput = !(r.input === undefined || r.input === null || r.input === "");
  return {
    submission_id,
    checklist_template_linked_items_id: r.linked_item_id,
    organisation_user_id,
    template_version: template.current_version_id,
    selected_date: dateStr,
    input: hasInput ? String(r.input) : null,
    comments: r.comments && String(r.comments).trim() ? String(r.comments).trim() : null,
    status: li.ChecklistItems.input_type === "Boolean" ? r.input === "Yes" : null,
    created_at: new Date(),
  };
};

const findSubmission = (tx, checklist_template_id, organisation_user_id, dateStr) =>
  tx.checklist_submission.findFirst({
    where: { checklist_template_id, organisation_user_id, selected_date: new Date(dateStr) },
  });


const emailRecipients = async (checklist_template_id) => {
  const rows = await prisma.templateRecipients.findMany({ where: { checklist_template_id } });
  let out = splitRecipients
    ? splitRecipients(rows)
    : { to: rows.map((r) => r.recipient_email).filter(Boolean), cc: [], bcc: [] };

  if (out.to.length === 0) {
    const t = await prisma.checklist_template.findUnique({
      where: { id: checklist_template_id },
      select: { OrganisationUsers: { select: { user: { select: { email: true } } } } },
    });
    const creator = t?.OrganisationUsers?.user?.email;
    if (creator) out = { ...out, to: [creator] };
  }
  return out;
};


const trySendEmail = async ({ checklist_template_id, userName, userEmail, items, templateName, dateStr, extras = {} }) => {
  if (!sendEmailToManager) {
    console.warn("[mail] sendEmailToManager is not loaded - check ./mail.controllers and ../utils/mailer");
    return { status: "mailer_missing" };
  }
  try {
    const rec = await emailRecipients(checklist_template_id);
    if (rec.to.length === 0) {
      console.warn(`[mail] no recipient for template ${checklist_template_id} (none on the Recipients page and no creator email)`);
      return { status: "no_recipients" };
    }
    console.log(`[mail] "${templateName}" -> to: ${rec.to.join(", ")} | cc: ${rec.cc.join(", ") || "-"} | bcc: ${rec.bcc.join(", ") || "-"}`);
    await sendEmailToManager(
      userName,
      items,
      rec.to,
      [...rec.cc, ...(userEmail ? [userEmail] : [])],
      templateName,
      dateStr,
      { bcc: rec.bcc, ...extras }
    );
    return { status: "sent" };
  } catch (e) {
    console.error("[mail] failed:", e.message);
    return { status: "failed", error: e.message };
  }
};

const getMyChecklists = async (req, res) => {
  try {
    const { organisation_id, organisation_user_id } = req.user;
    const todayMs = new Date(toDateOnly(new Date())).getTime();

    const memberships = await prisma.team_member.findMany({
      where: { organisation_user_id },
      include: { Team: true },
    });
    const teams = memberships.map((m) => ({ id: m.Team.id, name: m.Team.name }));

    const orgTeams = await prisma.team.findMany({ where: { organisation_id } });

    const templates = await prisma.checklist_template.findMany({
      where: {
        organisation_id,
        is_archived: false,
        OR: await visibilityOr(organisation_user_id),
      },
      orderBy: { due_date: "asc" },
      include: {
        ListTypes: true,
        SharedTeams: { include: { Team: true } },
        Tags: true,
      },
    });

    const subs = await prisma.checklist_submission.findMany({
      where: {
        organisation_user_id,
        checklist_template_id: { in: templates.map((t) => t.id) },
      },
      select: {
        id: true,
        checklist_template_id: true,
        selected_date: true,
        status: true,
        submitted_at: true,
        _count: { select: { Responses: true } },
      },
      orderBy: { selected_date: "desc" },
    });

    res.status(200).json({
      teams,
      checklists: templates.map((t) => {
        const mine = subs.filter((s) => s.checklist_template_id === t.id);
        const todaySub = mine.find((s) => s.selected_date.getTime() === todayMs);
        const teamsOf = effectiveTeams(t, orgTeams);
        const due = legacyDue(t);
        return {
          id: t.id,
          title: t.template_name,
          due_date: due.due_date,
          recurrence: due.recurrence,
          recurrence_custom_days: t.recurrence_custom_days,
          recurrence_ends_on: t.recurrence_ends_on,
          workday_shift: t.workday_shift,
          priority: t.priority,
          assignee_type: t.assignee_type,
          position: t.Tags ? t.Tags.user_position : null,
          list_types: t.ListTypes.map((lt) => lt.list_type),
          shared_to: teamsOf.map((x) => x.name),
          shared_team_ids: teamsOf.map((x) => x.id),
          today_submission: todaySub
            ? {
                id: todaySub.id,
                status: todaySub.status,
                submitted_at: todaySub.submitted_at,
                response_count: todaySub._count.Responses,
              }
            : null,
          ever_submitted: mine.some((s) => s.status === "SUBMITTED"),
        };
      }),
    });
  } catch (error) {
    console.error("Error in getMyChecklists:", error);
    res.status(500).json({ error: "Failed to fetch your checklists." });
  }
};


const getChecklistToFill = async (req, res) => {
  try {
    const { organisation_id, organisation_user_id } = req.user;
    const id = parseInt(req.params.id);
    const dateStr = isDateStr(req.query.date) ? req.query.date : toDateOnly(new Date());

    const template = await loadSharedTemplate(organisation_id, organisation_user_id, id);
    if (!template) {
      return res.status(404).json({ error: "Checklist not found or not shared with you." });
    }

    const [extra, myTeamIds, submission] = await Promise.all([
      prisma.checklist_template.findUnique({
        where: { id },
        select: { ListTypes: true, SharedTeams: { include: { Team: true } } },
      }),
      getMyTeamIds(organisation_user_id),
      prisma.checklist_submission.findFirst({
        where: { checklist_template_id: id, organisation_user_id, selected_date: new Date(dateStr) },
        include: { Responses: { orderBy: { id: "asc" } } },
      }),
    ]);

    const byLinked = new Map();
    for (const r of submission?.Responses || []) {
      const list = byLinked.get(r.checklist_template_linked_items_id) || [];
      list.push(r);
      byLinked.set(r.checklist_template_linked_items_id, list);
    }

    res.status(200).json({
      id: template.id,
      title: template.template_name,
      due_date: template.due_date,
      recurrence: template.recurrence,
      priority: template.priority,
      entry_date: dateStr,
      list_types: (extra?.ListTypes || []).map((lt) => lt.list_type),
      my_team_names: (extra?.SharedTeams || [])
        .filter((st) => myTeamIds.includes(st.team_id))
        .map((st) => st.Team.name),
      already_submitted: Boolean(submission && submission.status === "SUBMITTED"),
      existing_notes_html: submission?.notes_html || "",
      items: (template.TemplateVersion?.ChecklistTemplateLinkedItems || []).map((li) => {
        const entries = byLinked.get(li.id) || [];
        const last = entries[entries.length - 1];
        return {
          linked_item_id: li.id,
          item_id: li.ChecklistItems.id,
          statement: li.ChecklistItems.checklist_name,
          notes: li.ChecklistItems.notes,
          response_type: li.ChecklistItems.input_type,
          process_id: li.ChecklistItems.process_id,
          entries_count: entries.length,
          existing_input: last?.input ?? null,
          existing_comments: last?.comments ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("Error in getChecklistToFill:", error);
    res.status(500).json({ error: "Failed to load checklist." });
  }
};


const sendItems = async (req, res) => {
  try {
    const { organisation_id, organisation_user_id, name: userName, email: userEmail } = req.user;
    const { checklist_template_id, selected_date, responses } = req.body;

    if (!checklist_template_id) {
      return res.status(400).json({ error: "checklist_template_id is required." });
    }
    if (!Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({ error: "At least one item is required." });
    }
    const dateStr = isDateStr(selected_date) ? selected_date : toDateOnly(new Date());

    const template = await loadSharedTemplate(organisation_id, organisation_user_id, checklist_template_id);
    if (!template) {
      return res.status(404).json({ error: "Checklist not found or not shared with you." });
    }
    if (!template.current_version_id) {
      return res.status(400).json({ error: "This checklist has no items yet, so it can't be submitted." });
    }
    const linkedItems = template.TemplateVersion?.ChecklistTemplateLinkedItems || [];
    const linkedById = new Map(linkedItems.map((li) => [li.id, li]));

    const problem = validateResponses(responses, linkedById);
    if (problem) return res.status(400).json({ error: problem });

    const entries = await prisma.$transaction(async (tx) => {
      let submission = await findSubmission(tx, checklist_template_id, organisation_user_id, dateStr);
      if (!submission) {
        submission = await tx.checklist_submission.create({
          data: {
            checklist_template_id,
            template_version_id: template.current_version_id,
            organisation_user_id,
            selected_date: new Date(dateStr),
            status: "IN_PROGRESS",
          },
        });
      }
      await tx.checklist_item_response.createMany({
        data: responses.map((r) =>
          responseData(r, linkedById.get(r.linked_item_id), submission.id, template, organisation_user_id, dateStr)
        ),
      });
      const grouped = await tx.checklist_item_response.groupBy({
        by: ["checklist_template_linked_items_id"],
        where: { submission_id: submission.id },
        _count: { _all: true },
      });
      return Object.fromEntries(grouped.map((g) => [g.checklist_template_linked_items_id, g._count._all]));
    }, TX_OPTIONS);

    let mail = { status: "skipped" };
    if (EMAIL_ON_ITEM_SEND) {
      mail = await trySendEmail({
        checklist_template_id,
        userName,
        userEmail,
        items: responses.map((r) => ({
          checklist_name: linkedById.get(r.linked_item_id).ChecklistItems.checklist_name,
          input: r.input ?? "",
          comments: r.comments || "",
        })),
        templateName: template.template_name,
        dateStr,
      });
    }

    res.status(201).json({ message: "Item sent.", entries, email_status: mail.status, email_error: mail.error });
  } catch (error) {
    console.error("Error in sendItems:", error);
    res.status(500).json({ error: "Failed to send items." });
  }
};

// POST /submissions   (final "Send Checklist")
// Body: { checklist_template_id, selected_date?, notes_html? (#4), include_history? (#5),
//         responses: [{ linked_item_id, input, comments? }] }
// Items already sent individually with the same answer are not duplicated.
const submitChecklist = async (req, res) => {
  try {
    const { organisation_id, organisation_user_id, name: userName, email: userEmail } = req.user;
    const { checklist_template_id, selected_date, notes_html, include_history, responses } = req.body;

    if (!checklist_template_id) {
      return res.status(400).json({ error: "checklist_template_id is required." });
    }
    if (!Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({ error: "Complete at least one item or leave a note before sending." });
    }
    const dateStr = isDateStr(selected_date) ? selected_date : toDateOnly(new Date());

    const template = await loadSharedTemplate(organisation_id, organisation_user_id, checklist_template_id);
    if (!template) {
      return res.status(404).json({ error: "Checklist not found or not shared with you." });
    }
    if (!template.current_version_id) {
      return res.status(400).json({ error: "This checklist has no items yet, so it can't be submitted." });
    }
    const linkedItems = template.TemplateVersion?.ChecklistTemplateLinkedItems || [];
    const linkedById = new Map(linkedItems.map((li) => [li.id, li]));

    const problem = validateResponses(responses, linkedById);
    if (problem) return res.status(400).json({ error: problem });

    const cleanNotes = sanitizeNotes(notes_html);

    const submission = await prisma.$transaction(async (tx) => {
      const patch = {
        notes_html: cleanNotes,
        include_history: Boolean(include_history),
        status: "SUBMITTED",
        submitted_at: new Date(),
      };
      let sub = await findSubmission(tx, checklist_template_id, organisation_user_id, dateStr);
      if (sub) {
        sub = await tx.checklist_submission.update({ where: { id: sub.id }, data: patch });
      } else {
        sub = await tx.checklist_submission.create({
          data: {
            checklist_template_id,
            template_version_id: template.current_version_id,
            organisation_user_id,
            selected_date: new Date(dateStr),
            ...patch,
          },
        });
      }

      const existing = await tx.checklist_item_response.findMany({ where: { submission_id: sub.id } });
      const seen = new Set(
        existing.map((e) => `${e.checklist_template_linked_items_id}|${e.input ?? ""}|${e.comments ?? ""}`)
      );
      const fresh = [];
      for (const r of responses) {
        const data = responseData(r, linkedById.get(r.linked_item_id), sub.id, template, organisation_user_id, dateStr);
        const key = `${data.checklist_template_linked_items_id}|${data.input ?? ""}|${data.comments ?? ""}`;
        if (seen.has(key)) continue;
        fresh.push(data);
        seen.add(key);
      }
      if (fresh.length > 0) await tx.checklist_item_response.createMany({ data: fresh });
      return sub;
    }, TX_OPTIONS);

    const history = include_history
      ? await getHistoryForTemplate(template, organisation_user_id, dateStr).catch((e) => {
          console.error("[mail] could not build the 5-day history:", e.message);
          return [];
        })
      : [];
    if (include_history) console.log(`[history] ${dateStr}: ${history.length} past entries found`);
    const mail = await trySendEmail({
      checklist_template_id,
      userName,
      userEmail,
      items: responses.map((r) => {
        const ci = linkedById.get(r.linked_item_id).ChecklistItems;
        return {
          checklist_name: ci.checklist_name,
          item_id: ci.id,
          process_id: ci.process_id || null,
          input: r.input ?? "",
          comments: r.comments || "",
        };
      }),
      templateName: template.template_name,
      dateStr,
      extras: { notesHtml: cleanNotes, history, includeHistory: Boolean(include_history) },
    });
    if (mail.status === "sent") {
      await prisma.checklist_submission
        .update({ where: { id: submission.id }, data: { email_sent_at: new Date() } })
        .catch((e) => console.error("[mail] could not store email_sent_at:", e.message));
    }

    res.status(201).json({
      message: "Checklist submitted successfully!",
      submission_id: submission.id,
      email_status: mail.status,
      email_error: mail.error,
    });
  } catch (error) {
    console.error("Error in submitChecklist:", error);
    res.status(500).json({ error: "Failed to submit checklist." });
  }
};


async function getHistoryForTemplate(template, organisation_user_id, dateStr) {
  const current = template.TemplateVersion?.ChecklistTemplateLinkedItems || [];
  const itemIds = new Set(current.map((li) => li.checklist_item_id));

  const processIds = current.map((li) => li.ChecklistItems.process_id).filter(Boolean);
  if (processIds.length) {
    const same = await prisma.checklist_items.findMany({
      where: { organisation_id: template.organisation_id, process_id: { in: processIds } },
      select: { id: true },
    });
    same.forEach((i) => itemIds.add(i.id));
  }
  if (itemIds.size === 0) return [];

  const linked = await prisma.checklist_template_linked_items.findMany({
    where: { checklist_item_id: { in: [...itemIds] } },
    select: { id: true },
  });
  if (linked.length === 0) return [];

  
  const rows = await prisma.checklist_item_response.findMany({
    where: {
      organisation_user_id,
      checklist_template_linked_items_id: { in: linked.map((l) => l.id) },
      created_at: { gte: daysBefore(dateStr, 6) },
    },
    include: { ChecklistTemplateLinkedItems: { include: { ChecklistItems: true } } },
    orderBy: { created_at: "asc" }, 
  });

  const from = dayKey(daysBefore(dateStr, 4)); 
  const to = dayKey(daysBefore(dateStr, 1)); 
  return rows
    .map((r) => {
      const ci = r.ChecklistTemplateLinkedItems?.ChecklistItems;
      return {
        date: dayKey(r.selected_date || r.created_at),
        item_id: ci?.id || null,
        item_name: ci?.checklist_name,
        process_id: ci?.process_id || null,
        input: r.input,
      };
    })
    .filter((h) => h.date >= from && h.date <= to);
}

function formatHistoryForEmail(history) {
  if (!history.length) return "";
  const byDate = {};
  for (const h of history) {
    if (!byDate[h.date]) byDate[h.date] = [];
    byDate[h.date].push(`${h.item_name}: ${h.input ?? "-"}`);
  }
  return Object.entries(byDate)
    .map(([date, lines]) => `${date}\n${lines.join("\n")}`)
    .join("\n\n");
}

const getSubmissionHistory = async (req, res) => {
  try {
    const { organisation_id, organisation_user_id } = req.user;
    const checklist_template_id = parseInt(req.query.checklist_template_id);
    const dateStr = isDateStr(req.query.selected_date) ? req.query.selected_date : toDateOnly(new Date());

    if (!checklist_template_id) {
      return res.status(400).json({ error: "checklist_template_id query param is required." });
    }

    const template = await loadSharedTemplate(organisation_id, organisation_user_id, checklist_template_id);
    if (!template) {
      return res.status(404).json({ error: "Checklist not found." });
    }

    const history = await getHistoryForTemplate(template, organisation_user_id, dateStr);
    res.status(200).json({ history });
  } catch (error) {
    console.error("Error in getSubmissionHistory:", error);
    res.status(500).json({ error: "Failed to fetch history." });
  }
};


const getMyTeams = async (req, res) => {
  try {
    const { organisation_user_id } = req.user;
    const memberships = await prisma.team_member.findMany({
      where: { organisation_user_id },
      include: { Team: true },
    });
    res.status(200).json({ teams: memberships.map((m) => ({ id: m.Team.id, name: m.Team.name })) });
  } catch (error) {
    console.error("Error in getMyTeams:", error);
    res.status(500).json({ error: "Failed to fetch your teams." });
  }
};

const joinMyTeams = async (req, res) => {
  try {
    const { organisation_id, organisation_user_id } = req.user;
    const { team_ids } = req.body;

    if (!Array.isArray(team_ids) || team_ids.length === 0) {
      return res.status(400).json({ error: "Select at least one team." });
    }
    const teams = await prisma.team.findMany({
      where: { id: { in: team_ids.map(Number) }, organisation_id },
      select: { id: true },
    });
    if (teams.length !== new Set(team_ids.map(Number)).size) {
      return res.status(400).json({ error: "One or more teams are invalid for this organisation." });
    }

    await prisma.team_member.createMany({
      data: teams.map((t) => ({ team_id: t.id, organisation_user_id })),
      skipDuplicates: true,
    });
    res.status(201).json({ message: "Teams saved." });
  } catch (error) {
    console.error("Error in joinMyTeams:", error);
    res.status(500).json({ error: "Failed to save your teams." });
  }
};

const leaveMyTeam = async (req, res) => {
  try {
    const { organisation_user_id } = req.user;
    await prisma.team_member.deleteMany({
      where: { organisation_user_id, team_id: parseInt(req.params.team_id) },
    });
    res.status(200).json({ message: "Removed from team." });
  } catch (error) {
    console.error("Error in leaveMyTeam:", error);
    res.status(500).json({ error: "Failed to leave team." });
  }
};

module.exports = {
  getMyChecklists,
  getChecklistToFill,
  sendItems,
  submitChecklist,
  getSubmissionHistory,
  getMyTeams,
  joinMyTeams,
  leaveMyTeam,
};