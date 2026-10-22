
const TOKEN_KEY = "token";
const ROLE_KEY = "role"; 
const BASE_URL = process.env.REACT_APP_BACKEND_SERVER_URL || "http://localhost:5002";

export const GATEWAY = "/user/login1";

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (t) => {
  localStorage.setItem(TOKEN_KEY, t);
  localStorage.removeItem(ROLE_KEY);
};

export const setRole = (r) => {
  if (r) localStorage.setItem(ROLE_KEY, r);
  else localStorage.removeItem(ROLE_KEY);
};

export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
};

export const logout = clearAuth;

export function getPayload(token = getToken()) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const isExpired = (p) => Boolean(p && p.exp && p.exp * 1000 <= Date.now());

export function isLoggedIn() {
  const token = getToken();
  if (!token) return false;
  const p = getPayload(token);
  if (!p || isExpired(p)) {
    clearAuth();
    return false;
  }
  return true;
}

export function getRole() {
  const cached = localStorage.getItem(ROLE_KEY);
  if (cached === "admin" || cached === "member") return cached;

  const p = getPayload();
  if (!p) return null;
  const raw = p.role ?? p.user_role ?? p.userRole ?? p.user_type;
  if (typeof raw === "string") return raw.toLowerCase().includes("admin") ? "admin" : "member";
  if (p.isAdmin === true || p.is_admin === true) return "admin";
  if (p.isAdmin === false || p.is_admin === false) return "member";
  return null;
}

export async function fetchRole() {
  try {
    const res = await fetch(`${BASE_URL}/onboarding/status`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.status === 401) {
      clearAuth();
      return null;
    }
    if (!res.ok) return null;
    const d = await res.json();
    const role = d.isAdmin ? "admin" : "member";
    setRole(role);
    return role;
  } catch {
    return null;
  }
}

export const homeFor = (role = getRole()) =>
  role === "admin" ? "/workspace" : role === "member" ? "/my-workspace" : GATEWAY;