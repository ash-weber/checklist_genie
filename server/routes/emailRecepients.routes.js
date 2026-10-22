const express = require("express");
const {
  addTemplateRecipients,
  removeTemplateRecipient,
  getTemplateRecipients,
} = require("../controllers/emailRecepients.controllers");
const { checkTemplateOrg, checkRecipientOrg } = require("../utils/templateOwnership");

const router = express.Router();


router.param("template_id", checkTemplateOrg);
router.param("recipient_id", checkRecipientOrg);

router.get("/getreceipients/:template_id", getTemplateRecipients);

router.post("/:template_id/recipients", addTemplateRecipients);
router.delete("/recipients/:recipient_id", removeTemplateRecipient);

module.exports = router;