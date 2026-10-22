const express = require("express");
const { authentication } = require("../utils/jwt");
const { requireAdmin } = require("../utils/requireAdmin");
const {
  getTeams,
  createTeam,
  renameTeam,
  deleteTeam,
  getTeamMembers,
  getOrgMembers,
  addTeamMember,
  removeTeamMember,
} = require("../controllers/team.controllers");

const router = express.Router();

router.use(authentication);

router.get("/", getTeams);

router.get("/org-members", requireAdmin, getOrgMembers); 
router.post("/", requireAdmin, createTeam);
router.put("/:team_id", requireAdmin, renameTeam);
router.delete("/:team_id", requireAdmin, deleteTeam);
router.get("/:team_id/members", requireAdmin, getTeamMembers); 
router.post("/:team_id/members", requireAdmin, addTeamMember);
router.delete("/:team_id/members/:organisation_user_id", requireAdmin, removeTeamMember);

module.exports = router;