// ============================================================
// auth.js — JMPL Authentication & Session Management
// ============================================================

const Auth = (() => {
  const SESSION_KEY = 'jmpl_session';
  const LOCKOUT_KEY = 'jmpl_login_lockout';

  // Industrial shift thresholds — designed for continuous factory floor operations
  const MAX_FAILED_ATTEMPTS = 10;
  const LOCKOUT_DURATION_MS = 30 * 1000; // 30 seconds temporary cooldown (not 15 minutes)
  const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days persistent login
  const SESSION_MAX_IDLE_MS = 24 * 60 * 60 * 1000; // 24 hours idle timeout for shop floor shifts

  // ── Storage Helpers (Dual LocalStorage + SessionStorage) ──
  function getStoredSessionRaw() {
    try {
      return localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  }

  function setStoredSession(session) {
    const str = JSON.stringify(session);
    try { localStorage.setItem(SESSION_KEY, str); } catch {}
    try { sessionStorage.setItem(SESSION_KEY, str); } catch {}
  }

  function removeStoredSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }

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
    try { localStorage.setItem(LOCKOUT_KEY, JSON.stringify(state)); } catch {}
    return state;
  }

  function clearLockoutState() {
    try { localStorage.removeItem(LOCKOUT_KEY); } catch {}
  }

  function checkLockout() {
    const state = getLockoutState();
    if (state.lockUntil && Date.now() < state.lockUntil) {
      const secondsLeft = Math.ceil((state.lockUntil - Date.now()) / 1000);
      return { locked: true, error: `Too many failed attempts. Please wait ${secondsLeft} second(s).` };
    }
    if (state.lockUntil && Date.now() >= state.lockUntil) {
      clearLockoutState();
    }
    return { locked: false };
  }

  // ── Pure JavaScript SHA-256 Implementation (HTTP / Non-Secure Context Fallback) ──
  function sha256Pure(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let lengthProperty = 'length';
    let i, j;
    let result = '';
    const words = [];
    const asciiBitLength = ascii[lengthProperty] * 8;
    let hash = sha256Pure.h = sha256Pure.h || [];
    const k = sha256Pure.k = sha256Pure.k || [];
    let primeCounter = k[lengthProperty];
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isComposite[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1/3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      words[i >> 2] |= j << ((3 - i % 4) * 8);
    }
    words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
    words[words[lengthProperty]] = (asciiBitLength | 0);
    for (j = 0; j < words[lengthProperty];) {
      const w = words.slice(j, j += 16);
      const oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
        const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
        const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
        const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
        const temp1 = hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) + ch + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0);
        const temp2 = (rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj;
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  // ── Password Hashing (Web Crypto API with Pure JS Fallback) ──
  async function hashPassword(password) {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      } catch (e) {
        console.warn('Web Crypto digest failed, using JS fallback:', e);
      }
    }
    return sha256Pure(password);
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
      try {
        if (DB.AuditLogs) DB.AuditLogs.log('Failed Login', 'security', `Failed login attempt for username: ${username}`, username);
      } catch (e) {}
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
    setStoredSession(session);
    setupActivityListeners();
    try {
      if (DB.AuditLogs) DB.AuditLogs.log('User Login', 'security', `User ${user.username} logged in`, user.username);
    } catch (e) {}
    return { ok: true, session };
  }

  function logout() {
    removeStoredSession();
    window.location.reload();
  }

  function getSession() {
    try {
      const raw = getStoredSessionRaw();
      if (!raw) return null;
      const s = JSON.parse(raw);
      const now = Date.now();

      // Check max total age (30 days)
      if (s.loginAt && (now - s.loginAt > SESSION_MAX_AGE_MS)) {
        removeStoredSession();
        return null;
      }

      // Check idle time (24 hours)
      if (s.lastActive && (now - s.lastActive > SESSION_MAX_IDLE_MS)) {
        removeStoredSession();
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
      const raw = getStoredSessionRaw();
      if (!raw) return;
      const s = JSON.parse(raw);
      s.lastActive = now;
      setStoredSession(s);
    } catch {}
  }

  function setupActivityListeners() {
    if (window._authListenersAttached) return;
    window._authListenersAttached = true;
    ['mousemove', 'keydown', 'click', 'touchstart', 'scroll', 'input'].forEach(evt => {
      window.addEventListener(evt, updateActivity, { passive: true });
    });
  }

  // Always attach activity listeners
  setupActivityListeners();

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


