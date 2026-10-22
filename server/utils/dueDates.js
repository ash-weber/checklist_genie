const DAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MS_DAY = 86400000;

const parseDay = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const startOfToday = (now = new Date()) => new Date(now.getFullYear(), now.getMonth(), now.getDate());

function nextDue(c, today) {
  if (!c.due_date) return null;
  const base = parseDay(c.due_date);
  const rec = c.recurrence || "NONE";
  if (rec === "NONE" || base >= today) return base;

  const end = c.recurrence_ends_on ? parseDay(c.recurrence_ends_on) : null;
  let d = null;

  if (rec === "WORKDAYS" || rec === "CUSTOM") {
    const allowed =
      rec === "WORKDAYS"
        ? ["MON", "TUE", "WED", "THU", "FRI"]
        : String(c.recurrence_custom_days || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (allowed.length) {
      d = new Date(today);
      for (let i = 0; i < 8 && !allowed.includes(DAY[d.getDay()]); i++) d.setDate(d.getDate() + 1);
    }
  } else if (rec === "WEEKLY" || rec === "FORTNIGHTLY") {
    const step = rec === "WEEKLY" ? 7 : 14;
    const k = Math.ceil(Math.round((today - base) / MS_DAY) / step);
    d = new Date(base);
    d.setDate(d.getDate() + k * step);
  } else {
    const months = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 }[rec];
    if (months) {
      let k = 0;
      do {
        d = new Date(base);
        d.setMonth(base.getMonth() + k * months);
        k += 1;
      } while (d < today && k < 600);
    }
  }
  if (!d) return base;
  return end && d > end ? null : d;
}

const isDueToday = (c, today) => {
  const d = nextDue(c, today);
  return !!d && d.getTime() === today.getTime();
};

module.exports = { parseDay, startOfToday, nextDue, isDueToday };