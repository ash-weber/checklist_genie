
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/developer|development|team|department|dept/g, "");

const ALIASES = {
  HUMAN_RESOURCE: ["hr", "humanresources"],
  POWER_BI_DEVELOPER: ["powerbi", "bi", "dataanalyst", "dataanalysts", "dataanalytics"],
  TESTING: ["qa", "tester", "testers", "qualityassurance"],
  SALES: ["sale"],
  FULL_STACK_DEVELOPER: ["fullstack"],
};

const positionMatchesTeam = (position, teamName) => {
  if (!position) return false;
  if (position === "PUBLIC") return true; 
  const n = norm(teamName);
  if (!n) return false;
  const keys = [norm(position), ...(ALIASES[position] || []).map(norm)];
  return keys.includes(n);
};


const effectiveTeams = (template, orgTeams) => {
  const real = (template.SharedTeams || []).map((st) => ({ id: st.team_id, name: st.Team.name }));
  if (real.length > 0) return real;
  const position = template.Tags && template.Tags.user_position;
  if (!position) return [];
  return orgTeams
    .filter((tm) => positionMatchesTeam(position, tm.name))
    .map((tm) => ({ id: tm.id, name: tm.name }));
};


const FREQ_TO_RECURRENCE = { Daily: "WORKDAYS", Weekly: "WEEKLY", Monthly: "MONTHLY", Yearly: "YEARLY" };
const legacyDue = (template) => {
  if (template.due_date) return { due_date: template.due_date, recurrence: template.recurrence };
  const rec = FREQ_TO_RECURRENCE[template.Tags && template.Tags.recurrent];
  if (rec && template.created_at) {
    return { due_date: new Date(template.created_at).toISOString().slice(0, 10), recurrence: rec };
  }
  return { due_date: new Date().toISOString().slice(0, 10), recurrence: "NONE" };
};

module.exports = { effectiveTeams, positionMatchesTeam, norm, legacyDue };