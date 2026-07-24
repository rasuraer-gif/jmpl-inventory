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
  const PREFIX = localStorage.getItem('jmpl_db_is_local_backup') === 'true' ? 'jmpl_backup_' : 'jmpl_';
  let db = null;
  let isInitialized = false;
  let syncStateListener = null;
  function onSyncStateChange(callback) {
    syncStateListener = callback;
  }
  function triggerSyncStateChange(table, hasPendingWrites) {
    if (syncStateListener) {
      try { syncStateListener(table, hasPendingWrites); } catch(e) {}
    }
  }

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
    productionRecords: [],
    monthlyPlans: [],
    productionSchedules: [],
    moulds: [],
    mouldMovements: [],
    mouldMaintenance: [],
    tasks: []
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

    // If local backup mode is active, we run strictly in offline fallback mode using local backup cache
    if (localStorage.getItem('jmpl_db_is_local_backup') === 'true') {
      console.log("Running in LOCAL BACKUP database mode (Offline sandbox).");
      runMouldMigration();
      runInternalBatchMigration();
      runMouldMasterMigration();
      runUserDeduplicationMigration();
      isInitialized = true;
      return;
    }

    // 2. Check if Firebase is loaded via CDN script tags
    if (typeof firebase === 'undefined') {
      console.warn("Firebase SDK not loaded. Running in offline localStorage-only fallback mode.");
      runMouldMigration();
      runInternalBatchMigration();
      runMouldMasterMigration();
      runUserDeduplicationMigration();
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

          db.collection(table).onSnapshot({ includeMetadataChanges: true }, snapshot => {
            const hasPendingWrites = snapshot.metadata ? snapshot.metadata.hasPendingWrites : false;
            triggerSyncStateChange(table, hasPendingWrites);
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
                
                // Only auto-refresh if the user is not actively typing, interacting with modals, or in a blocked workflow
                if (!modalOpen && !isTyping && !window.preventAutoRefresh) {
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
      runVisualMigration();
      runMouldMigration();
      runInternalBatchMigration();
      runMouldMasterMigration();
      runUserDeduplicationMigration();

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

  function runVisualMigration() {
    let migratedBatchesCount = 0;
    let migratedRecordsCount = 0;

    cache.batches.forEach(b => {
      if (b.currentStage === 'visual' && b.status === 'active') {
        b.currentStage = 'waiting-visual';
        b.updatedAt = new Date().toISOString();
        migratedBatchesCount++;

        // Update in Firestore
        if (db) {
          const docData = { ...b };
          delete docData.id;
          db.collection('batches').doc(b.id).set(docData).catch(err => {
            console.error(`Migration set error on batch ${b.id}:`, err);
          });
        }

        // Find last stage record for this batch where movedTo was 'visual'
        const records = cache.stageRecords.filter(r => r.batchId === b.id && r.movedTo === 'visual');
        if (records.length > 0) {
          records.sort((a, b) => (a.createdAt || a.date || '').localeCompare(b.createdAt || b.date || ''));
          const lastRec = records[records.length - 1];
          lastRec.movedTo = 'waiting-visual';
          lastRec.updatedAt = new Date().toISOString();
          migratedRecordsCount++;

          if (db) {
            const docData = { ...lastRec };
            delete docData.id;
            db.collection('stageRecords').doc(lastRec.id).set(docData).catch(err => {
              console.error(`Migration set error on stageRecord ${lastRec.id}:`, err);
            });
          }
        }
      }
    });

    if (migratedBatchesCount > 0) {
      localStorage.setItem(PREFIX + 'batches', JSON.stringify(cache.batches));
      if (migratedRecordsCount > 0) {
        localStorage.setItem(PREFIX + 'stageRecords', JSON.stringify(cache.stageRecords));
      }
      console.log(`[Migration] Successfully moved ${migratedBatchesCount} batches and ${migratedRecordsCount} stage records to "waiting-visual".`);
    }
  }

  function runMouldMigration() {
    let migratedCount = 0;
    cache.master.forEach(p => {
      if (!p.moulds || p.moulds.length === 0) {
        p.moulds = [{
          mouldNo: 1,
          mouldType: 'Yet to be assigned',
          processFlow: 'Cryogenic',
          firstProcess: 'Cryogenic'
        }];
        p.updatedAt = new Date().toISOString();
        migratedCount++;
        // Update in Firestore
        if (db) {
          const docData = { ...p };
          delete docData.id;
          db.collection('master').doc(p.id).set(docData).catch(err => {
            console.error(`Migration set error on master part ${p.id}:`, err);
          });
        }
      }
    });
    if (migratedCount > 0) {
      localStorage.setItem(PREFIX + 'master', JSON.stringify(cache.master));
      console.log(`[Migration] Initialised default moulds for ${migratedCount} master parts.`);
    }
  }

  function runInternalBatchMigration() {
    let migratedCount = 0;
    // Sort batches chronologically by createdAt to assign correct sequential IDs
    const sortedBatches = [...cache.batches].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    let currentIdx = 1;
    
    sortedBatches.forEach(b => {
      const match = cache.batches.find(x => x.id === b.id);
      if (match) {
        if (match.internalBatchNo == null) {
          match.internalBatchNo = currentIdx;
          match.updatedAt = new Date().toISOString();
          migratedCount++;
          if (db) {
            const docData = { ...match };
            delete docData.id;
            db.collection('batches').doc(match.id).set(docData).catch(err => {
              console.error(`Migration error on batch ${match.id}:`, err);
            });
          }
        }
        currentIdx = match.internalBatchNo + 1;
      }
    });

    if (migratedCount > 0) {
      localStorage.setItem(PREFIX + 'batches', JSON.stringify(cache.batches));
      console.log(`[Migration] Migrated ${migratedCount} batches to have sequential internalBatchNo.`);
    }
  }

  function runMouldMasterMigration() {
    let migratedCount = 0;
    cache.master.forEach(p => {
      const mouldsList = p.moulds && p.moulds.length > 0 ? p.moulds : [{
        mouldNo: 1,
        mouldType: 'Yet to be assigned'
      }];
      
      mouldsList.forEach(mConfig => {
        const mouldNo = Number(mConfig.mouldNo) || 1;
        const mouldType = mConfig.mouldType || 'Yet to be assigned';
        const mouldId = `${p.jmrefNo}-${mouldType.toUpperCase().replace(/ /g, '_')}-${String(mouldNo).padStart(2, '0')}`;
        
        const exists = cache.moulds.some(m => m.mouldId === mouldId);
        if (!exists) {
          const newMould = {
            id: genId(),
            jmrefNo: p.jmrefNo,
            mouldNo: mouldNo,
            mouldType: mouldType,
            mouldId: mouldId,
            cavity: 0,
            size: '300*300',
            make: 'JMPL',
            client: 'JMPL',
            creationDate: new Date().toISOString().slice(0, 10),
            layoutDiagram: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          cache.moulds.push(newMould);
          migratedCount++;
          
          if (db) {
            const docData = { ...newMould };
            delete docData.id;
            db.collection('moulds').doc(newMould.id).set(docData).catch(err => {
              console.error(`Migration error on mould ${newMould.id}:`, err);
            });
          }
        }
      });
    });
    
    if (migratedCount > 0) {
      localStorage.setItem(PREFIX + 'moulds', JSON.stringify(cache.moulds));
      console.log(`[Migration] Seeded ${migratedCount} default mould master records.`);
    }
  }

  function runUserDeduplicationMigration() {
    const users = getAll('users');
    const adminUsers = users.filter(u => u.role === 'admin' || u.username === 'admin');
    
    if (adminUsers.length > 1) {
      console.log(`[Migration] Found ${adminUsers.length} admin accounts. Consolidating into a single account.`);
      
      let primaryAdmin = adminUsers.find(u => u.username === 'admin');
      if (!primaryAdmin) {
        primaryAdmin = adminUsers[0];
        primaryAdmin.username = 'admin';
      }
      
      primaryAdmin.name = 'Administrator';
      primaryAdmin.password = primaryAdmin.password || 'admin123';
      primaryAdmin.role = 'admin';
      primaryAdmin.permissions = ['admin','master','production','cryogenic','deflashing','trimming','post-curing','waiting-visual','visual','gauge','quality','store','stock','report_inventory','report_sales','report_production','report_cryogenic','report_deflashing','report_trimming','report_post_curing','report_waiting_visual','report_visual','report_gauge','report_rejected','report_recheck'];
      primaryAdmin.active = true;

      const duplicateIds = adminUsers.filter(u => u.id !== primaryAdmin.id).map(u => u.id);
      
      cache.users = cache.users.filter(u => !duplicateIds.includes(u.id));
      
      localStorage.setItem(PREFIX + 'users', JSON.stringify(cache.users));
      
      if (db) {
        const primaryData = { ...primaryAdmin };
        delete primaryData.id;
        db.collection('users').doc(primaryAdmin.id).set(primaryData).catch(err => {
          console.error(`Migration error saving primary admin:`, err);
        });

        duplicateIds.forEach(id => {
          db.collection('users').doc(id).delete().catch(err => {
            console.error(`Migration error deleting duplicate admin ${id}:`, err);
          });
        });
      }
      console.log(`[Migration] Consolidated admin accounts. Remaining admin account ID: ${primaryAdmin.id}`);
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

  function clearTable(table) {
    cache[table] = [];
    saveLocal(table);
    if (db) {
      db.collection(table).get().then(snapshot => {
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        return batch.commit();
      }).catch(err => console.error(`Error clearing Firestore collection ${table}:`, err));
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
        permissions: ['admin','master','production','cryogenic','deflashing','trimming','post-curing','waiting-visual','visual','gauge','quality','store','stock','report_inventory','report_sales','report_production','report_cryogenic','report_deflashing','report_trimming','report_post_curing','report_waiting_visual','report_visual','report_gauge','report_rejected','report_recheck'],
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

  function syncMouldsForPart(part) {
    if (!part || !part.jmrefNo || !part.moulds || !part.moulds.length) return;
    const existingMoulds = getAll('moulds');
    part.moulds.forEach(m => {
      const mouldNo = Number(m.mouldNo);
      if (isNaN(mouldNo)) return;
      const mouldType = m.mouldType || 'Yet to be assigned';
      const cavity = m.cavities != null && !isNaN(Number(m.cavities)) ? Number(m.cavities) : null;
      const mouldId = `${part.jmrefNo}-${mouldType.toUpperCase().replace(/\s+/g, '_')}-${String(mouldNo).padStart(2, '0')}`;
      const existing = existingMoulds.find(em => em.jmrefNo === part.jmrefNo && Number(em.mouldNo) === mouldNo);
      
      const fields = {
        jmrefNo: part.jmrefNo,
        mouldNo: mouldNo,
        mouldType: mouldType,
        mouldId: mouldId,
        cavity: cavity,
        pmThreshold: existing ? (existing.pmThreshold || 10000) : 10000,
        size: existing ? (existing.size || '300*300') : '300*300',
        make: existing ? (existing.make || 'JMPL') : 'JMPL',
        client: existing ? (existing.client || 'JMPL') : 'JMPL',
        creationDate: existing ? (existing.creationDate || new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10),
        layoutDiagram: existing ? (existing.layoutDiagram || '') : '',
        rackDetails: existing ? (existing.rackDetails || '') : '',
        notes: existing ? (existing.notes || '') : ''
      };
      
      if (existing) {
        update('moulds', existing.id, fields);
      } else {
        insert('moulds', fields);
      }
    });
  }

  // ── INVENTORY MASTER ──────────────────────────────────────
  const Master = {
    all: () => getAll('master'),
    find: (id) => findById('master', id),
    findByJmref: (jmref) => getAll('master').find(r => r.jmrefNo === jmref) || null,
    insert: (r) => {
      const res = insert('master', r);
      syncMouldsForPart(res);
      return res;
    },
    update: (id, c) => {
      const res = update('master', id, c);
      syncMouldsForPart(res);
      return res;
    },
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
        batchNo = Batches.nextBatchNo();
      }
      let internalBatchNo = r.internalBatchNo;
      if (internalBatchNo == null) {
        internalBatchNo = Batches.nextInternalBatchNo();
      }
      return insert('batches', { ...r, batchNo, internalBatchNo });
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
    nextInternalBatchNo: () => {
      const batches = getAll('batches');
      let maxNum = 0;
      batches.forEach(b => {
        if (b.internalBatchNo != null) {
          const num = Number(b.internalBatchNo);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
      return maxNum + 1;
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

  // ── MONTHLY PLANS ─────────────────────────────────────────
  const MonthlyPlans = {
    all: () => getAll('monthlyPlans'),
    find: (id) => findById('monthlyPlans', id),
    byMonth: (month) => {
      let plans = getAll('monthlyPlans').filter(r => r.month === month);
      if (plans.length === 0) {
        const master = getAll('master');
        const uniqueJmrefs = [...new Set(master.map(m => m.jmrefNo))].filter(Boolean);
        uniqueJmrefs.forEach(jmref => {
          const newPlan = {
            id: genId(),
            month: month,
            jmrefNo: jmref,
            qty: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          cache.monthlyPlans.push(newPlan);
          if (db) {
            const docData = { ...newPlan };
            delete docData.id;
            db.collection('monthlyPlans').doc(newPlan.id).set(docData).catch(err => {
              console.error(`Error seeding plan for ${jmref} on ${month}:`, err);
            });
          }
        });
        saveLocal('monthlyPlans');
        plans = getAll('monthlyPlans').filter(r => r.month === month);
      }
      return plans;
    },
    byMonthAndJmref: (month, jmrefNo) => {
      MonthlyPlans.byMonth(month);
      return getAll('monthlyPlans').find(r => r.month === month && r.jmrefNo === jmrefNo) || null;
    },
    insert: (r) => insert('monthlyPlans', r),
    update: (id, c) => update('monthlyPlans', id, c),
    remove: (id) => remove('monthlyPlans', id)
  };

  // ── PRODUCTION SCHEDULES ──────────────────────────────────
  const ProductionSchedules = {
    all: () => getAll('productionSchedules'),
    find: (id) => findById('productionSchedules', id),
    byMonth: (month) => getAll('productionSchedules').filter(r => r.month === month),
    byJmref: (jmrefNo) => getAll('productionSchedules').filter(r => r.jmrefNo === jmrefNo),
    byMonthAndJmref: (month, jmrefNo) => getAll('productionSchedules').filter(r => r.month === month && r.jmrefNo === jmrefNo),
    insert: (r) => insert('productionSchedules', r),
    update: (id, c) => update('productionSchedules', id, c),
    remove: (id) => remove('productionSchedules', id)
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

  // ── MOULDS ────────────────────────────────────────────────
  const Moulds = {
    all: () => getAll('moulds'),
    find: (id) => findById('moulds', id),
    byJmref: (jmrefNo) => getAll('moulds').filter(r => r.jmrefNo === jmrefNo),
    insert: (r) => insert('moulds', r),
    update: (id, c) => update('moulds', id, c),
    remove: (id) => remove('moulds', id)
  };

  // ── MOULD MOVEMENTS ───────────────────────────────────────
  const MouldMovements = {
    all: () => getAll('mouldMovements'),
    find: (id) => findById('mouldMovements', id),
    byMould: (mouldId) => getAll('mouldMovements').filter(r => r.mouldId === mouldId).sort((a,b) => (b.movementDate||'').localeCompare(a.movementDate||'')),
    insert: (r) => insert('mouldMovements', r),
    update: (id, c) => update('mouldMovements', id, c),
    remove: (id) => remove('mouldMovements', id)
  };

  // ── MOULD MAINTENANCE ─────────────────────────────────────
  const MouldMaintenance = {
    all: () => getAll('mouldMaintenance'),
    find: (id) => findById('mouldMaintenance', id),
    byMould: (mouldId) => getAll('mouldMaintenance').filter(r => r.mouldId === mouldId).sort((a,b) => (b.maintenanceDate||'').localeCompare(a.maintenanceDate||'')),
    insert: (r) => insert('mouldMaintenance', r),
    update: (id, c) => update('mouldMaintenance', id, c),
    remove: (id) => remove('mouldMaintenance', id)
  };

  const Tasks = {
    all: () => getAll('tasks'),
    find: (id) => findById('tasks', id),
    insert: (r) => insert('tasks', r),
    update: (id, c) => update('tasks', id, c),
    remove: (id) => remove('tasks', id)
  };

  function exportBackupJSON() {
    const backupData = {};
    const collections = Object.keys(cache);
    
    collections.forEach(table => {
      backupData[table] = cache[table] || [];
    });

    return JSON.stringify(backupData, null, 2);
  }

  function importBackupJSON(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      const collections = Object.keys(cache);
      
      collections.forEach(table => {
        if (Array.isArray(data[table])) {
          localStorage.setItem('jmpl_backup_' + table, JSON.stringify(data[table]));
        } else {
          localStorage.setItem('jmpl_backup_' + table, JSON.stringify([]));
        }
      });
      return { ok: true };
    } catch (e) {
      console.error(e);
      return { ok: false, error: e.message };
    }
  }

  return {
  init, onSyncStateChange, genId, seedDefaults, clearTable,
    Users, Master, Subcontractors, Vendors, Operators, Inspectors,
    Batches, StageRecords, LossTracker, RejectionTracker,
    RecheckTracker, StockUploads, Sales, StoreInventory,
    ProductionRecords, MonthlyPlans, ProductionSchedules,
    Moulds, MouldMovements, MouldMaintenance, Tasks, exportBackupJSON, importBackupJSON,
    raw: { getAll, setAll, insert, update, remove, findById, findWhere }
  };
})();
