const express = require("express");
const { authentication } = require("../utils/jwt");
const { requireAdmin, attachOrganisation } = require("../utils/requireAdmin");
const {
  createChecklist,
  updateChecklist,
  setItemHidden,
  getChecklists,
  updateChecklistStatus,
  getChecklistById,
  searchItemsByProcessId,
} = require("../controllers/checklistBuilder.controllers");

const router = express.Router();

router.use(authentication);


router.get("/", attachOrganisation, getChecklists);
router.patch("/:id/status", requireAdmin, updateChecklistStatus);
router.get("/items/search", requireAdmin, searchItemsByProcessId);
router.get("/:id", attachOrganisation, getChecklistById);

router.post("/", requireAdmin, createChecklist);
router.put("/:id", requireAdmin, updateChecklist); 
router.patch("/:id/items/:linked_item_id/hidden", requireAdmin, setItemHidden); 

module.exports = router;