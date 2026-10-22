const prisma = require("../utils/prisma");
const { normalizeCode } = require("../utils/processId");

const listBusinessProcesses = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const rows = await prisma.business_process.findMany({
      where: { organisation_id },
      select: { code: true, name: true },
      orderBy: { code: "asc" },
    });
    res.status(200).json({ business_processes: rows });
  } catch (error) {
    console.error("Error in listBusinessProcesses:", error);
    res.status(500).json({ error: "Failed to load business processes." });
  }
};

const saveBusinessProcess = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const code = normalizeCode(req.params.code);
    const name = String(req.body?.name ?? "").trim();

    if (!code) return res.status(400).json({ error: "Code is required." });
    if (!name) return res.status(400).json({ error: "Name is required." });
    if (name.length > 100) return res.status(400).json({ error: "Name can be at most 100 characters." });

    const row = await prisma.business_process.upsert({
      where: { organisation_id_code: { organisation_id, code } },
      update: { name },
      create: { organisation_id, code, name },
      select: { code: true, name: true },
    });
    res.status(200).json(row);
  } catch (error) {
    console.error("Error in saveBusinessProcess:", error);
    res.status(500).json({ error: "Failed to save business process." });
  }
};

const deleteBusinessProcess = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const code = normalizeCode(req.params.code);
    if (!code) return res.status(400).json({ error: "Code is required." });
    await prisma.business_process.deleteMany({ where: { organisation_id, code } });
    res.status(200).json({ code, deleted: true });
  } catch (error) {
    console.error("Error in deleteBusinessProcess:", error);
    res.status(500).json({ error: "Failed to delete business process." });
  }
};

module.exports = { listBusinessProcesses, saveBusinessProcess, deleteBusinessProcess };