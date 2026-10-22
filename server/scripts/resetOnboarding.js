
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  try {
    const id = parseInt(process.argv[2]);

    if (!id) {
      const orgs = await prisma.organisation.findMany({
        select: { id: true, organisation: true, onboarded: true, group_name: true },
      });
      console.table(orgs);
      console.log("Now run: node scripts/resetOnboarding.js <id>");
      return;
    }

    await prisma.team.deleteMany({ where: { organisation_id: id } });
    await prisma.organisation.update({
      where: { id },
      data: { onboarded: false, group_name: null },
    });
    console.log(`Organisation ${id} reset. Logout, login again to see onboarding.`);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
})();