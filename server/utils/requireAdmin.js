
const prisma = require("./prisma");


const requireAdmin = async (req, res, next) => {
  try {
    const organisation_user_id = req.user && req.user.organisation_user_id;
    if (!organisation_user_id) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const orgUser = await prisma.organisation_Users.findUnique({
      where: { id: organisation_user_id },
      select: { user_type: true, organisation_id: true },
    });

    const role = String((orgUser && orgUser.user_type) || "").trim().toUpperCase();
    if (role !== "ADMIN") {
      return res.status(403).json({ error: "Admin access required." });
    }

    req.user.user_type = role;
    req.user.organisation_id = orgUser.organisation_id;
    next();
  } catch (error) {
    console.error("Error in requireAdmin:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
};

const attachOrganisation = async (req, res, next) => {
  try {
    const organisation_user_id = req.user && req.user.organisation_user_id;
    if (!organisation_user_id) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    const orgUser = await prisma.organisation_Users.findUnique({
      where: { id: organisation_user_id },
      select: { user_type: true, organisation_id: true },
    });

    if (!orgUser) {
      return res.status(401).json({ error: "User not found." });
    }

    req.user.user_type = String(orgUser.user_type || "").trim().toUpperCase();
    req.user.organisation_id = orgUser.organisation_id;
    next();
  } catch (error) {
    console.error("Error in attachOrganisation:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
};

module.exports = { requireAdmin, attachOrganisation };