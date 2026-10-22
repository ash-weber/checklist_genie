const express = require("express");
const passport = require("passport");
const MicrosoftStrategy = require("passport-microsoft").Strategy;
const prisma = require("../utils/prisma");
const { generateToken } = require("../utils/jwt");
const { CLIENT_URL } = require("../config/config");

const router = express.Router();


async function getOrCreateOrganisation(orgName) {
  try {
    return await prisma.organisation.upsert({
      where: { organisation: orgName },
      update: {},
      create: { organisation: orgName, created_at: new Date() },
    });
  } catch (e) {
    if (e.code === "P2002") {
      return await prisma.organisation.findUnique({
        where: { organisation: orgName },
      });
    }
    throw e;
  }
}

passport.use(
  new MicrosoftStrategy(
    {
      clientID: process.env.MICROSOFT_ID,
      clientSecret: process.env.MICROSOFT_SECRET,
      callbackURL: process.env.CALL_BACK_URL1,
      tenant: "common",
      authorizationURL:
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenURL: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scope: ["user.read"],
      prompt: "select_account",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = (
          (profile.emails && profile.emails[0]?.value) ||
          ""
        ).toLowerCase();

        if (!email) {
          return done(new Error("No email returned from Microsoft"), null);
        }

        const orgName = email.substring(email.lastIndexOf("@") + 1);
        const image = profile.photos?.[0]?.value || null;

        const user = await prisma.user.upsert({
          where: { email },
          update: {
            name: profile.displayName,
            image,
          },
          create: {
            email,
            name: profile.displayName,
            image,
            created_at: new Date(),
          },
        });

        const organisation = await getOrCreateOrganisation(orgName);

        let org_user = await prisma.organisation_Users.findFirst({
          where: {
            organisation_id: organisation.id,
            user_id: user.id,
          },
        });

        if (org_user) {
          org_user = await prisma.organisation_Users.update({
            where: { id: org_user.id },
            data: { created_at: new Date() },
          });
        } else {
          org_user = await prisma.organisation_Users.create({
            data: {
              organisation_id: organisation.id,
              user_id: user.id,
              created_at: new Date(),
            },
          });
        }

        return done(null, {
          organisation: organisation.id,
          organisation_user_id: org_user.id,
          user_id: user.id,
          name: user.name,
          email: user.email,
        });
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

router.get(
  "/",
  passport.authenticate("microsoft", { prompt: "select_account", session: false })
);

router.get(
  "/callback",
  passport.authenticate("microsoft", { failureRedirect: `${CLIENT_URL}/`, session: false }),
  (req, res) => {
    try {
      const token = generateToken(req.user);
      res.redirect(`${CLIENT_URL}/user/Login1/?token=${token}`);
    } catch (error) {
      console.error("Error in callback processing:", error);
      res.status(500).send("Authentication failed. Please try again.");
    }
  }
);

module.exports = router;