

const MAX_LEN = 50;

const hasProcessId = (v) => typeof v === "string" && v.trim() !== "";

const normalizeCode = (v) => String(v ?? "").trim().toUpperCase();

const groupOf = (pid) => normalizeCode(String(pid).split(/[_-]/)[0]);

const validateProcessId = (raw) => {
  if (raw === undefined || raw === null || String(raw).trim() === "") return { value: null };
  const value = normalizeCode(raw);
  if (value.length > MAX_LEN) return { error: `Process ID can be at most ${MAX_LEN} characters.` };
  if (/\s/.test(value)) return { error: "Process ID cannot contain spaces. Use _ instead (e.g. SALES_1)." };
  return { value };
};

module.exports = { hasProcessId, normalizeCode, groupOf, validateProcessId };