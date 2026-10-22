
require("dotenv").config();
process.env.TZ = process.env.TZ || "Asia/Kolkata";
process.env.NODE_ENV = String(process.env.NODE_ENV || "production").toLowerCase();

const prisma = require("../utils/prisma");
const { runOnce } = require("../services/reminders");

(async () => {
  try {
    const result = await runOnce();
    console.log("Reminder run finished:", result);
    process.exitCode = 0;
  } catch (error) {
    console.error("Reminder run failed:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();