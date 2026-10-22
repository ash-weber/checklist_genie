const express = require("express");
const {
  getOptions,
  getProfile,
  addPosition,
  removePosition,
  getPreferences,
  savePreferences,
  updateProfile,
  sendTestNotification,
} = require("../controllers/adminPanel.controllers");

const router = express.Router();

router.get("/options", getOptions);
router.get("/profile", getProfile); 
router.post("/positions", addPosition); 
router.delete("/positions/:id", removePosition);
router.get("/preferences", getPreferences);
router.put("/preferences", savePreferences);
router.patch("/profile", updateProfile);
router.post("/notifications/test", sendTestNotification);

module.exports = router;