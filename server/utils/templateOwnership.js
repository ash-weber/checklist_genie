// server/utils/templateOwnership.js
// Stops a logged-in user from reading/changing another organisation's template recipients.
const prisma = require("./prisma");

// router.param("templateId", checkTemplateOrg)
// Runs for any route that has a :templateId param.
const checkTemplateOrg = async (req, res, next, templateId) => {
  try {
    const id = parseInt(templateId);
    if (!id) return res.status(400).json({ error: "Invalid template id." });

    const template = await prisma.checklist_template.findFirst({
      where: { id, organisation_id: req.user.organisation_id },
      select: { id: true },
    });
    if (!template) return res.status(404).json({ error: "Template not found." });
    next();
  } catch (error) {
    console.error("Error in checkTemplateOrg:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
};

// router.param("id", checkRecipientOrg)
// For DELETE /recipients/:id  (id = TemplateRecipients row).
const checkRecipientOrg = async (req, res, next, recipientId) => {
  try {
    const id = parseInt(recipientId);
    if (!id) return res.status(400).json({ error: "Invalid recipient id." });

    const row = await prisma.templateRecipients.findFirst({
      where: { id, checklistTemplate: { organisation_id: req.user.organisation_id } },
      select: { id: true },
    });
    if (!row) return res.status(404).json({ error: "Recipient not found." });
    next();
  } catch (error) {
    console.error("Error in checkRecipientOrg:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
};

module.exports = { checkTemplateOrg, checkRecipientOrg };