const express = require("express");
const { authentication } = require("../utils/jwt");
const { requireAdmin } = require("../utils/requireAdmin");
const { getProcessInsights, getProcessEntries } = require("../controllers/insights.controllers");
const {
  listBusinessProcesses,
  saveBusinessProcess,
  deleteBusinessProcess,
} = require("../controllers/businessProcess.controllers");

const router = express.Router();

router.use(authentication);

router.get("/processes", requireAdmin, getProcessInsights);
router.get("/processes/:process_id/entries", requireAdmin, getProcessEntries);

router.get("/business-processes", requireAdmin, listBusinessProcesses);
router.put("/business-processes/:code", requireAdmin, saveBusinessProcess);
router.delete("/business-processes/:code", requireAdmin, deleteBusinessProcess);

module.exports = router;