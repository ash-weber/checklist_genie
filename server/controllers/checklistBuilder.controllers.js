const prisma = require("../utils/prisma");
const { validateProcessId, normalizeCode } = require("../utils/processId");
const { effectiveTeams, legacyDue } = require("../utils/legacyTeams");

const VALID_RESPONSE_TYPES = ["Boolean", "Numeric"];
const VALID_ASSIGNEE_TYPES = ["MEMBER", "GROUP"];
const VALID_RECURRENCE = [
  "NONE", "WORKDAYS", "WEEKLY", "FORTNIGHTLY", "MONTHLY",
  "QUARTERLY", "HALF_YEARLY", "YEARLY", "CUSTOM",
];
const VALID_PRIORITY = ["HIGH", "MEDIUM", "LOW"];
const VALID_LIST_TYPES = [
  "ONBOARDING", "COMPLIANCE_AUDIT", "MAINTENANCE",
  "QUALITY_ASSURANCE", "SAFETY_CHECKS", "DAILY_OPERATIONS",
];

const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };


const validatePayload = (body, { allowNoTeams = false } = {}) => {
  const {
    title, items, assignee_type, team_ids, due_date, recurrence,
    recurrence_custom_days, workday_shift, recurrence_ends_on, priority, list_types,
  } = body;

  if (!title || !title.trim()) return { error: "Checklist title is required." };

  if (!Array.isArray(items) || items.length === 0) {
    return { error: "At least one checklist item is required." };
  }

  const cleanedItems = [];
  for (const [i, item] of items.entries()) {
    if (!item || !item.statement || !String(item.statement).trim()) {
      return { error: `Item ${i + 1}: statement is required.` };
    }
    if (!VALID_RESPONSE_TYPES.includes(item.response_type)) {
      return { error: `Item ${i + 1}: response type is required (Boolean or Numeric).` };
    }
    const pr = validateProcessId(item.process_id);
    if (pr.error) return { error: `Item ${i + 1}: ${pr.error}` };
    cleanedItems.push({ ...item, process_id: pr.value }); 
  }

  const pids = cleanedItems.map((it) => it.process_id).filter(Boolean);
  if (new Set(pids).size !== pids.length) {
    return { error: "The same Process ID is used twice in this checklist." };
  }

  if (!VALID_ASSIGNEE_TYPES.includes(assignee_type)) {
    return { error: "assignee_type must be MEMBER or GROUP." };
  }
  if (!Array.isArray(team_ids) || (team_ids.length === 0 && !allowNoTeams)) {
    return { error: "At least one team must be selected." };
  }
  if (!due_date) return { error: "Due date is required." };

  const recurrenceValue = recurrence && VALID_RECURRENCE.includes(recurrence) ? recurrence : "NONE";
  if (recurrenceValue === "CUSTOM" && !recurrence_custom_days) {
    return { error: "recurrence_custom_days is required when recurrence is CUSTOM." };
  }
  if (priority && !VALID_PRIORITY.includes(priority)) {
    return { error: "priority must be HIGH, MEDIUM, LOW, or omitted." };
  }

  return {
    data: {
      title: title.trim(),
      items: cleanedItems,
      assignee_type,
      team_ids: [...new Set(team_ids.map(Number))],
      due_date,
      recurrenceValue,
      recurrence_custom_days: recurrenceValue === "CUSTOM" ? recurrence_custom_days : null,
      workday_shift: Boolean(workday_shift),
      recurrence_ends_on: recurrence_ends_on || null,
      priority: priority || null,
      cleanedListTypes: Array.isArray(list_types)
        ? list_types.filter((lt) => VALID_LIST_TYPES.includes(lt))
        : [],
    },
  };
};

const teamsAreValid = async (organisation_id, team_ids) => {
  const teams = await prisma.team.findMany({ where: { id: { in: team_ids }, organisation_id } });
  return teams.length === team_ids.length;
};


const loadExistingByProcessId = async (organisation_id, items) => {
  const processIds = items.map((it) => it.process_id).filter(Boolean);
  const rows = processIds.length
    ? await prisma.checklist_items.findMany({
        where: { organisation_id, process_id: { in: processIds } },
      })
    : [];
  return new Map(rows.map((it) => [normalizeCode(it.process_id), it]));
};

const httpError = (status, message) => {
  const e = new Error(message);
  e.status = status;
  return e;
};


const moveItemHistory = async (tx, checklist_template_id, fromItemId, toItemId) => {
  const versions = await tx.checklist_template_version.findMany({
    where: { checklist_template_id },
    select: { version_id: true },
  });
  const linked = await tx.checklist_template_linked_items.findMany({
    where: {
      template_version_id: { in: versions.map((v) => v.version_id) },
      checklist_item_id: { in: [fromItemId, toItemId] },
    },
    select: { id: true, template_version_id: true, checklist_item_id: true },
  });
  const hasTarget = new Set(
    linked.filter((l) => l.checklist_item_id === toItemId).map((l) => l.template_version_id)
  );
  const ids = linked
    .filter((l) => l.checklist_item_id === fromItemId && !hasTarget.has(l.template_version_id))
    .map((l) => l.id);
  if (ids.length) {
    await tx.checklist_template_linked_items.updateMany({
      where: { id: { in: ids } },
      data: { checklist_item_id: toItemId },
    });
  }
  return new Set(ids);
};


const createChecklist = async (req, res) => {
  try {
    const { organisation_id, organisation_user_id } = req.user;
    const { error, data } = validatePayload(req.body);
    if (error) return res.status(400).json({ error });

    if (!(await teamsAreValid(organisation_id, data.team_ids))) {
      return res.status(400).json({ error: "One or more teams are invalid for this organisation." });
    }

    const existingByProcessId = await loadExistingByProcessId(organisation_id, data.items);

    const result = await prisma.$transaction(async (tx) => {
      const template = await tx.checklist_template.create({
        data: {
          template_name: data.title,
          organisation_id,
          organisation_user_id,
          created_at: new Date(),
          due_date: new Date(data.due_date),
          recurrence: data.recurrenceValue,
          recurrence_custom_days: data.recurrence_custom_days,
          workday_shift: data.workday_shift,
          recurrence_ends_on: data.recurrence_ends_on ? new Date(data.recurrence_ends_on) : null,
          assignee_type: data.assignee_type,
          priority: data.priority,
        },
      });

      const version = await tx.checklist_template_version.create({
        data: { checklist_template_id: template.id, organisation_user_id, created_at: new Date() },
      });

      await tx.checklist_template.update({
        where: { id: template.id },
        data: { current_version_id: version.version_id },
      });

      const checklistItems = await Promise.all(
        data.items.map((item) => {
          const existing = item.process_id ? existingByProcessId.get(item.process_id) : null;
          if (existing) return existing;
          return tx.checklist_items.create({
            data: {
              checklist_name: item.statement.trim(),
              notes: item.notes ? item.notes.trim() : null,
              process_id: item.process_id || null,
              organisation_user_id,
              organisation_id,
              Instructions: item.notes ? item.notes.trim() : "",
              input_type: item.response_type,
              created_at: new Date(),
            },
          });
        })
      );

      await tx.checklist_template_linked_items.createMany({
        data: checklistItems.map((ci, index) => ({
          template_version_id: version.version_id,
          checklist_item_id: ci.id,
          created_at: new Date(),
          sort_order: index,
          is_hidden: Boolean(data.items[index].hidden),
        })),
      });

      if (data.cleanedListTypes.length > 0) {
        await tx.template_list_type.createMany({
          data: data.cleanedListTypes.map((lt) => ({
            checklist_template_id: template.id,
            list_type: lt,
          })),
          skipDuplicates: true,
        });
      }

      await tx.template_shared_team.createMany({
        data: data.team_ids.map((team_id) => ({ checklist_template_id: template.id, team_id })),
        skipDuplicates: true,
      });

      return template;
    }, TX_OPTIONS);

    res.status(201).json({
      message: "Your checklist is created and shared!",
      checklist_template_id: result.id,
    });
  } catch (error) {
    console.error("Error in createChecklist:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Duplicate ProcessID within this organisation." });
    }
    res.status(500).json({ error: "Failed to create checklist." });
  }
};


const updateChecklist = async (req, res) => {
  try {
    const { organisation_id, organisation_user_id } = req.user;
    const id = parseInt(req.params.id);

    const { error, data } = validatePayload(req.body, { allowNoTeams: true });
    if (error) return res.status(400).json({ error });

    if (data.items.every((it) => Boolean(it.hidden))) {
      return res.status(400).json({ error: "At least one item must stay visible." });
    }

    const template = await prisma.checklist_template.findFirst({
      where: { id, organisation_id },
      include: {
        SharedTeams: { include: { Team: true } },
        Tags: true,
        TemplateVersion: {
          include: {
            ChecklistTemplateLinkedItems: {
              orderBy: { sort_order: "asc" },
              include: { ChecklistItems: true },
            },
          },
        },
      },
    });
    if (!template) return res.status(404).json({ error: "Checklist not found." });

    if (!(await teamsAreValid(organisation_id, data.team_ids))) {
      return res.status(400).json({ error: "One or more teams are invalid for this organisation." });
    }

    const existingByProcessId = await loadExistingByProcessId(organisation_id, data.items);
    const currentLinked = template.TemplateVersion?.ChecklistTemplateLinkedItems || [];
    const currentByItemId = new Map(currentLinked.map((li) => [li.checklist_item_id, li]));

    
    const orgTeams = await prisma.team.findMany({ where: { organisation_id } });
    const isLegacy = template.SharedTeams.length === 0;
    const ld = legacyDue(template);
    const effIds = effectiveTeams(template, orgTeams).map((x) => x.id).sort((a, b) => a - b);
    const newIds = [...data.team_ids].sort((a, b) => a - b);
    const day = (v) => String(v instanceof Date ? v.toISOString() : v || "").slice(0, 10);
    if (!isLegacy && data.team_ids.length === 0) {
      return res.status(400).json({ error: "At least one team must be selected." });
    }
    const keepLegacyDetails =
      isLegacy &&
      day(data.due_date) === day(ld.due_date) &&
      data.recurrenceValue === ld.recurrence &&
      data.assignee_type === (template.assignee_type || "MEMBER");
    const keepLegacyTeams =
      isLegacy && effIds.length === newIds.length && effIds.every((v, i) => v === newIds[i]);

    await prisma.$transaction(async (tx) => {
      await tx.checklist_template.update({
        where: { id },
        data: {
          template_name: data.title,
          workday_shift: data.workday_shift,
          priority: data.priority,
          ...(keepLegacyDetails
            ? {}
            : {
                due_date: new Date(data.due_date),
                recurrence: data.recurrenceValue,
                recurrence_custom_days: data.recurrence_custom_days,
                recurrence_ends_on: data.recurrence_ends_on ? new Date(data.recurrence_ends_on) : null,
                assignee_type: data.assignee_type,
              }),
        },
      });

      const resolved = [];
      for (const item of data.items) {
        const statement = item.statement.trim();
        const notes = item.notes ? String(item.notes).trim() : "";
        const pid = item.process_id || null;

        let row = null;
        if (pid && existingByProcessId.has(pid)) {
          row = existingByProcessId.get(pid);

          if (item.item_id) {
            const curLink = currentByItemId.get(Number(item.item_id));
            const cur = curLink?.ChecklistItems;
            if (
              cur &&
              !cur.process_id &&
              cur.id !== row.id &&
              cur.checklist_name === statement &&
              (cur.notes || "") === notes &&
              cur.input_type === item.response_type &&
              row.input_type === cur.input_type
            ) {
              const moved = await moveItemHistory(tx, id, cur.id, row.id);
              
              for (const li of currentLinked) {
                if (moved.has(li.id)) li.checklist_item_id = row.id;
              }
            }
          }
        } else if (pid && item.item_id) {
          
          const cur = currentByItemId.get(Number(item.item_id))?.ChecklistItems;
          if (
            cur &&
            !cur.process_id &&
            cur.checklist_name === statement &&
            (cur.notes || "") === notes &&
            cur.input_type === item.response_type
          ) {
            row = await tx.checklist_items.update({ where: { id: cur.id }, data: { process_id: pid } });
          }
        } else if (!pid && item.item_id) {
          const cur = currentByItemId.get(Number(item.item_id))?.ChecklistItems;
          if (
            cur &&
            cur.checklist_name === statement &&
            (cur.notes || "") === notes &&
            cur.input_type === item.response_type
          ) {
            row = cur;
          }
        }
        if (!row) {
          row = await tx.checklist_items.create({
            data: {
              checklist_name: statement,
              notes: notes || null,
              process_id: pid,
              organisation_user_id,
              organisation_id,
              Instructions: notes,
              input_type: item.response_type,
              created_at: new Date(),
            },
          });
        }
        resolved.push({ row, hidden: Boolean(item.hidden) });
      }

      if (new Set(resolved.map((r) => r.row.id)).size !== resolved.length) {
        throw httpError(400, "The same item is added twice in this checklist.");
      }

      const sameList =
        currentLinked.length === resolved.length &&
        currentLinked.every((li, i) => li.checklist_item_id === resolved[i].row.id);

      if (sameList) {
        for (let i = 0; i < currentLinked.length; i += 1) {
          if (currentLinked[i].is_hidden !== resolved[i].hidden) {
            await tx.checklist_template_linked_items.update({
              where: { id: currentLinked[i].id },
              data: { is_hidden: resolved[i].hidden },
            });
          }
        }
      } else {
        const version = await tx.checklist_template_version.create({
          data: { checklist_template_id: id, organisation_user_id, created_at: new Date() },
        });
        await tx.checklist_template_linked_items.createMany({
          data: resolved.map((r, index) => ({
            template_version_id: version.version_id,
            checklist_item_id: r.row.id,
            created_at: new Date(),
            sort_order: index,
            is_hidden: r.hidden,
          })),
        });
        await tx.checklist_template.update({
          where: { id },
          data: { current_version_id: version.version_id },
        });
      }

      await tx.template_list_type.deleteMany({ where: { checklist_template_id: id } });
      if (data.cleanedListTypes.length > 0) {
        await tx.template_list_type.createMany({
          data: data.cleanedListTypes.map((lt) => ({ checklist_template_id: id, list_type: lt })),
          skipDuplicates: true,
        });
      }
      if (!keepLegacyTeams) {
        await tx.template_shared_team.deleteMany({ where: { checklist_template_id: id } });
        await tx.template_shared_team.createMany({
          data: data.team_ids.map((team_id) => ({ checklist_template_id: id, team_id })),
          skipDuplicates: true,
        });
      }
    }, TX_OPTIONS);

    res.status(200).json({ message: "Your checklist is updated!", checklist_template_id: id });
  } catch (error) {
    console.error("Error in updateChecklist:", error);
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Duplicate ProcessID within this organisation." });
    }
    res.status(500).json({ error: "Failed to update checklist." });
  }
};


const setItemHidden = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const id = parseInt(req.params.id);
    const linkedId = parseInt(req.params.linked_item_id);
    const { hidden } = req.body;

    if (typeof hidden !== "boolean") {
      return res.status(400).json({ error: "hidden must be true or false." });
    }

    const template = await prisma.checklist_template.findFirst({ where: { id, organisation_id } });
    if (!template || !template.current_version_id) {
      return res.status(404).json({ error: "Checklist not found." });
    }

    const linked = await prisma.checklist_template_linked_items.findFirst({
      where: { id: linkedId, template_version_id: template.current_version_id },
    });
    if (!linked) return res.status(404).json({ error: "Item not found in this checklist." });

    if (hidden) {
      const othersVisible = await prisma.checklist_template_linked_items.count({
        where: {
          template_version_id: template.current_version_id,
          is_hidden: false,
          id: { not: linkedId },
        },
      });
      if (othersVisible === 0) {
        return res.status(400).json({ error: "At least one item must stay visible." });
      }
    }

    await prisma.checklist_template_linked_items.update({
      where: { id: linkedId },
      data: { is_hidden: hidden },
    });

    res.status(200).json({ message: hidden ? "Item hidden." : "Item is visible again.", hidden });
  } catch (error) {
    console.error("Error in setItemHidden:", error);
    res.status(500).json({ error: "Failed to update item." });
  }
};

/* ------------------------------ read ------------------------------ */

// GET /checklists
// CHANGED: Tags is included so old (position-based) checklists show their position, and
// effectiveTeams() maps old checklists (no shared team) to the teams matching their position.
const getChecklists = async (req, res) => {
  try {
    const { organisation_id } = req.user;

    const [templates, orgTeams] = await Promise.all([
      prisma.checklist_template.findMany({
        where: { organisation_id, is_archived: false },
        orderBy: { created_at: "desc" },
        include: {
          ListTypes: true,
          SharedTeams: { include: { Team: true } },
          Tags: true,
        },
      }),
      prisma.team.findMany({ where: { organisation_id } }),
    ]);

    res.status(200).json({
      checklists: templates.map((t) => {
        const teams = effectiveTeams(t, orgTeams);
        const due = legacyDue(t);
        return {
          id: t.id,
          title: t.template_name,
          due_date: due.due_date,
          recurrence: due.recurrence,
          recurrence_custom_days: t.recurrence_custom_days,
          recurrence_ends_on: t.recurrence_ends_on,
          priority: t.priority,
          assignee_type: t.assignee_type,
          position: t.Tags ? t.Tags.user_position : null,
          list_types: t.ListTypes.map((lt) => lt.list_type),
          shared_to: teams.map((x) => x.name),
          shared_team_ids: teams.map((x) => x.id),
        };
      }),
    });
  } catch (error) {
    console.error("Error in getChecklists:", error);
    res.status(500).json({ error: "Failed to fetch checklists." });
  }
};

const getChecklistById = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const id = parseInt(req.params.id);
    const includeHidden = req.query.include_hidden === "true";

    const template = await prisma.checklist_template.findFirst({
      where: { id, organisation_id },
      include: {
        ListTypes: true,
        SharedTeams: { include: { Team: true } },
        Tags: true,
        TemplateVersion: {
          include: {
            ChecklistTemplateLinkedItems: {
              where: includeHidden ? {} : { is_hidden: false },
              orderBy: { sort_order: "asc" },
              include: { ChecklistItems: true },
            },
          },
        },
      },
    });

    if (!template) {
      return res.status(404).json({ error: "Checklist not found." });
    }

    const orgTeams = await prisma.team.findMany({ where: { organisation_id } });
    const due = legacyDue(template);

    res.status(200).json({
      id: template.id,
      title: template.template_name,
      due_date: due.due_date,
      recurrence: due.recurrence,
      recurrence_custom_days: template.recurrence_custom_days,
      recurrence_ends_on: template.recurrence_ends_on,
      workday_shift: template.workday_shift,
      priority: template.priority,
      assignee_type: template.assignee_type || "MEMBER",
      legacy: template.SharedTeams.length === 0, 
      list_types: template.ListTypes.map((lt) => lt.list_type),
      shared_to: effectiveTeams(template, orgTeams),
      items: (template.TemplateVersion?.ChecklistTemplateLinkedItems || []).map((li) => ({
        linked_item_id: li.id,
        item_id: li.ChecklistItems.id,
        statement: li.ChecklistItems.checklist_name,
        notes: li.ChecklistItems.notes,
        response_type: li.ChecklistItems.input_type,
        process_id: li.ChecklistItems.process_id,
        is_hidden: li.is_hidden,
      })),
    });
  } catch (error) {
    console.error("Error in getChecklistById:", error);
    res.status(500).json({ error: "Failed to fetch checklist." });
  }
};

const searchItemsByProcessId = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const q = normalizeCode(req.query.process_id);

    if (!q) {
      return res.status(400).json({ error: "process_id query param is required." });
    }

    const items = await prisma.checklist_items.findMany({
      where: { organisation_id, process_id: { contains: q } },
      take: 10,
    });

    res.status(200).json({ items });
  } catch (error) {
    console.error("Error in searchItemsByProcessId:", error);
    res.status(500).json({ error: "Failed to search items." });
  }
};

module.exports = {
  createChecklist,
  updateChecklist,
  setItemHidden,
  getChecklists,
  getChecklistById,
  searchItemsByProcessId,
};