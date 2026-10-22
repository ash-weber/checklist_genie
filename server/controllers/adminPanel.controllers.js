const { userPosition } = require("@prisma/client");
const prisma = require("../utils/prisma");
const { getTransporter, senderFor } = require("../utils/mailer");
const opts = require("../utils/adminOptions");

const POSITIONS = Object.values(userPosition); 

const escapeHtml = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const IMG_DATA_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 90000; 
const cleanImage = (v) => {
  if (v === undefined) return { skip: true };
  const s = String(v ?? "").trim();
  if (!s) return { value: null };
  if (IMG_DATA_RE.test(s)) {
    return s.length <= MAX_IMAGE_CHARS ? { value: s } : { error: "That image is too large. Please choose a smaller one." };
  }
  if (/^https?:\/\/\S{1,490}$/i.test(s)) return { value: s };
  return { error: "Unsupported image. Upload a PNG, JPG or WEBP file." };
};

const getOptions = (req, res) => {
  res.status(200).json({
    positions: POSITIONS,
    themes: opts.THEMES,
    font_sizes: opts.FONT_SIZES,
    reminder_units: opts.REMINDER_UNITS,
    limits: opts.LIMITS,
  });
};

const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.user_id },
      select: { name: true, email: true, image: true, created_at: true },
    });
    if (!user) return res.status(404).json({ error: "Profile not found." });

    const ou = await prisma.organisation_Users.findFirst({
      where: {
        user_id: req.user.user_id,
        ...(req.user.organisation_id ? { organisation_id: req.user.organisation_id } : {}),
      },
      select: { user_type: true, organisation: { select: { organisation: true } } },
    });

    const positions = req.user.organisation_user_id
      ? await prisma.organisation_User_position.findMany({
          where: { organisation_user_id: req.user.organisation_user_id },
          select: { id: true, user_position: true },
          orderBy: { id: "asc" },
        })
      : [];

    const roleRows = await prisma.organisation_Users.findMany({
      where: { user_id: req.user.user_id },
      select: { id: true, user_type: true },
    });
    const hasMemberRole = roleRows.some((r) => String(r.user_type || "").toLowerCase() !== "admin");
    const teamCount = roleRows.length
      ? await prisma.team_member.count({
          where: { organisation_user_id: { in: roleRows.map((r) => r.id) } },
        })
      : 0;
    const is_member = hasMemberRole || teamCount > 0;

    res.status(200).json({
      positions,
      profile: {
        name: user.name,
        email: user.email,
        image: user.image,
        created_at: user.created_at,
        user_type: ou?.user_type || null,
        organisation: ou?.organisation?.organisation || null,
        is_member,
      },
    });
  } catch (error) {
    console.error("Error in getProfile:", error);
    res.status(500).json({ error: "Failed to load profile." });
  }
};

const addPosition = async (req, res) => {
  try {
    const position = String(req.body?.position || "");
    if (!POSITIONS.includes(position)) return res.status(400).json({ error: "Choose a valid position." });

    const organisation_user_id = req.user.organisation_user_id;
    const exists = await prisma.organisation_User_position.findFirst({
      where: { organisation_user_id, user_position: position },
    });
    if (exists) return res.status(409).json({ error: "That position is already added." });

    const row = await prisma.organisation_User_position.create({
      data: { organisation_user_id, user_id: req.user.user_id, user_position: position },
      select: { id: true, user_position: true },
    });
    res.status(201).json({ position: row });
  } catch (error) {
    console.error("Error in addPosition:", error);
    res.status(500).json({ error: "Failed to add the position." });
  }
};

const removePosition = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid position." });
    const out = await prisma.organisation_User_position.deleteMany({
      where: { id, organisation_user_id: req.user.organisation_user_id },
    });
    if (out.count === 0) return res.status(404).json({ error: "Position not found." });
    res.status(200).json({ message: "Position removed." });
  } catch (error) {
    console.error("Error in removePosition:", error);
    res.status(500).json({ error: "Failed to remove the position." });
  }
};

const getPreferences = async (req, res) => {
  try {
    const row = await prisma.user_preference.findUnique({ where: { user_id: req.user.user_id } });
    const preferences = row
      ? {
          theme: row.theme,
          font_size: row.font_size,
          notifications: row.notifications,
          reminder_every: row.reminder_every,
          reminder_unit: row.reminder_unit,
        }
      : opts.DEFAULT_PREFS;
    res.status(200).json({ preferences });
  } catch (error) {
    console.error("Error in getPreferences:", error);
    res.status(500).json({ error: "Failed to load preferences." });
  }
};

const savePreferences = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const v = opts.validatePrefs(req.body);
    if (v.error) return res.status(400).json({ error: v.error });

    const existing = await prisma.user_preference.findUnique({ where: { user_id } });
    const restart =
      v.value.notifications &&
      (!existing ||
        !existing.notifications ||
        existing.reminder_every !== v.value.reminder_every ||
        existing.reminder_unit !== v.value.reminder_unit);

    const row = await prisma.user_preference.upsert({
      where: { user_id },
      update: { ...v.value, ...(restart ? { last_reminded_at: null } : {}) },
      create: { user_id, ...v.value },
    });

    res.status(200).json({
      preferences: {
        theme: row.theme,
        font_size: row.font_size,
        notifications: row.notifications,
        reminder_every: row.reminder_every,
        reminder_unit: row.reminder_unit,
      },
    });
  } catch (error) {
    console.error("Error in savePreferences:", error);
    res.status(500).json({ error: "Failed to save preferences." });
  }
};

const updateProfile = async (req, res) => {
  try {
    const data = {};

    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: "Name is required." });
      if (name.length > 100) return res.status(400).json({ error: "Name can be at most 100 characters." });
      data.name = name;
    }

    const img = cleanImage(req.body?.image);
    if (img.error) return res.status(400).json({ error: img.error });
    if (!img.skip) data.image = img.value;

    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Nothing to update." });

    const user = await prisma.user.update({
      where: { id: req.user.user_id },
      data,
      select: { name: true, image: true },
    });
    res.status(200).json(user);
  } catch (error) {
    console.error("Error in updateProfile:", error);
    res.status(500).json({ error: "Failed to update profile." });
  }
};

const sendTestNotification = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.user_id },
      select: { email: true, name: true },
    });
    if (!user?.email) return res.status(400).json({ error: "No email address on your account." });

    await getTransporter().sendMail({
      from: senderFor("Checklist Reminder"),
      sender: senderFor("Checklist Reminder"),
      to: user.email,
      subject: "Checklist Genie - test reminder",
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h3 style="color: #13213c;">Test reminder</h3>
        <p>Hi ${escapeHtml(user.name || "there")}, this is a test. Email reminders for your checklists are working.</p>
      </div>`,
    });
    res.status(200).json({ message: `Test email sent to ${user.email}.` });
  } catch (error) {
    console.error("Error in sendTestNotification:", error);
    res.status(502).json({ error: "Could not send the test email. Check the mail settings on the server." });
  }
};

module.exports = { getOptions, getProfile, addPosition, removePosition, getPreferences, savePreferences, updateProfile, sendTestNotification, cleanImage };