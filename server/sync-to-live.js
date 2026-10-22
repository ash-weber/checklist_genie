
const { PrismaClient, Prisma } = require("@prisma/client");

const mode = process.argv[2];
const APPLY = process.argv.includes("--apply");
const LOCAL_URL = process.env.LOCAL_URL;
const LIVE_URL = process.env.LIVE_URL;

const client = (url) => new PrismaClient({ datasources: { db: { url } } });
const deBig = (v) => (typeof v === "bigint" ? Number(v) : v);
const q = async (db, sql, ...params) =>
  (await db.$queryRawUnsafe(sql, ...params)).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, deBig(v)])));
const lc = (s) => String(s ?? "").trim().toLowerCase();
const harmless = (e) => /already exists|duplicate/i.test(e.message);

const POSITIONS = [
  "FULL_STACK_DEVELOPER", "POWER_BI_DEVELOPER", "SALES", "HUMAN_RESOURCE", "TESTING",
  "SALESFORCE", "PUBLIC", "DIGITAL_TRANSFORMATION", "MARKETING", "ERODE_INTERN",
];
const ENUM_SQL = `ENUM(${POSITIONS.map((p) => `'${p}'`).join(", ")}) NULL`;
const CHARSET = "DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci";

const CREATES = [
  ["checklist_submission", `CREATE TABLE IF NOT EXISTS \`checklist_submission\` (
    \`id\` INTEGER NOT NULL AUTO_INCREMENT,
    \`checklist_template_id\` INTEGER NOT NULL,
    \`template_version_id\` INTEGER NOT NULL,
    \`organisation_user_id\` INTEGER NOT NULL,
    \`selected_date\` DATE NOT NULL,
    \`notes_html\` MEDIUMTEXT NULL,
    \`include_history\` BOOLEAN NOT NULL DEFAULT false,
    \`status\` VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
    \`submitted_at\` DATETIME(3) NULL,
    \`email_sent_at\` DATETIME(3) NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX \`checklist_submission_organisation_user_id_idx\`(\`organisation_user_id\`),
    INDEX \`checklist_submission_checklist_template_id_idx\`(\`checklist_template_id\`),
    UNIQUE INDEX \`uq_submission_per_day\`(\`checklist_template_id\`, \`organisation_user_id\`, \`selected_date\`),
    PRIMARY KEY (\`id\`)
  ) ${CHARSET}`],
  ["checklist_item_claim", `CREATE TABLE IF NOT EXISTS \`checklist_item_claim\` (
    \`id\` INTEGER NOT NULL AUTO_INCREMENT,
    \`checklist_template_id\` INTEGER NOT NULL,
    \`linked_item_id\` INTEGER NOT NULL,
    \`organisation_user_id\` INTEGER NOT NULL,
    \`selected_date\` DATE NOT NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX \`checklist_item_claim_checklist_template_id_idx\`(\`checklist_template_id\`),
    INDEX \`checklist_item_claim_organisation_user_id_idx\`(\`organisation_user_id\`),
    UNIQUE INDEX \`uq_claim_item_day\`(\`linked_item_id\`, \`selected_date\`),
    PRIMARY KEY (\`id\`)
  ) ${CHARSET}`],
  ["business_process", `CREATE TABLE IF NOT EXISTS \`business_process\` (
    \`id\` INTEGER NOT NULL AUTO_INCREMENT,
    \`organisation_id\` INTEGER NOT NULL,
    \`code\` VARCHAR(50) NOT NULL,
    \`name\` VARCHAR(100) NOT NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX \`business_process_organisation_id_idx\`(\`organisation_id\`),
    UNIQUE INDEX \`uq_business_process_org_code\`(\`organisation_id\`, \`code\`),
    PRIMARY KEY (\`id\`)
  ) ${CHARSET}`],
  ["user_preference", `CREATE TABLE IF NOT EXISTS \`user_preference\` (
    \`id\` INTEGER NOT NULL AUTO_INCREMENT,
    \`user_id\` INTEGER NOT NULL,
    \`theme\` VARCHAR(10) NOT NULL DEFAULT 'light',
    \`font_size\` VARCHAR(10) NOT NULL DEFAULT 'Medium',
    \`notifications\` BOOLEAN NOT NULL DEFAULT false,
    \`reminder_every\` INTEGER NOT NULL DEFAULT 1,
    \`reminder_unit\` VARCHAR(10) NOT NULL DEFAULT 'Hours',
    \`last_reminded_at\` DATETIME(3) NULL,
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX \`user_preference_user_id_key\`(\`user_id\`),
    PRIMARY KEY (\`id\`)
  ) ${CHARSET}`],
  ["_TemplateItems", `CREATE TABLE IF NOT EXISTS \`_TemplateItems\` (
    \`A\` INTEGER NOT NULL,
    \`B\` INTEGER NOT NULL,
    UNIQUE INDEX \`_TemplateItems_AB_unique\`(\`A\`, \`B\`),
    INDEX \`_TemplateItems_B_index\`(\`B\`)
  ) ${CHARSET}`],
];

const ADD_COLUMN = ["checklist_item_response.submission_id",
  "ALTER TABLE `checklist_item_response` ADD COLUMN IF NOT EXISTS `submission_id` INTEGER NULL"];
const ADD_INDEX = ["checklist_item_response_submission_id_idx",
  "CREATE INDEX IF NOT EXISTS `checklist_item_response_submission_id_idx` ON `checklist_item_response`(`submission_id`)"];
const WIDEN = [
  ["User.image to MEDIUMTEXT", "ALTER TABLE `User` MODIFY `image` MEDIUMTEXT NULL"],
  ["Organisation_Users.user_type default", "ALTER TABLE `Organisation_Users` MODIFY `user_type` VARCHAR(191) NULL DEFAULT 'USER'"],
];

const FKS = [
  ["checklist_item_response", "checklist_item_response_submission_id_fkey",
    "ALTER TABLE `checklist_item_response` ADD CONSTRAINT `checklist_item_response_submission_id_fkey` FOREIGN KEY (`submission_id`) REFERENCES `checklist_submission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
  ["checklist_submission", "checklist_submission_checklist_template_id_fkey",
    "ALTER TABLE `checklist_submission` ADD CONSTRAINT `checklist_submission_checklist_template_id_fkey` FOREIGN KEY (`checklist_template_id`) REFERENCES `checklist_template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
  ["checklist_submission", "checklist_submission_template_version_id_fkey",
    "ALTER TABLE `checklist_submission` ADD CONSTRAINT `checklist_submission_template_version_id_fkey` FOREIGN KEY (`template_version_id`) REFERENCES `checklist_template_version`(`version_id`) ON DELETE CASCADE ON UPDATE CASCADE"],
  ["checklist_submission", "checklist_submission_organisation_user_id_fkey",
    "ALTER TABLE `checklist_submission` ADD CONSTRAINT `checklist_submission_organisation_user_id_fkey` FOREIGN KEY (`organisation_user_id`) REFERENCES `Organisation_Users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
  ["checklist_item_claim", "checklist_item_claim_checklist_template_id_fkey",
    "ALTER TABLE `checklist_item_claim` ADD CONSTRAINT `checklist_item_claim_checklist_template_id_fkey` FOREIGN KEY (`checklist_template_id`) REFERENCES `checklist_template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
  ["checklist_item_claim", "checklist_item_claim_linked_item_id_fkey",
    "ALTER TABLE `checklist_item_claim` ADD CONSTRAINT `checklist_item_claim_linked_item_id_fkey` FOREIGN KEY (`linked_item_id`) REFERENCES `checklist_template_linked_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
  ["checklist_item_claim", "checklist_item_claim_organisation_user_id_fkey",
    "ALTER TABLE `checklist_item_claim` ADD CONSTRAINT `checklist_item_claim_organisation_user_id_fkey` FOREIGN KEY (`organisation_user_id`) REFERENCES `Organisation_Users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
  ["business_process", "business_process_organisation_id_fkey",
    "ALTER TABLE `business_process` ADD CONSTRAINT `business_process_organisation_id_fkey` FOREIGN KEY (`organisation_id`) REFERENCES `Organisation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
  ["user_preference", "user_preference_user_id_fkey",
    "ALTER TABLE `user_preference` ADD CONSTRAINT `user_preference_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
  ["_TemplateItems", "_TemplateItems_A_fkey",
    "ALTER TABLE `_TemplateItems` ADD CONSTRAINT `_TemplateItems_A_fkey` FOREIGN KEY (`A`) REFERENCES `checklist_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
  ["_TemplateItems", "_TemplateItems_B_fkey",
    "ALTER TABLE `_TemplateItems` ADD CONSTRAINT `_TemplateItems_B_fkey` FOREIGN KEY (`B`) REFERENCES `checklist_template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE"],
];

const runStep = async (db, label, sql) => {
  if (!APPLY) return console.log(`  [preview] ${label}`);
  try {
    await db.$executeRawUnsafe(sql);
    console.log(`  [done]    ${label}`);
  } catch (e) {
    if (harmless(e)) console.log(`  [exists]  ${label}`);
    else console.log(`  [FAILED]  ${label}: ${e.message.split("\n").slice(-2).join(" ")}`);
  }
};

const schemaStep = async (db) => {
  const [{ d: dbName }] = await q(db, "SELECT DATABASE() AS d");
  console.log(`Live database: ${dbName}`);
  console.log(APPLY ? "MODE: APPLY\n" : "MODE: PREVIEW (nothing changes)\n");

  const tables = new Set((await q(db, "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")).map((r) => r.t));
  for (const need of ["team", "team_member", "checklist_items", "checklist_item_response"]) {
    if (!tables.has(need)) {
      console.log(`Live DB has no "${need}" table. Stop: tell me and I will add it to this script.`);
      return;
    }
  }

  console.log("1) New tables");
  for (const [name, sql] of CREATES) await runStep(db, `create ${name}`, sql);

  console.log("\n2) New column / index");
  await runStep(db, ADD_COLUMN[0], ADD_COLUMN[1]);
  await runStep(db, ADD_INDEX[0], ADD_INDEX[1]);

  console.log("\n3) Copy old item-template links (old table is NOT dropped)");
  if (tables.has("_checklist_itemsTochecklist_template")) {
    await runStep(db, "copy _checklist_itemsTochecklist_template -> _TemplateItems",
      "INSERT IGNORE INTO `_TemplateItems` (`A`, `B`) SELECT `A`, `B` FROM `_checklist_itemsTochecklist_template`");
  } else console.log("  old link table not found, nothing to copy");

  console.log("\n4) Foreign keys for the new tables");
  const existingFks = new Set((await q(db, "SELECT CONSTRAINT_NAME AS c FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'")).map((r) => r.c));
  for (const [, name, sql] of FKS) {
    if (existingFks.has(name)) console.log(`  [exists]  ${name}`);
    else await runStep(db, name, sql);
  }

  console.log("\n5) Small column changes");
  for (const [label, sql] of WIDEN) await runStep(db, label, sql);

  console.log("\n6) Position enums (only changed if every live value is allowed)");
  for (const [table] of [["Organisation_User_position"], ["tags"]]) {
    const usedRows = await q(db, `SELECT DISTINCT user_position AS v FROM \`${table}\` WHERE user_position IS NOT NULL`);
    const bad = usedRows.map((r) => r.v).filter((v) => !POSITIONS.includes(v));
    if (bad.length) console.log(`  [SKIPPED] ${table}: live has values not in the new list: ${bad.join(", ")}`);
    else await runStep(db, `${table}.user_position enum`, `ALTER TABLE \`${table}\` MODIFY \`user_position\` ${ENUM_SQL}`);
  }

  console.log(APPLY ? "\nSchema step finished. Check for any [FAILED] lines." : "\nPreview only. Run again with --apply.");
};

const userMap = async (db, label) => {
  const cols = (await q(db, "SHOW COLUMNS FROM Organisation_Users")).map((c) => c.Field);
  if (!cols.includes("user_id")) {
    throw new Error(`${label}: Organisation_Users has no user_id column. Columns: ${cols.join(", ")}`);
  }
  const rows = await q(db, "SELECT ou.id AS id, ou.organisation_id AS org, u.email AS email FROM Organisation_Users ou JOIN `User` u ON u.id = ou.user_id");
  return rows;
};

const ORG_NAME_FIELDS = ["name", "organisation_name", "organization_name", "org_name", "company_name", "title"];
const orgNameField = (rows) => {
  const keys = rows[0] ? Object.keys(rows[0]) : [];
  const exact = ORG_NAME_FIELDS.find((k) => keys.includes(k));
  if (exact) return exact;
  return keys.find((k) => /name/i.test(k) && typeof rows[0][k] === "string") || null;
};

const orgMapper = (localOrgs, liveOrgs) => {
  const field = orgNameField(localOrgs) && orgNameField(liveOrgs) ? orgNameField(liveOrgs) : null;
  if (!field) {
    const cols = localOrgs[0] ? Object.keys(localOrgs[0]).join(", ") : "(no rows)";
    throw new Error(`Cannot find an organisation name column. Organisation columns: ${cols}`);
  }
  const lf = orgNameField(localOrgs);
  const map = new Map();
  const table = localOrgs.map((l) => {
    const hits = liveOrgs.filter((o) => lc(o[field]) === lc(l[lf]));
    if (hits.length === 1) map.set(l.id, hits[0].id);
    return {
      local_id: l.id,
      name: l[lf],
      live_id: hits.length === 1 ? hits[0].id : hits.length > 1 ? "AMBIGUOUS (same name twice)" : "NO MATCH",
    };
  });
  return { fn: (localId) => map.get(localId) || null, table };
};

const insertRow = async (db, table, row) => {
  const keys = Object.keys(row);
  await db.$executeRawUnsafe(
    `INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    ...keys.map((k) => row[k])
  );
};

const dataStep = async (local, live) => {
  console.log(APPLY ? "MODE: APPLY\n" : "MODE: PREVIEW (nothing is saved)\n");

  const [localOrgs, liveOrgs] = [await q(local, "SELECT * FROM Organisation"), await q(live, "SELECT * FROM Organisation")];
  const { fn: mapOrg, table: orgTable } = orgMapper(localOrgs, liveOrgs);
  console.log("Organisation matching (local -> live, by name):");
  console.table(orgTable);
  const localUsers = await userMap(local, "local");
  const liveUsers = await userMap(live, "live");
  const liveUserByKey = new Map(liveUsers.map((u) => [`${u.org}:${lc(u.email)}`, u.id]));
  const localUserById = new Map(localUsers.map((u) => [u.id, u]));

  const localTeams = await q(local, "SELECT * FROM team");
  let liveTeams = await q(live, "SELECT * FROM team");

  console.log("Teams:");
  const teamIdMap = new Map(); 
  for (const t of localTeams) {
    const liveOrg = mapOrg(t.organisation_id);
    if (!liveOrg) { console.log(`  ${t.name}: no matching organisation in live, skipped`); continue; }
    let hit = liveTeams.find((x) => x.organisation_id === liveOrg && lc(x.name) === lc(t.name));
    if (hit) { console.log(`  ${t.name}: exists in live (id ${hit.id})`); teamIdMap.set(t.id, hit.id); continue; }
    console.log(`  ${t.name}: ${APPLY ? "creating" : "would create"} in live`);
    if (APPLY) {
      const { id, ...rest } = t;
      await insertRow(live, "team", { ...rest, organisation_id: liveOrg });
      liveTeams = await q(live, "SELECT * FROM team");
      hit = liveTeams.find((x) => x.organisation_id === liveOrg && lc(x.name) === lc(t.name));
      if (hit) teamIdMap.set(t.id, hit.id);
    }
  }

  console.log("\nTeam members:");
  const localMembers = await q(local, "SELECT * FROM team_member");
  const liveMembers = await q(live, "SELECT team_id, organisation_user_id FROM team_member");
  const have = new Set(liveMembers.map((m) => `${m.team_id}:${m.organisation_user_id}`));
  const teamName = new Map(localTeams.map((t) => [t.id, t.name]));

  const perTeam = {};
  const unmatched = [];
  let added = 0;
  for (const m of localMembers) {
    const lu = localUserById.get(m.organisation_user_id);
    const liveTeam = teamIdMap.get(m.team_id);
    const name = teamName.get(m.team_id) || `team ${m.team_id}`;
    if (!lu) continue;
    const liveOrg = mapOrg(lu.org);
    const liveUser = liveOrg ? liveUserByKey.get(`${liveOrg}:${lc(lu.email)}`) : null;
    if (!liveUser) { unmatched.push(`${lu.email} (${name})`); continue; }
    if (liveTeam && have.has(`${liveTeam}:${liveUser}`)) continue;
    perTeam[name] = (perTeam[name] || 0) + 1;
    if (APPLY && liveTeam) {
      const { id, ...rest } = m;
      try {
        await insertRow(live, "team_member", { ...rest, team_id: liveTeam, organisation_user_id: liveUser });
        have.add(`${liveTeam}:${liveUser}`);
        added += 1;
      } catch (e) {
        console.log(`  FAILED ${lu.email} -> ${name}: ${e.message.split("\n").slice(-2).join(" ")}`);
      }
    }
  }
  console.table(Object.entries(perTeam).map(([team, members]) => ({ team, [APPLY ? "attempted" : "to add"]: members })));
  if (unmatched.length) {
    console.log(`Not in live (email not found), skipped: ${unmatched.length}`);
    unmatched.slice(0, 200).forEach((u) => console.log(`  ${u}`));
  }
  console.log(APPLY ? `\nDone. ${added} members added.` : "\nPreview only. Run again with --apply.");
};


const checkStep = async (db) => {
  const [{ d: dbName }] = await q(db, "SELECT DATABASE() AS d");
  console.log(`Live database: ${dbName}  (read-only check)\n`);
  const cols = await q(db, "SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()");
  const byTable = new Map();
  cols.forEach((r) => {
    if (!byTable.has(r.t)) byTable.set(r.t, new Set());
    byTable.get(r.t).add(r.c);
  });

  const problems = [];
  for (const m of Prisma.dmmf.datamodel.models) {
    const table = m.dbName || m.name;
    const have = byTable.get(table);
    if (!have) {
      problems.push(`MISSING TABLE  ${table}`);
      continue;
    }
    for (const f of m.fields) {
      if (f.kind !== "scalar" && f.kind !== "enum") continue;
      const col = f.dbName || f.name;
      if (!have.has(col)) problems.push(`MISSING COLUMN ${table}.${col}`);
    }
  }
  if (problems.length === 0) {
    console.log("OK: every table and column the code needs exists in live. Safe to deploy the code.");
  } else {
    console.log("Live DB is NOT ready for the new code:");
    problems.forEach((x) => console.log(`  ${x}`));
    console.log("\nRun: node sync-to-live.js schema --apply   and check again.");
  }
};

const stats = async (db) => {
  const one = async (sql) => {
    try { return (await q(db, sql))[0].c; } catch (e) { return "n/a"; }
  };
  return {
    teams: await one("SELECT COUNT(*) AS c FROM team"),
    team_members: await one("SELECT COUNT(*) AS c FROM team_member"),
    business_process_names: await one("SELECT COUNT(*) AS c FROM business_process"),
    items_with_process_id: await one("SELECT COUNT(*) AS c FROM checklist_items WHERE process_id IS NOT NULL"),
    distinct_process_ids: await one("SELECT COUNT(DISTINCT process_id) AS c FROM checklist_items WHERE process_id IS NOT NULL"),
    users_with_position_but_no_team: await one(
      "SELECT COUNT(DISTINCT p.organisation_user_id) AS c FROM Organisation_User_position p WHERE p.user_position <> 'PUBLIC' AND NOT EXISTS (SELECT 1 FROM team_member tm WHERE tm.organisation_user_id = p.organisation_user_id)"
    ),
  };
};

const verifyStep = async (local, live) => {
  const a = await stats(local);
  const b = await stats(live);
  console.log("Local vs live (read-only):");
  console.table(Object.keys(a).map((k) => ({ what: k, local: a[k], live: b[k] })));

  const ids = async (db) => {
    try {
      return await q(db, "SELECT process_id AS id, COUNT(*) AS items FROM checklist_items WHERE process_id IS NOT NULL GROUP BY process_id ORDER BY process_id");
    } catch (e) { return []; }
  };
  const [la, lb] = [await ids(local), await ids(live)];
  const all = [...new Set([...la, ...lb].map((r) => r.id))].sort();
  console.log("Process IDs (number of items using each):");
  console.table(all.map((id) => ({
    process_id: id,
    local: (la.find((r) => r.id === id) || {}).items || 0,
    live: (lb.find((r) => r.id === id) || {}).items || 0,
  })));
  console.log("Reading guide:");
  console.log("  - live process_ids empty/lower: live items have no Process ID yet, so Insights will be empty there until they are set.");
  console.log("  - live team_members low: run the data step, or the Team filter shows 0.");
  console.log("  - users_with_position_but_no_team in live > 0: those people will not appear under any team filter.");
};

const mapArgs = () => {
  const out = new Map();
  process.argv.forEach((a, i) => {
    if (a === "--map" && process.argv[i + 1]) {
      const [l, r] = process.argv[i + 1].split("=");
      if (l && r) out.set(Number(l), r.split(",").map(Number).filter(Boolean));
    }
  });
  return out;
};

const processIdsStep = async (local, live) => {
  console.log(APPLY ? "MODE: APPLY\n" : "MODE: PREVIEW (nothing is saved)\n");
  const explicit = mapArgs();
  const items = await q(local, "SELECT id, organisation_id, checklist_name, input_type, process_id FROM checklist_items WHERE process_id IS NOT NULL ORDER BY id");
  const rows = [];

  const decide = (it, l) => {
    if (!l) return "SKIP: item not found in live";
    if (l.organisation_id !== it.organisation_id) return "SKIP: different organisation in live";
    if (lc(l.checklist_name) !== lc(it.checklist_name) || l.input_type !== it.input_type) return "SKIP: name/type differs";
    if (l.process_id && l.process_id === it.process_id) return "already set";
    if (l.process_id) return `SKIP: live already has ${l.process_id}`;
    return APPLY ? "SET" : "would set";
  };
  const setIt = async (it, l, result) => {
    if (APPLY && result === "SET") {
      await live.$executeRawUnsafe("UPDATE `checklist_items` SET `process_id` = ? WHERE `id` = ? AND `process_id` IS NULL", it.process_id, l.id);
    }
  };

  for (const it of items) {
    const targets = explicit.get(it.id) || [it.id];
    let anyFound = false;
    for (const liveId of targets) {
      const l = (await q(live, "SELECT id, organisation_id, checklist_name, input_type, process_id FROM checklist_items WHERE id = ?", liveId))[0];
      if (l) anyFound = true;
      const result = decide(it, l);
      rows.push({ local_id: it.id, live_id: liveId, process_id: it.process_id, item: String(it.checklist_name).slice(0, 38), type: it.input_type, result });
      if (l) await setIt(it, l, result);
    }
    if (!anyFound) {
      // help: show live items with the same name (nothing is changed for them)
      const same = await q(live, "SELECT id, process_id FROM checklist_items WHERE organisation_id = ? AND LOWER(TRIM(checklist_name)) = ? AND input_type = ?", it.organisation_id, lc(it.checklist_name), it.input_type);
      rows.push({
        local_id: it.id, live_id: "-", process_id: it.process_id, item: "", type: "",
        result: same.length
          ? `same-name items in live: ${same.map((x) => `id ${x.id} (process ${x.process_id || "none"})`).join(", ")}`
          : "no same-name item in live (create it in the app, see notes)",
      });
    }
  }
  console.table(rows);
  console.log(APPLY ? "Done." : "Preview only. Run again with --apply.");
};

/* ============================ INSPECT ITEMS (read-only, live) ============================ */
const inspectItemsStep = async (live) => {
  const i = process.argv.indexOf("--ids");
  const ids = (i > -1 ? String(process.argv[i + 1] || "") : "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) { console.log("Usage: node sync-to-live.js inspect-items --ids 278,523,555,707"); return; }
  const list = ids.join(",");

  const items = await q(live, `SELECT id, checklist_name, input_type, process_id, organisation_id FROM checklist_items WHERE id IN (${list}) ORDER BY id`);
  console.log("Items:");
  console.table(items);

  const used = await q(live,
    `SELECT li.checklist_item_id AS item, t.template_name AS template
       FROM checklist_template_linked_items li
       JOIN checklist_template_version v ON v.version_id = li.template_version_id
       JOIN checklist_template t ON t.id = v.checklist_template_id
      WHERE li.checklist_item_id IN (${list})
      GROUP BY li.checklist_item_id, t.template_name ORDER BY li.checklist_item_id`);
  console.log("Used in checklists:");
  console.table(used);

  const respCols = (await q(live, "SHOW COLUMNS FROM checklist_item_response")).map((c) => c.Field);
  const link = respCols.find((c) => /linked/i.test(c));
  if (!link) { console.log(`Could not find the linked-item column. checklist_item_response columns: ${respCols.join(", ")}`); return; }
  const from = new Date(); from.setDate(from.getDate() - 90);
  const counts = await q(live,
    `SELECT li.checklist_item_id AS item, COUNT(*) AS answers_last_90_days, COUNT(DISTINCT r.organisation_user_id) AS people
       FROM checklist_item_response r
       JOIN checklist_template_linked_items li ON li.id = r.\`${link}\`
      WHERE li.checklist_item_id IN (${list}) AND r.selected_date >= ?
      GROUP BY li.checklist_item_id ORDER BY li.checklist_item_id`, toDateOnlyStr(from));
  console.log("Answers (last 90 days):");
  console.table(counts);
};
const toDateOnlyStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* ============================ MOVE PROCESS ID (live) ============================ */
// One organisation can have each Process ID on only ONE item (unique key uq_items_org_process).
// node sync-to-live.js move-process-id --pid F1 --from 278 --to 523 [--apply]
const argv = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const moveProcessIdStep = async (live) => {
  const pid = argv("pid");
  const from = Number(argv("from"));
  const to = Number(argv("to"));
  if (!pid || !from || !to) { console.log("Usage: node sync-to-live.js move-process-id --pid F1 --from 278 --to 523 [--apply]"); return; }
  console.log(APPLY ? "MODE: APPLY\n" : "MODE: PREVIEW (nothing is saved)\n");

  const get = async (id) => (await q(live, "SELECT id, organisation_id, checklist_name, input_type, process_id FROM checklist_items WHERE id = ?", id))[0];
  const a = await get(from);
  const b = await get(to);
  console.table([a, b].filter(Boolean));
  if (!a || !b) { console.log("STOP: one of the items was not found."); return; }
  if (a.process_id !== pid) { console.log(`STOP: item ${from} does not have Process ID ${pid} (it has ${a.process_id || "none"}).`); return; }
  if (b.process_id) { console.log(`STOP: item ${to} already has Process ID ${b.process_id}.`); return; }
  if (a.organisation_id !== b.organisation_id) { console.log("STOP: items are in different organisations."); return; }
  if (a.input_type !== b.input_type) { console.log("STOP: answer types differ."); return; }

  console.log(`Will remove ${pid} from item ${from} and set it on item ${to} ("${b.checklist_name}").`);
  if (!APPLY) { console.log("\nPreview only. Run again with --apply."); return; }
  await live.$transaction([
    live.$executeRawUnsafe("UPDATE `checklist_items` SET `process_id` = NULL WHERE `id` = ? AND `process_id` = ?", from, pid),
    live.$executeRawUnsafe("UPDATE `checklist_items` SET `process_id` = ? WHERE `id` = ? AND `process_id` IS NULL", pid, to),
  ]);
  console.log("Done.");
};

(async () => {
  if (!["schema", "data", "check", "verify", "process-ids", "inspect-items", "move-process-id"].includes(mode)) {
    console.log("Usage: node sync-to-live.js schema|data|check|verify|process-ids|inspect-items|move-process-id [--apply]");
    return;
  }
  if (!LIVE_URL || ((mode === "data" || mode === "verify" || mode === "process-ids") && !LOCAL_URL)) {
    console.log("Set $env:LIVE_URL (and $env:LOCAL_URL for the data step) first. See the top of this file.");
    return;
  }
  const live = client(LIVE_URL);
  const local = ["data", "verify", "process-ids"].includes(mode) ? client(LOCAL_URL) : null;
  try {
    if (mode === "schema") await schemaStep(live);
    else if (mode === "check") await checkStep(live);
    else if (mode === "verify") await verifyStep(local, live);
    else if (mode === "process-ids") await processIdsStep(local, live);
    else if (mode === "inspect-items") await inspectItemsStep(live);
    else if (mode === "move-process-id") await moveProcessIdStep(live);
    else await dataStep(local, live);
  } finally {
    await live.$disconnect();
    if (local) await local.$disconnect();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});