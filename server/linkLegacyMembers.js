/*
  Link existing users to teams based on their position.
  DRY RUN by default: nothing is saved unless you pass --apply.

  Put this file in the `server` folder.

    node linkLegacyMembers.js            -> preview
    node linkLegacyMembers.js --apply    -> save
    node linkLegacyMembers.js --inspect  -> show which table/fields it found for positions
*/
const prisma = require("./utils/prisma"); // change the path if your prisma file is elsewhere
const { Prisma } = require("@prisma/client");

/* position -> team name. Add or remove lines as you need.
   PUBLIC is ignored on purpose. "data analyst" is not here: add those people manually. */
const POSITION_TO_TEAM = {
  FULL_STACK_DEVELOPER: "Full Stack Development",
  TESTING: "Testing",
  POWER_BI_DEVELOPER: "Power BI",
  HUMAN_RESOURCE: "HR",
  SALES: "sales",
  SALESFORCE: "Salesforce",
  // BUSINESS_ANALYST: "Business Analysis",
};

/* If auto-detect fails, set these by hand, e.g. POSITION_MODEL = "organisation_user_position"; POSITION_FIELD = "position" */
let POSITION_MODEL = "Organisation_User_position";
let POSITION_FIELD = "user_position";

const APPLY = process.argv.includes("--apply");
const INSPECT = process.argv.includes("--inspect");
const NAME_FIELDS = ["position", "position_name", "name", "role", "code", "value", "title"];

const models = Prisma.dmmf.datamodel.models;
const delegate = (m) => prisma[m.name[0].toLowerCase() + m.name.slice(1)];
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

const detect = () => {
  let model = POSITION_MODEL ? models.find((m) => m.name === POSITION_MODEL) : null;
  if (!model) {
    model = models.find(
      (m) => /position/i.test(m.name) && m.fields.some((f) => f.name === "organisation_user_id")
    );
  }
  if (!model) return null;

  const direct = POSITION_FIELD
    ? model.fields.find((f) => f.name === POSITION_FIELD)
    : NAME_FIELDS.map((n) => model.fields.find((f) => f.name === n && f.type === "String")).find(Boolean);
  if (direct) return { model, field: direct.name, relation: null };

  // position stored in a related table (e.g. position_id -> position.name)
  const rel = model.fields.find((f) => f.kind === "object" && /position/i.test(f.type));
  if (rel) {
    const relModel = models.find((m) => m.name === rel.type);
    const nameField = NAME_FIELDS.map((n) => relModel.fields.find((f) => f.name === n && f.type === "String")).find(Boolean);
    if (nameField) return { model, field: nameField.name, relation: rel.name };
  }
  return { model, field: null, relation: null };
};

(async () => {
  const found = detect();

  if (INSPECT || !found || !found.field) {
    console.log("Models with 'position' in the name:");
    models
      .filter((m) => /position/i.test(m.name))
      .forEach((m) => console.log(`  ${m.name}: ${m.fields.map((f) => `${f.name}(${f.type})`).join(", ")}`));
    if (!found || !found.field) {
      console.log("\nCould not detect where positions are stored.");
      console.log("Paste the lines above and I will set POSITION_MODEL / POSITION_FIELD for you.");
      await prisma.$disconnect();
      return;
    }
  }

  console.log(`Positions read from: ${found.model.name}.${found.relation ? `${found.relation}.` : ""}${found.field}`);
  console.log(APPLY ? "MODE: APPLY (saving)\n" : "MODE: DRY RUN (nothing is saved)\n");

  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const teamByName = new Map(teams.map((t) => [norm(t.name), t]));

  const rows = await delegate(found.model).findMany({
    ...(found.relation ? { include: { [found.relation]: true } } : {}),
  });

  // organisation_user_id -> set of position names
  const userPositions = new Map();
  for (const r of rows) {
    const id = r.organisation_user_id;
    const pos = found.relation ? r[found.relation]?.[found.field] : r[found.field];
    if (!id || !pos) continue;
    if (!userPositions.has(id)) userPositions.set(id, new Set());
    userPositions.get(id).add(String(pos).trim());
  }

  const existing = new Set(
    (await prisma.team_member.findMany({ select: { team_id: true, organisation_user_id: true } })).map(
      (m) => `${m.team_id}:${m.organisation_user_id}`
    )
  );

  const toAdd = [];
  const unmapped = new Map(); // position -> count
  for (const [userId, positions] of userPositions) {
    for (const pos of positions) {
      const teamName = POSITION_TO_TEAM[pos.toUpperCase()];
      if (!teamName) {
        if (pos.toUpperCase() !== "PUBLIC") unmapped.set(pos, (unmapped.get(pos) || 0) + 1);
        continue;
      }
      const team = teamByName.get(norm(teamName));
      if (!team) {
        console.log(`Team "${teamName}" (for ${pos}) not found in the teams table, skipped.`);
        continue;
      }
      if (existing.has(`${team.id}:${userId}`)) continue;
      toAdd.push({ team_id: team.id, team: team.name, organisation_user_id: userId, position: pos });
      existing.add(`${team.id}:${userId}`);
    }
  }

  const summary = {};
  toAdd.forEach((a) => (summary[a.team] = (summary[a.team] || 0) + 1));
  console.log("Members that would be linked, per team:");
  console.table(Object.entries(summary).map(([team, members]) => ({ team, members })));

  if (unmapped.size) {
    console.log("Positions with no team mapping (ignored):");
    console.table([...unmapped.entries()].map(([position, people]) => ({ position, people })));
  }

  if (!APPLY) {
    console.log(`\n${toAdd.length} links ready. Nothing saved. Run with --apply to save.`);
    await prisma.$disconnect();
    return;
  }

  let ok = 0;
  for (const a of toAdd) {
    try {
      await prisma.team_member.create({
        data: { team_id: a.team_id, organisation_user_id: a.organisation_user_id },
      });
      ok += 1;
    } catch (e) {
      console.log(`FAILED ${a.team} / user ${a.organisation_user_id}: ${e.message.split("\n").slice(-2).join(" ")}`);
    }
  }
  console.log(`\nDone. ${ok} of ${toAdd.length} links saved.`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});