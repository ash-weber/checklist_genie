
const { userPosition } = require("@prisma/client");

const THEMES = ["light", "dark"];
const FONT_SIZES = [
  { key: "Small", px: 13 },
  { key: "Medium", px: 14.5 },
  { key: "Large", px: 16.5 },
];
const REMINDER_UNITS = [
  { key: "Minutes", minutes: 1 },
  { key: "Hours", minutes: 60 },
  { key: "Days", minutes: 1440 },
];
const LIMITS = { min_minutes: 15, max_minutes: 7 * 1440 };

const DEFAULT_PREFS = {
  theme: "light",
  font_size: "Medium",
  notifications: false,
  reminder_every: 1,
  reminder_unit: "Hours",
};

const positions = () => Object.values(userPosition || {});

const reminderMinutes = (every, unit) => {
  const u = REMINDER_UNITS.find((x) => x.key === unit);
  return Number(every) * (u ? u.minutes : 60);
};

const validatePrefs = (b = {}) => {
  const theme = String(b.theme ?? "");
  if (!THEMES.includes(theme)) return { error: "Invalid theme." };

  const font_size = String(b.font_size ?? "");
  if (!FONT_SIZES.some((f) => f.key === font_size)) return { error: "Invalid font size." };

  if (typeof b.notifications !== "boolean") return { error: "Invalid notifications value." };

  const reminder_unit = String(b.reminder_unit ?? "");
  if (!REMINDER_UNITS.some((u) => u.key === reminder_unit)) return { error: "Invalid reminder unit." };

  const reminder_every = Number(b.reminder_every);
  if (!Number.isInteger(reminder_every) || reminder_every < 1) {
    return { error: "Reminder frequency must be a whole number, 1 or more." };
  }
  const total = reminderMinutes(reminder_every, reminder_unit);
  if (total < LIMITS.min_minutes) return { error: `Reminders can be at most every ${LIMITS.min_minutes} minutes.` };
  if (total > LIMITS.max_minutes) return { error: `Reminder frequency can be at most ${LIMITS.max_minutes / 1440} days.` };

  return { value: { theme, font_size, notifications: b.notifications, reminder_every, reminder_unit } };
};

module.exports = {
  THEMES,
  FONT_SIZES,
  REMINDER_UNITS,
  LIMITS,
  DEFAULT_PREFS,
  positions,
  reminderMinutes,
  validatePrefs,
};