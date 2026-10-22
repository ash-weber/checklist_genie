const prisma = require("../utils/prisma");

const MAX_TEAMS = 10;

const getOnboardingStatus = async (req, res) => {
  try {
    const { organisation_user_id } = req.user;

    const orgUser = await prisma.organisation_Users.findUnique({
      where: { id: organisation_user_id },
      select: { user_type: true, organisation_id: true },
    });

    if (!orgUser) {
      return res.status(404).json({ error: "User not found." });
    }

    const organisation = await prisma.organisation.findUnique({
      where: { id: orgUser.organisation_id },
      select: { onboarded: true, group_name: true },
    });

    if (!organisation) {
      return res.status(404).json({ error: "Organisation not found." });
    }

    const isAdmin =
      String(orgUser.user_type || "").trim().toUpperCase() === "ADMIN";

    res.status(200).json({
      onboarded: organisation.onboarded,
      group_name: organisation.group_name,
      isAdmin,
    });
  } catch (error) {
    console.error("Error in getOnboardingStatus:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
};


const completeOnboarding = async (req, res) => {
  try {
    const { organisation_id } = req.user;
    const { group_name, teams } = req.body;

    if (!group_name || !group_name.trim()) {
      return res.status(400).json({ error: "Group name is required." });
    }

    if (!Array.isArray(teams) || teams.length === 0) {
      return res.status(400).json({ error: "At least one team is required." });
    }

    const cleanedTeams = [];
    const seen = new Set();
    for (const raw of teams) {
      const name = String(raw || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleanedTeams.push(name);
    }

    if (cleanedTeams.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one valid team name is required." });
    }

    if (cleanedTeams.length > MAX_TEAMS) {
      return res
        .status(400)
        .json({ error: `You can add up to ${MAX_TEAMS} teams only.` });
    }

    const organisation = await prisma.organisation.findUnique({
      where: { id: organisation_id },
    });

    if (!organisation) {
      return res.status(404).json({ error: "Organisation not found." });
    }

    if (organisation.onboarded) {
      return res
        .status(409)
        .json({ error: "This workspace is already onboarded." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedOrg = await tx.organisation.update({
        where: { id: organisation_id },
        data: {
          group_name: group_name.trim(),
          onboarded: true,
        },
      });

      await tx.team.createMany({
        data: cleanedTeams.map((name) => ({
          organisation_id,
          name,
        })),
        skipDuplicates: true,
      });

      const createdTeams = await tx.team.findMany({
        where: { organisation_id },
        orderBy: { created_at: "asc" },
      });

      return { updatedOrg, createdTeams };
    });

    res.status(201).json({
      message: "Workspace onboarded successfully.",
      group_name: result.updatedOrg.group_name,
      teams: result.createdTeams,
    });
  } catch (error) {
    console.error("Error in completeOnboarding:", error);
    if (error.code === "P2002") {
      return res
        .status(409)
        .json({ error: "Two teams cannot have the same name." });
    }
    res.status(500).json({ error: "Something went wrong while onboarding." });
  }
};

module.exports = { getOnboardingStatus, completeOnboarding, MAX_TEAMS };