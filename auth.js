// ============================================================
// auth.js — JMPL Authentication & Session Management
// ============================================================

const Auth = (() => {
  const SESSION_KEY = 'jmpl_session';

  function login(username, password) {
    const user = DB.Users.findByUsername(username);
    if (!user) return { ok: false, error: 'User not found' };
    if (!user.active) return { ok: false, error: 'Account is disabled' };
    if (user.password !== password) return { ok: false, error: 'Incorrect password' };
    const session = { userId: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { ok: true, session };
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
  }

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; }
    catch { return null; }
  }

  function isAdmin() {
    const s = getSession();
    return s && s.role === 'admin';
  }

  function hasPermission(module) {
    const s = getSession();
    if (!s) return false;
    if (s.role === 'admin') return true;
    return Array.isArray(s.permissions) && s.permissions.includes(module);
  }

  function requireAuth() {
    if (!getSession()) {
      showLoginPage();
      return false;
    }
    return true;
  }

  return { login, logout, getSession, isAdmin, hasPermission, requireAuth };
})();
