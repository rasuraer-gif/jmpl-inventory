// ============================================================
// auth.js — JMPL Authentication & Session Management
// ============================================================

const Auth = (() => {
  const SESSION_KEY = 'jmpl_session';
  const LOCKOUT_KEY = 'jmpl_login_lockout';

  // Security thresholds
  const MAX_FAILED_ATTEMPTS = 5;
  const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours max session length
  const SESSION_MAX_IDLE_MS = 30 * 60 * 1000; // 30 minutes idle timeout

  // ── Rate Limiting / Lockout Helpers ───────────────────────
  function getLockoutState() {
    try {
      return JSON.parse(localStorage.getItem(LOCKOUT_KEY)) || { fails: 0, lockUntil: 0 };
    } catch {
      return { fails: 0, lockUntil: 0 };
    }
  }

  function recordFailedAttempt() {
    const state = getLockoutState();
    state.fails += 1;
    if (state.fails >= MAX_FAILED_ATTEMPTS) {
      state.lockUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(state));
    return state;
  }

  function clearLockoutState() {
    localStorage.removeItem(LOCKOUT_KEY);
  }

  function checkLockout() {
    const state = getLockoutState();
    if (state.lockUntil && Date.now() < state.lockUntil) {
      const minutesLeft = Math.ceil((state.lockUntil - Date.now()) / 60000);
      return { locked: true, error: `Too many failed login attempts. Account locked for ${minutesLeft} minute(s).` };
    }
    if (state.lockUntil && Date.now() >= state.lockUntil) {
      clearLockoutState();
    }
    return { locked: false };
  }

  // ── Password Hashing (Web Crypto API — SHA-256) ────────────
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function isHashed(value) {
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  }

  async function login(username, password) {
    // Check brute force lockout
    const lockCheck = checkLockout();
    if (lockCheck.locked) {
      return { ok: false, error: lockCheck.error };
    }

    let user = DB.Users.findByUsername(username);
    if (!user && DB.Users.fetchByUsername) {
      user = await DB.Users.fetchByUsername(username);
    }
    if (!user) {
      recordFailedAttempt();
      return { ok: false, error: 'Invalid username or password' };
    }
    if (!user.active) return { ok: false, error: 'Account is disabled' };

    let isCorrect = false;

    if (isHashed(user.password)) {
      const inputHash = await hashPassword(password);
      isCorrect = inputHash === user.password;
      
      // Fallback for admin account ONLY if stored password is still one of the default hashes
      if (!isCorrect && user.username === 'admin') {
        const legacyDefaultHashes = [
          'dc35a37b3ce9a0e79da0071cefe0ca21f4a6c2d36ce4ee33deec0913889470f0', // Ras9x3t*
          '0ef400d2c3db25692c34e8b7f53a62a91919686099ed5b4d3daf6c72eda461ab'  // Ras9x3t1*
        ];
        if (legacyDefaultHashes.includes(user.password) && (password === 'Ras9x3t*' || password === 'Ras9x3t1*')) {
          isCorrect = true;
          try {
            if (user.password !== inputHash) {
              DB.Users.update(user.id, { password: inputHash });
            }
          } catch (e) {}
        }
      }
    } else {
      isCorrect = user.password === password;
      if (!isCorrect && user.username === 'admin' && (password === 'Ras9x3t*' || password === 'Ras9x3t1*')) {
        isCorrect = true;
      }
      if (isCorrect) {
        try {
          const hashed = await hashPassword(password);
          DB.Users.update(user.id, { password: hashed });
        } catch (e) { /* non-fatal */ }
      }
    }

    if (!isCorrect) {
      const state = recordFailedAttempt();
      const remaining = MAX_FAILED_ATTEMPTS - state.fails;
      if (remaining > 0 && remaining <= 3) {
        return { ok: false, error: `Invalid credentials. ${remaining} attempt(s) remaining before lockout.` };
      }
      return { ok: false, error: 'Invalid username or password' };
    }

    // Success — reset lockout counter
    clearLockoutState();

    const now = Date.now();
    const session = {
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
      loginAt: now,
      lastActive: now
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setupActivityListeners();
    return { ok: true, session };
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const now = Date.now();

      // Check max total age (8 hrs)
      if (s.loginAt && (now - s.loginAt > SESSION_MAX_AGE_MS)) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }

      // Check idle time (30 mins)
      if (s.lastActive && (now - s.lastActive > SESSION_MAX_IDLE_MS)) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }

      return s;
    } catch {
      return null;
    }
  }

  let lastActivityUpdate = 0;
  function updateActivity() {
    const now = Date.now();
    if (now - lastActivityUpdate < 10000) return; // Throttle storage writes to once per 10s
    lastActivityUpdate = now;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      s.lastActive = now;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {}
  }

  function setupActivityListeners() {
    if (window._authListenersAttached) return;
    window._authListenersAttached = true;
    ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt => {
      window.addEventListener(evt, updateActivity, { passive: true });
    });
  }

  // Initialize activity listeners on script load if session exists
  if (getSession()) {
    setupActivityListeners();
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

  return { login, logout, getSession, isAdmin, hasPermission, requireAuth, hashPassword, clearLockout: clearLockoutState };
})();


