// Run from the server folder:  node backup.js
// Saves every table to backup.json. Read-only: it only runs SELECT queries.
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");

const prisma = new PrismaClient();

(async () => {
  try {
    const rows = await prisma.$queryRawUnsafe("SHOW TABLES");
    const tables = rows.map((r) => Object.values(r)[0]);
    const out = {};

    for (const t of tables) {
      // raw SELECT * works even when schema.prisma has columns the DB doesn't have yet
      out[t] = await prisma.$queryRawUnsafe(`SELECT * FROM \`${t}\``);
      console.log(`${t}: ${out[t].length} rows`);
    }

    const json = JSON.stringify(out, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
    fs.writeFileSync("backup.json", json);
    console.log(`\nBacked up ${tables.length} tables -> backup.json`);
  } catch (e) {
    console.error("Backup failed:", e.message);
  } finally {
    await prisma.$disconnect();
  }
})();