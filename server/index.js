require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const passport = require("./utils/passport.config");
const { authentication } = require("./utils/jwt");

const microsoftAuth = require("./routes/microsoftAuth");
const authRoutes = require("./routes/auth.routes");
const templateRecepientRoutes = require("./routes/emailRecepients.routes");
const onboardingRoutes = require("./routes/onboarding.routes");
const teamRoutes = require("./routes/team.routes");
const checklistBuilderRoutes = require("./routes/checklistBuilder.routes");
const submissionRoutes = require("./routes/submission.routes");
const insightsRoutes = require("./routes/insights.routes");
const adminPanelRoutes = require("./routes/adminPanel.routes");

const app = express();
const port = process.env.PORT || 5002;

app.set("trust proxy", 1); 

app.use(morgan("dev"));

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.use(passport.initialize());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/", authRoutes);
app.use("/microsoft", microsoftAuth);

app.use("/templaterecepients", authentication, templateRecepientRoutes);
app.use("/onboarding", onboardingRoutes);
app.use("/teams", teamRoutes);
app.use("/checklists", checklistBuilderRoutes);
app.use("/insights", insightsRoutes);
app.use("/admin-panel", authentication, adminPanelRoutes);
app.use("/", submissionRoutes); 

const buildDir = path.join(__dirname, "../client/build");
if (fs.existsSync(path.join(buildDir, "index.html"))) {
  app.use(express.static(buildDir));
  app.get("*", (req, res) => res.sendFile(path.join(buildDir, "index.html")));
}

app.listen(port, () => {
  console.log("Server is running on port " + port);
  require("./services/reminders").start();
});