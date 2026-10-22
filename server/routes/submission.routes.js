const express = require("express");
const { authentication } = require("../utils/jwt");
const {
  getMyChecklists,
  getChecklistToFill,
  sendItems,
  submitChecklist,
  getSubmissionHistory,
  getMyTeams,
  joinMyTeams,
  leaveMyTeam,
} = require("../controllers/submission.controllers");

const router = express.Router();


router.get("/my-checklists", authentication, getMyChecklists);
router.get("/my-checklists/:id", authentication, getChecklistToFill);

router.get("/submissions/history", authentication, getSubmissionHistory);
router.post("/submissions/items", authentication, sendItems);
router.post("/submissions", authentication, submitChecklist);

router.get("/my-teams", authentication, getMyTeams);
router.post("/my-teams", authentication, joinMyTeams);
router.delete("/my-teams/:team_id", authentication, leaveMyTeam);

module.exports = router;