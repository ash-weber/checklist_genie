const prisma = require("../utils/prisma");
const { hasProcessId, groupOf } = require("../utils/processId");

const pad = (n) => String(n).padStart(2, "0");
const toDateOnly = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDateStr = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const MAX_RANGE_DAYS = 90; 
const BATCH_SIZE = 2000; 
const ENTRIES_LIMIT = 300;
const VALID_GROUP_BY = ["day", "week", "month"];


const periodKey = (dateStr, groupBy) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (groupBy === "month") return `${y}-${pad(m)}`;
  if (groupBy === "week") {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    return dt.toISOString().slice(0, 10);
  }
  return dateStr;
};

// every bucket between from..to, so charts have no gaps
const allPeriods = (from, to, groupBy) => {
  const keys = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(`${to}T00:00:00Z`);
  while (cur <= end) {
    const k = periodKey(cur.toISOString().slice(0, 10), groupBy);
    if (keys[keys.length - 1] !== k) keys.push(k);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return keys;
};

const resolveRange = (query) => {
  const today = new Date();
  const defFrom = new Date(today);
  defFrom.setDate(defFrom.getDate() - 29);
  const from = isDateStr(query.from) ? query.from : toDateOnly(defFrom);
  const to = isDateStr(query.to) ? query.to : toDateOnly(today);
  if (from > to) return { error: "From date must be before To date." };
  const days = (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000;
  if (days > MAX_RANGE_DAYS) return { error: `Date range can be at most ${MAX_RANGE_DAYS} days.` };
  const groupBy = VALID_GROUP_BY.includes(query.group_by) ? query.group_by : "day";
  return { from, to, groupBy };
};

const dayOf = (r) =>
  r.selected_date && isDateStr(String(r.selected_date).slice(0, 10))
    ? String(r.selected_date).slice(0, 10)
    : toDateOnly(r.created_at);

const round2 = (n) => Math.round(n * 100) / 100;

const norm = (v) => String(v ?? "").trim().toLowerCase();


const parseAnswer = (type, input) => {
  if (type === "Numeric") {
    if (input === null || input === undefined || input === "") return null;
    const n = Number(input);
    return Number.isFinite(n) ? { n } : null;
  }
  const v = norm(input);
  return v === "yes" || v === "no" ? { v } : null;
};

const teamFilter = async (organisation_id, teamIdRaw) => {
  const team_id = parseInt(teamIdRaw);
  if (!team_id) return { userIds: null };
  const team = await prisma.team.findFirst({ where: { id: team_id, organisation_id } });
  if (!team) return { error: "Team not found." };
  const members = await prisma.team_member.findMany({
    where: { team_id },
    select: { organisation_user_id: true },
  });
  return { userIds: members.map((m) => m.organisation_user_id) };
};

const responseWhere = (organisation_id, { from, to }, userIds, processId) => {
  const where = {
    selected_date: { gte: from, lte: to },
    ChecklistTemplateLinkedItems: {
      ChecklistItems: {
        organisation_id,
        process_id: processId ? processId : { not: null },
      },
    },
  };
  if (userIds) where.organisation_user_id = { in: userIds };
  return where;
};

const getProcessInsights = async (req, res) => {
  try {
    const { organisation_id } = req.user;

    const range = resolveRange(req.query);
    if (range.error) return res.status(400).json({ error: range.error });
    const { from, to, groupBy } = range;

    const tf = await teamFilter(organisation_id, req.query.team_id);
    if (tf.error) return res.status(404).json({ error: tf.error });

    const [defined, bpRows] = await Promise.all([
      prisma.checklist_items.findMany({
        where: { organisation_id, process_id: { not: null } },
        select: { id: true, process_id: true, checklist_name: true, input_type: true, created_at: true },
        orderBy: { created_at: "asc" },
      }),
      prisma.business_process.findMany({
        where: { organisation_id },
        select: { code: true, name: true },
      }),
    ]);

    const bpNames = new Map(bpRows.map((b) => [b.code, b.name]));

    const periods = allPeriods(from, to, groupBy);
    const map = new Map();
    const ensure = (pid, name, type) => {
      if (!map.has(pid)) {
        const group = groupOf(pid);
        map.set(pid, {
          process_id: pid,
          group,
          group_name: bpNames.get(group) || null, 
          name, 
          input_type: type, 
          item_names: new Set(),
          item_types: new Set(),
          skipped_mismatch: 0,
          entries: 0,
          total: 0,
          numeric_count: 0,
          yes: 0,
          no: 0,
          users: new Set(),
          checklists: new Set(),
          by_checklist: new Map(),
          last_entry: null,
          buckets: new Map(periods.map((p) => [p, { value: 0, entries: 0 }])),
        });
      }
      return map.get(pid);
    };

    for (const it of defined) {
      if (!hasProcessId(it.process_id)) continue;
      const p = ensure(it.process_id, it.checklist_name, it.input_type);
      p.item_names.add(it.checklist_name);
      p.item_types.add(it.input_type);
    }

    const allUsers = new Set();

    const addResponse = (r) => {
      const item = r.ChecklistTemplateLinkedItems?.ChecklistItems;
      if (!item || !hasProcessId(item.process_id)) return;
      const p = ensure(item.process_id, item.checklist_name, item.input_type);

      if (item.input_type !== p.input_type) {
        p.skipped_mismatch += 1;
        return;
      }

      const parsed = parseAnswer(p.input_type, r.input);
      if (!parsed) return; // note-only / invalid answer

      const day = dayOf(r);
      const bucket = p.buckets.get(periodKey(day, groupBy));

      if (p.input_type === "Numeric") {
        p.total += parsed.n;
        p.numeric_count += 1;
        if (bucket) bucket.value += parsed.n;
      } else {
        if (parsed.v === "yes") {
          p.yes += 1;
          if (bucket) bucket.value += 1;
        } else {
          p.no += 1;
        }
      }

      p.entries += 1;
      if (bucket) bucket.entries += 1;
      if (r.organisation_user_id) {
        p.users.add(r.organisation_user_id);
        allUsers.add(r.organisation_user_id);
      }
      const tpl = r.ChecklistTemplateLinkedItems?.ChecklistTemplateVersion?.ChecklistTemplate?.template_name;
      if (tpl) {
        p.checklists.add(tpl);
        p.by_checklist.set(tpl, (p.by_checklist.get(tpl) || 0) + 1);
      }
      if (!p.last_entry || day > p.last_entry) p.last_entry = day;
    };

    const where = responseWhere(organisation_id, range, tf.userIds);
    let cursor = null;
    for (;;) {
      const rows = await prisma.checklist_item_response.findMany({
        where,
        select: {
          id: true,
          input: true,
          selected_date: true,
          created_at: true,
          organisation_user_id: true,
          ChecklistTemplateLinkedItems: {
            select: {
              ChecklistItems: { select: { process_id: true, checklist_name: true, input_type: true } },
              ChecklistTemplateVersion: {
                select: { ChecklistTemplate: { select: { template_name: true } } },
              },
            },
          },
        },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (rows.length === 0) break;
      for (const r of rows) addResponse(r);
      if (rows.length < BATCH_SIZE) break;
      cursor = rows[rows.length - 1].id;
    }

    const processes = [...map.values()]
      .sort((a, b) => a.process_id.localeCompare(b.process_id, undefined, { numeric: true }))
      .map((p) => ({
        process_id: p.process_id,
        group: p.group,
        group_name: p.group_name,
        name: p.name,
        input_type: p.input_type,
        type_conflict: p.item_types.size > 1,
        item_names: [...p.item_names],
        skipped_mismatch: p.skipped_mismatch,
        entries: p.entries,
        total: p.input_type === "Numeric" ? round2(p.total) : null,
        average: p.input_type === "Numeric" && p.numeric_count ? round2(p.total / p.numeric_count) : null,
        yes: p.input_type === "Boolean" ? p.yes : null,
        no: p.input_type === "Boolean" ? p.no : null,
        yes_rate: p.input_type === "Boolean" && p.yes + p.no > 0 ? round2((p.yes / (p.yes + p.no)) * 100) : null,
        contributors: p.users.size,
        checklists: [...p.checklists],
        by_checklist: [...p.by_checklist.entries()]
          .map(([name, entries]) => ({ name, entries }))
          .sort((a, b) => b.entries - a.entries),
        last_entry: p.last_entry,
        series: periods.map((k) => ({ period: k, ...p.buckets.get(k), value: round2(p.buckets.get(k).value) })),
      }));

    res.status(200).json({
      from,
      to,
      group_by: groupBy,
      max_range_days: MAX_RANGE_DAYS,
      team_members: tf.userIds ? tf.userIds.length : null, // null = no team filter
      summary: {
        processes: processes.length,
        with_data: processes.filter((p) => p.entries > 0).length,
        entries: processes.reduce((s, p) => s + p.entries, 0),
        contributors: allUsers.size,
      },
      processes,
    });
  } catch (error) {
    console.error("Error in getProcessInsights:", error);
    res.status(500).json({ error: "Failed to load insights." });
  }
};


const getProcessEntries = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const processId = String(req.params.process_id || "").trim();
    if (!processId) return res.status(400).json({ error: "process_id is required." });

    const range = resolveRange(req.query);
    if (range.error) return res.status(400).json({ error: range.error });

    const tf = await teamFilter(organisation_id, req.query.team_id);
    if (tf.error) return res.status(404).json({ error: tf.error });

    const first = await prisma.checklist_items.findFirst({
      where: { organisation_id, process_id: processId },
      orderBy: { created_at: "asc" },
      select: { input_type: true },
    });
    const processType = first?.input_type;

    const where = responseWhere(organisation_id, range, tf.userIds, processId);
    const PAGE = 500;
    const MAX_PAGES = 6;
    const out = [];
    let cursor = null;

    for (let page = 0; page < MAX_PAGES && out.length < ENTRIES_LIMIT; page++) {
      const rows = await prisma.checklist_item_response.findMany({
        where,
        orderBy: [{ selected_date: "desc" }, { id: "desc" }],
        take: PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          OrganisationUserChecklistItemResponse: {
            include: { user: { select: { name: true, email: true } } },
          },
          ChecklistTemplateLinkedItems: {
            include: {
              ChecklistItems: { select: { input_type: true } },
              ChecklistTemplateVersion: {
                include: { ChecklistTemplate: { select: { template_name: true } } },
              },
            },
          },
        },
      });
      if (rows.length === 0) break;

      for (const r of rows) {
        const itemType = r.ChecklistTemplateLinkedItems?.ChecklistItems?.input_type;
        if (!processType || itemType !== processType) continue; // mixed-type item
        if (!parseAnswer(processType, r.input)) continue; // note-only / invalid
        out.push(r);
        if (out.length >= ENTRIES_LIMIT) break;
      }

      if (rows.length < PAGE) break;
      cursor = rows[rows.length - 1].id;
    }

    res.status(200).json({
      process_id: processId,
      limit: ENTRIES_LIMIT,
      entries: out.map((r) => ({
        id: r.id,
        date: dayOf(r),
        input: r.input,
        comments: r.comments,
        user:
          r.OrganisationUserChecklistItemResponse?.user?.name ||
          r.OrganisationUserChecklistItemResponse?.user?.email ||
          "",
        checklist:
          r.ChecklistTemplateLinkedItems?.ChecklistTemplateVersion?.ChecklistTemplate?.template_name || "",
      })),
    });
  } catch (error) {
    console.error("Error in getProcessEntries:", error);
    res.status(500).json({ error: "Failed to load entries." });
  }
};

module.exports = { getProcessInsights, getProcessEntries };