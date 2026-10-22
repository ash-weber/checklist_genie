const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth2").Strategy;

const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");

const prisma = require("./prisma");

const GOOGLE_CALLBACK =
  process.env.CALL_BACK_URL || "http://localhost:5002/google/callback";

console.log("[google] clientID  :", process.env.CLIENT_ID);
console.log("[google] callbackURL:", GOOGLE_CALLBACK);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK,
      passReqToCallback: true,
    },
    async function (request, accessToken, refreshToken, profile, done) {
      try {
        const email = profile.email;

        const organisationDomain = email.substring(email.lastIndexOf("@") + 1);

        const user = await prisma.user.upsert({
          where: { email: email },
          update: {
            name: profile.displayName,
            image: profile.photos[0]?.value || null,
            created_at: new Date(),
          },
          create: {
            email: email,
            name: profile.displayName,
            image: profile.photos[0]?.value || null,
            created_at: new Date(),
          },
        });

        const existingOrg = await prisma.organisation.findUnique({
          where: {
            organisation: organisationDomain,
          },
        });

        const organisation = await prisma.organisation.upsert({
          where: {
            organisation: organisationDomain,
          },
          update: {
            created_at: new Date(),
          },
          create: {
            organisation: organisationDomain,
            created_at: new Date(),
          },
        });

        const isNewOrganization = !existingOrg;

        let org_user = await prisma.organisation_Users.findFirst({
          where: {
            organisation_id: organisation.id,
            user_id: user.id,
          },
        });

        if (org_user) {
          org_user = await prisma.organisation_Users.update({
            where: {
              id: org_user.id,
            },
            data: {
              created_at: new Date(),
            },
          });
        } else {
          const userType = isNewOrganization ? "ADMIN" : "USER";

          org_user = await prisma.organisation_Users.create({
            data: {
              organisation_id: organisation.id,
              user_id: user.id,
              created_at: new Date(),
              user_type: userType,
            },
          });
        }

        return done(null, {
          organisation: organisation.id,
          organisation_user_id: org_user.id,
          user_id: user.id,
          name: user.name,
          email: user.email,
          position: org_user.position,
        });
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
    },
    async (email, password, done) => {
      try {
        const user = await prisma.user.findUnique({
          where: { email: email },
        });

        if (!user || !user.password) {
          return done(null, false, { message: "Incorrect email or password." });
        }

        if (!user.isVerified) {
          return done(null, false, {
            message: "Please verify your email before logging in.",
          });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "Incorrect email or password." });
        }

        const org_user = await prisma.organisation_Users.findFirst({
          where: { user_id: user.id },
        });

        if (!org_user) {
          return done(null, false, {
            message: "User is not part of any organization.",
          });
        }

        return done(null, {
          organisation: org_user.organisation_id,
          organisation_user_id: org_user.id,
          user_id: user.id,
          name: user.name,
          email: user.email,
        });
      } catch (error) {
        return done(error);
      }
    }
  )
);

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (user, done) {
  done(null, user);
});

module.exports = passport;