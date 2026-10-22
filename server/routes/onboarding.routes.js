const express = require("express");
const { authentication } = require("../utils/jwt");
const { requireAdmin } = require("../utils/requireAdmin");
const {
  getOnboardingStatus,
  completeOnboarding,
} = require("../controllers/onboarding.controllers");

const router = express.Router();

router.use(authentication);

router.get("/status", getOnboardingStatus);

router.post("/", requireAdmin, completeOnboarding);

module.exports = router;