// ============================================================
// db.js — JMPL Inventory Tracking System
// Firebase Firestore Integration with Offline-First Local Cache
// ============================================================

const JMPL_CONFIG = {
  firebaseConfig: {
    apiKey: "AIzaSyAqCfPbbyEWtxYVyupEPRTH8uT_USeAH5o",
    authDomain: "jmpl-inventory.firebaseapp.com",
    projectId: "jmpl-inventory",
    storageBucket: "jmpl-inventory.firebasestorage.app",
    messagingSenderId: "320254950079",
    appId: "1:320254950079:web:a7ece81fefe2a42e07a40a",
    measurementId: "G-P4QKCHR92M"
  },
  geminiApiKey: "AQ.Ab8RN6IRxrySrWsvMuNkO5953IMKc0IpwEiax2-iXNm7_NMFZA"
};

const DB = (() => {
  const PREFIX = 'jmpl_';
  let db = null;
  let isInitialized = false;

  // In-memory cache for all collections
  const cache = {
    users: [],
    master: [],
    subcontractors: [],
    vendors: [],
    operators: [],
    inspectors: [],
    batches: [],
    stageRecords: [],
    lossTracker: [],
    rejectionTracker: [],
    recheckTracker: [],
    stockUploads: [],
    sales: [],
    productionRecords: []
  };

  // Helper to load localStorage cache into memory on startup
  function loadLocalCache() {
    for (const key of Object.keys(cache)) {
      try {
        const data = localStorage.getItem(PREFIX + key);
        if (data) {
          cache[key] = JSON.parse(data);
        }
      } catch (e) {
        console.error(`Error reading local cache for ${key}:`, e);
      }
    }
  }

  // Save specific collection to localStorage
  function saveLocal(table) {
    localStorage.setItem(PREFIX + table, JSON.stringify(cache[table]));
  }

  // Generate ID
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // Initialize Firebase and setup sync listeners
  async function init() {
    if (isInitialized) return;

    // 1. Load what we have in localStorage first so the app boots instantly with cached data
    loadLocalCache();

    // 2. Check if Firebase is loaded via CDN script tags
    if (typeof firebase === 'undefined') {
      console.warn("Firebase SDK not loaded. Running in offline localStorage-only fallback mode.");
      isInitialized = true;
      return;
    }

    try {
      // Initialize Firebase App
      firebase.initializeApp(JMPL_CONFIG.firebaseConfig);
      db = firebase.firestore();

      // Enable offline persistence in Firestore (handles cache sync and offline queue)
      try {
        await db.enablePersistence({ synchronizeTabs: true });
        console.log("Firestore offline persistence enabled.");
      } catch (err) {
        console.warn("Firestore offline persistence failed to enable:", err.code);
      }

      // 3. Set up listeners for all collections and wait for the initial snapshot fetch
      const collections = Object.keys(cache);
      const initPromises = collections.map(table => {
        return new Promise((resolve) => {
          let resolved = false;

          db.collection(table).onSnapshot(snapshot => {
            const list = [];
            snapshot.forEach(doc => {
              list.push({ id: doc.id, ...doc.data() });
            });

            // Compare incoming remote snapshot to local memory cache to detect changes
            const hasChanges = JSON.stringify(cache[table]) !== JSON.stringify(list);

            if (hasChanges) {
              cache[table] = list;
              saveLocal(table);

              // If the data changed and the app is already loaded, trigger a UI update
              if (resolved && window.App && typeof App.current === 'string') {
                const modalOpen = document.querySelector('.modal-overlay:not(.hidden)');
                const isTyping = document.activeElement && 
                                (document.activeElement.tagName === 'INPUT' || 
                                 document.activeElement.tagName === 'TEXTAREA');
                
                // Only auto-refresh if the user is not actively typing or interacting with modals
                if (!modalOpen && !isTyping) {
                  console.log(`Live update: Refreshed page due to cloud changes in "${table}"`);
                  App.navigate(App.current);
                }
              }
            }

            if (!resolved) {
              resolved = true;
              resolve(); // Initial snapshot loaded from cache/server
            }
          }, err => {
            console.error(`Firestore listener error on table "${table}":`, err);
            // On permission error or other issue, resolve anyway to allow app loading with local cache
            if (!resolved) {
              resolved = true;
              resolve();
            }
          });
        });
      });

      // Wait for all collections to load their initial state
      await Promise.all(initPromises);
      console.log("JMPL Database fully synchronized with Firestore.");

      // 4. Prompt for migration if local data exists but Cloud DB is empty
      await checkAndMigrate();

    } catch (e) {
      console.error("Failed to initialize Firebase database:", e);
    }

    isInitialized = true;
  }

  // Migration assistant: checks if Firestore contains no batches/master parts but localStorage does
  async function checkAndMigrate() {
    if (!db) return;

    const isCloudEmpty = cache.master.length === 0 && cache.batches.length === 0;
    let hasLocalData = false;

    try {
      const localMaster = JSON.parse(localStorage.getItem(PREFIX + 'master')) || [];
      const localBatches = JSON.parse(localStorage.getItem(PREFIX + 'batches')) || [];
      if (localMaster.length > 0 || localBatches.length > 0) {
        hasLocalData = true;
      }
    } catch (e) {}

    if (isCloudEmpty && hasLocalData) {
      const runMigration = confirm(
        "JMPL CLOUD DETECTED:\n\nYour local browser contains tracking data, but the cloud Firestore database is currently empty.\n\nWould you like to import all your local inventory and batch records to the cloud database?"
      );

      if (runMigration) {
        if (typeof showToast === 'function') showToast("Starting cloud migration...", "info");
        try {
          const collections = Object.keys(cache);
          for (const table of collections) {
            const localData = JSON.parse(localStorage.getItem(PREFIX + table)) || [];
            if (localData.length > 0) {
              console.log(`Migrating table "${table}" (${localData.length} records)...`);
              const batch = db.batch();
              localData.forEach(item => {
                const docRef = db.collection(table).doc(item.id || genId());
                const docData = { ...item };
                delete docData.id; // Store key as docId, remove id attribute inside document
                batch.set(docRef, docData);
              });
              await batch.commit();
            }
          }
          if (typeof showToast === 'function') showToast("Cloud migration complete!", "success");
        } catch (err) {
          console.error("Cloud migration failed:", err);
          if (typeof showToast === 'function') showToast("Cloud migration failed: " + err.message, "error");
        }
      }
    }
  }

  // ── Core CRUD helper implementations ───────────────────────
  function getAll(table) {
    return cache[table] || [];
  }

  function setAll(table, data) {
    cache[table] = data;
    saveLocal(table);
    if (db) {
      // Overwrite collection docs in Firestore
      const batch = db.batch();
      data.forEach(item => {
        const docRef = db.collection(table).doc(item.id || genId());
        const docData = { ...item };
        delete docData.id;
        batch.set(docRef, docData);
      });
      batch.commit().catch(err => console.error(`Firebase setAll batch error on ${table}:`, err));
    }
  }

  function insert(table, record) {
    const id = record.id || genId();
    const row = { 
      ...record, 
      id, 
      createdAt: record.createdAt || new Date().toISOString() 
    };

    // Update local cache & store
    cache[table].push(row);
    saveLocal(table);

    // Save to Firestore asynchronously
    if (db) {
      const docData = { ...row };
      delete docData.id;
      db.collection(table).doc(id).set(docData).catch(err => {
        console.error(`Firebase insert error on ${table}/${id}:`, err);
      });
    }

    return row;
  }

  function update(table, id, changes) {
    const index = cache[table].findIndex(r => r.id === id);
    if (index === -1) return null;

    const updatedRow = { 
      ...cache[table][index], 
      ...changes, 
      updatedAt: new Date().toISOString() 
    };

    // Update local cache & store
    cache[table][index] = updatedRow;
    saveLocal(table);

    // Save to Firestore asynchronously
    if (db) {
      const docData = { ...updatedRow };
      delete docData.id;
      db.collection(table).doc(id).set(docData).catch(err => {
        console.error(`Firebase update error on ${table}/${id}:`, err);
      });
    }

    return updatedRow;
  }

  function remove(table, id) {
    // Update local cache & store
    cache[table] = cache[table].filter(r => r.id !== id);
    saveLocal(table);

    // Remove from Firestore asynchronously
    if (db) {
      db.collection(table).doc(id).delete().catch(err => {
        console.error(`Firebase delete error on ${table}/${id}:`, err);
      });
    }
  }

  function findById(table, id) { 
    return getAll(table).find(r => r.id === id) || null; 
  }
  
  function findWhere(table, predicate) { 
    return getAll(table).filter(predicate); 
  }

  // ── Seed default admin ────────────────────────────────────
  function seedDefaults() {
    const users = getAll('users');
    if (!users.find(u => u.username === 'admin')) {
      insert('users', {
        name: 'Administrator',
        username: 'admin',
        password: 'admin123',
        role: 'admin',
        permissions: ['admin','master','production','cryogenic','deflashing','trimming','visual','gauge','quality','store','stock','report_inventory','report_sales','report_production','report_cryogenic','report_deflashing','report_trimming','report_visual','report_gauge','report_rejected','report_recheck'],
        active: true
      });
    }
  }

  // ── USERS ─────────────────────────────────────────────────
  const Users = {
    all: () => getAll('users'),
    find: (id) => findById('users', id),
    findByUsername: (u) => getAll('users').find(r => r.username === u) || null,
    insert: (r) => insert('users', r),
    update: (id, c) => update('users', id, c),
    remove: (id) => remove('users', id),
  };

  // ── INVENTORY MASTER ──────────────────────────────────────
  const Master = {
    all: () => getAll('master'),
    find: (id) => findById('master', id),
    findByJmref: (jmref) => getAll('master').find(r => r.jmrefNo === jmref) || null,
    insert: (r) => insert('master', r),
    update: (id, c) => update('master', id, c),
    remove: (id) => remove('master', id),
  };

  // ── SUBCONTRACTORS ────────────────────────────────────────
  const Subcontractors = {
    all: () => getAll('subcontractors'),
    active: () => getAll('subcontractors').filter(r => r.active),
    find: (id) => findById('subcontractors', id),
    insert: (r) => insert('subcontractors', r),
    update: (id, c) => update('subcontractors', id, c),
  };

  // ── VENDORS ───────────────────────────────────────────────
  const Vendors = {
    all: () => getAll('vendors'),
    byDept: (dept) => getAll('vendors').filter(r => r.department === dept && r.active),
    find: (id) => findById('vendors', id),
    insert: (r) => insert('vendors', r),
    update: (id, c) => update('vendors', id, c),
  };

  // ── OPERATORS ─────────────────────────────────────────────
  const Operators = {
    all: () => getAll('operators'),
    active: () => getAll('operators').filter(r => r.active),
    find: (id) => findById('operators', id),
    insert: (r) => insert('operators', r),
    update: (id, c) => update('operators', id, c),
  };

  // ── INSPECTORS ────────────────────────────────────────────
  const Inspectors = {
    all: () => getAll('inspectors'),
    active: () => getAll('inspectors').filter(r => r.active),
    find: (id) => findById('inspectors', id),
    insert: (r) => insert('inspectors', r),
    update: (id, c) => update('inspectors', id, c),
  };

  // ── BATCHES ───────────────────────────────────────────────
  const Batches = {
    all: () => getAll('batches'),
    find: (id) => findById('batches', id),
    byStage: (stage) => getAll('batches').filter(r => r.currentStage === stage && r.status === 'active'),
    byStatus: (status) => getAll('batches').filter(r => r.status === status),
    insert: (r) => {
      let batchNo = r.batchNo;
      if (!batchNo) {
        const batches = getAll('batches');
        let maxNum = 0;
        batches.forEach(b => {
          if (b.batchNo && b.batchNo.startsWith('JMPL-')) {
            const num = parseInt(b.batchNo.substring(5), 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        });
        const num = maxNum + 1;
        batchNo = 'JMPL-' + String(num).padStart(5, '0');
      }
      return insert('batches', { ...r, batchNo });
    },
    update: (id, c) => update('batches', id, c),
    nextBatchNo: () => {
      const batches = getAll('batches');
      let maxNum = 0;
      batches.forEach(b => {
        if (b.batchNo && b.batchNo.startsWith('JMPL-')) {
          const num = parseInt(b.batchNo.substring(5), 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
      return 'JMPL-' + String(maxNum + 1).padStart(5, '0');
    },
  };

  // ── STAGE RECORDS ─────────────────────────────────────────
  const StageRecords = {
    all: () => getAll('stageRecords'),
    find: (id) => findById('stageRecords', id),
    byBatch: (batchId) => getAll('stageRecords').filter(r => r.batchId === batchId),
    byStage: (stage) => getAll('stageRecords').filter(r => r.stage === stage),
    byBatchAndStage: (batchId, stage) => getAll('stageRecords').filter(r => r.batchId === batchId && r.stage === stage),
    insert: (r) => insert('stageRecords', r),
    update: (id, c) => update('stageRecords', id, c),
  };

  // ── LOSS TRACKER ──────────────────────────────────────────
  const LossTracker = {
    all: () => getAll('lossTracker'),
    byStage: (stage) => getAll('lossTracker').filter(r => r.stage === stage),
    byBatch: (batchId) => getAll('lossTracker').filter(r => r.batchId === batchId),
    insert: (r) => insert('lossTracker', r),
    update: (id, c) => update('lossTracker', id, c),
    sumByStageAndDate: (stage, from, to) => {
      return getAll('lossTracker')
        .filter(r => r.stage === stage && (!from || r.date >= from) && (!to || r.date <= to));
    },
  };

  // ── REJECTION TRACKER ─────────────────────────────────────
  const RejectionTracker = {
    all: () => getAll('rejectionTracker'),
    byBatch: (batchId) => getAll('rejectionTracker').filter(r => r.batchId === batchId),
    insert: (r) => insert('rejectionTracker', r),
  };

  // ── RECHECK TRACKER ───────────────────────────────────────
  const RecheckTracker = {
    all: () => getAll('recheckTracker'),
    byBatch: (batchId) => getAll('recheckTracker').filter(r => r.batchId === batchId),
    insert: (r) => insert('recheckTracker', r),
    update: (id, c) => update('recheckTracker', id, c),
    nextIterationNo: (batchId) => {
      const rechecks = getAll('recheckTracker').filter(r => r.batchId === batchId);
      return rechecks.length + 1;
    },
  };

  // ── STOCK UPLOADS ─────────────────────────────────────────
  const StockUploads = {
    all: () => getAll('stockUploads'),
    byStage: (stage) => getAll('stockUploads').filter(r => r.stage === stage),
    latestByStageAndPart: (stage, partId) => {
      const rows = getAll('stockUploads').filter(r => r.stage === stage && r.partId === partId);
      return rows.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0] || null;
    },
    insert: (r) => insert('stockUploads', r),
  };

  // ── SALES ─────────────────────────────────────────────────
  const Sales = {
    all: () => getAll('sales'),
    byJmref: (jmref) => getAll('sales').filter(r => r.jmrefNo === jmref),
    byDateRange: (from, to) => getAll('sales').filter(r => (!from || r.saleDate >= from) && (!to || r.saleDate <= to)),
    insert: (r) => insert('sales', r),
    getFifoStock: (jmrefNo) => {
      const batches = getAll('batches').filter(b => b.jmrefNo === jmrefNo && b.status === 'completed');
      return batches.sort((a, b) => (a.completedAt || '').localeCompare(b.completedAt || ''));
    },
  };

  // ── STORE INVENTORY ───────────────────────────────────────
  const StoreInventory = {
    availableByJmref: (jmrefNo) => {
      const completed = getAll('batches').filter(b => b.jmrefNo === jmrefNo && b.status === 'completed');
      const totalIn = completed.reduce((s, b) => {
        const storeRecord = getAll('stageRecords').filter(r => r.batchId === b.id && r.stage === 'store');
        const qty = storeRecord.length ? storeRecord[storeRecord.length - 1].inputQty : 0;
        return s + (qty || 0);
      }, 0);
      const totalSold = getAll('sales').filter(s => s.jmrefNo === jmrefNo).reduce((s, r) => s + (r.qty || 0), 0);
      return Math.max(0, totalIn - totalSold);
    },
    allParts: () => {
      const master = getAll('master');
      return master.map(m => ({
        ...m,
        available: StoreInventory.availableByJmref(m.jmrefNo)
      }));
    },
  };

  // ── PRODUCTION OPERATOR RECORDS ───────────────────────────
  const ProductionRecords = {
    all: () => getAll('productionRecords'),
    byBatch: (batchId) => getAll('productionRecords').filter(r => r.batchId === batchId),
    byOperator: (operatorId) => getAll('productionRecords').filter(r => r.operatorId === operatorId),
    insert: (r) => insert('productionRecords', r),
    update: (id, c) => update('productionRecords', id, c),
  };

  return {
    init, genId, seedDefaults,
    Users, Master, Subcontractors, Vendors, Operators, Inspectors,
    Batches, StageRecords, LossTracker, RejectionTracker,
    RecheckTracker, StockUploads, Sales, StoreInventory,
    ProductionRecords,
    raw: { getAll, setAll, insert, update, remove, findById, findWhere }
  };
})();
