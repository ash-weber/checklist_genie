const prisma = require("../utils/prisma");
const { MAX_TEAMS } = require("./onboarding.controllers");


const getTeams = async (req, res) => {
  try {
    const { organisation_id } = req.user;

    const teams = await prisma.team.findMany({
      where: { organisation_id },
      orderBy: { created_at: "asc" },
      include: {
        _count: { select: { Members: true } },
      },
    });

    res.status(200).json({
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        member_count: t._count.Members,
        created_at: t.created_at,
      })),
    });
  } catch (error) {
    console.error("Error in getTeams:", error);
    res.status(500).json({ error: "Failed to fetch teams." });
  }
};

const createTeam = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({ error: "Team name is required." });
    }

    const existingCount = await prisma.team.count({ where: { organisation_id } });
    if (existingCount >= MAX_TEAMS) {
      return res.status(400).json({ error: `You can add up to ${MAX_TEAMS} teams only.` });
    }

    const team = await prisma.team.create({
      data: { organisation_id, name },
    });

    res.status(201).json({ message: "Team created.", team });
  } catch (error) {
    console.error("Error in createTeam:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ error: "A team with this name already exists." });
    }
    res.status(500).json({ error: "Failed to create team." });
  }
};


const renameTeam = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const team_id = parseInt(req.params.team_id);
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({ error: "Team name is required." });
    }

    const team = await prisma.team.findFirst({ where: { id: team_id, organisation_id } });
    if (!team) {
      return res.status(404).json({ error: "Team not found." });
    }

    const updated = await prisma.team.update({
      where: { id: team_id },
      data: { name },
    });

    res.status(200).json({ message: "Team renamed.", team: updated });
  } catch (error) {
    console.error("Error in renameTeam:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ error: "A team with this name already exists." });
    }
    res.status(500).json({ error: "Failed to rename team." });
  }
};

const deleteTeam = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const team_id = parseInt(req.params.team_id);

    const team = await prisma.team.findFirst({ where: { id: team_id, organisation_id } });
    if (!team) {
      return res.status(404).json({ error: "Team not found." });
    }

    await prisma.team.delete({ where: { id: team_id } });

    res.status(200).json({ message: "Team deleted." });
  } catch (error) {
    console.error("Error in deleteTeam:", error);
    res.status(500).json({ error: "Failed to delete team." });
  }
};

const getTeamMembers = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const team_id = parseInt(req.params.team_id);

    const team = await prisma.team.findFirst({ where: { id: team_id, organisation_id } });
    if (!team) {
      return res.status(404).json({ error: "Team not found." });
    }

    const rows = await prisma.team_member.findMany({
      where: { team_id },
      orderBy: { created_at: "asc" },
      include: { OrganisationUser: { include: { user: true } } },
    });

    res.status(200).json({
      team: { id: team.id, name: team.name },
      members: rows.map((r) => ({
        organisation_user_id: r.organisation_user_id,
        name: r.OrganisationUser.user?.name || "",
        email: r.OrganisationUser.user?.email || "",
        user_type: r.OrganisationUser.user_type,
      })),
    });
  } catch (error) {
    console.error("Error in getTeamMembers:", error);
    res.status(500).json({ error: "Failed to fetch members." });
  }
};

const getOrgMembers = async (req, res) => {
  try {
    const { organisation_id } = req.user;

    const rows = await prisma.organisation_Users.findMany({
      where: { organisation_id },
      orderBy: { id: "asc" },
      include: { user: true },
    });

    res.status(200).json({
      members: rows.map((r) => ({
        organisation_user_id: r.id,
        name: r.user?.name || "",
        email: r.user?.email || "",
        user_type: r.user_type,
      })),
    });
  } catch (error) {
    console.error("Error in getOrgMembers:", error);
    res.status(500).json({ error: "Failed to fetch members." });
  }
};

const addTeamMember = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const team_id = parseInt(req.params.team_id);
    const organisation_user_id = parseInt(req.body.organisation_user_id);

    if (!organisation_user_id) {
      return res.status(400).json({ error: "organisation_user_id is required." });
    }

    const team = await prisma.team.findFirst({ where: { id: team_id, organisation_id } });
    if (!team) {
      return res.status(404).json({ error: "Team not found." });
    }

    const member = await prisma.organisation_Users.findFirst({
      where: { id: organisation_user_id, organisation_id },
    });
    if (!member) {
      return res.status(404).json({ error: "User not found in this organisation." });
    }

    const created = await prisma.team_member.create({
      data: { team_id, organisation_user_id },
    });

    res.status(201).json({ message: "Member added.", member: created });
  } catch (error) {
    console.error("Error in addTeamMember:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ error: "User is already in this team." });
    }
    res.status(500).json({ error: "Failed to add member." });
  }
};

const removeTeamMember = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const team_id = parseInt(req.params.team_id);
    const organisation_user_id = parseInt(req.params.organisation_user_id);

    const team = await prisma.team.findFirst({ where: { id: team_id, organisation_id } });
    if (!team) {
      return res.status(404).json({ error: "Team not found." });
    }

    await prisma.team_member.deleteMany({
      where: { team_id, organisation_user_id },
    });

    res.status(200).json({ message: "Member removed." });
  } catch (error) {
    console.error("Error in removeTeamMember:", error);
    res.status(500).json({ error: "Failed to remove member." });
  }
};

module.exports = {
  getTeams,
  createTeam,
  renameTeam,
  deleteTeam,
  getTeamMembers,
  getOrgMembers,
  addTeamMember,
  removeTeamMember,
};