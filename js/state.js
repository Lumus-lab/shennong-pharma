(function (global) {
  'use strict';

  const META_KEY = 'taixu_shennong_meta_v1';
  const SAVE_KEY = 'taixu_shennong_save_v1';

  const DEFAULT_VITALS = {
    subject: '林玄（試煉基準態）',
    hr: 74,
    sbp: 118,
    dbp: 76,
    iop: 15,
    rhythm: 'normal',
    rhythmText: '竇性節律（迷走張力主導）',
    pupilMm: 3.5,
    ciliary: '適度平衡',
    airway: 100,
    secretion: '正常潤澤',
    nmj: 50,
    nmjLabel: '穩健有力',
    badges: []
  };

  function safeReadStorage(key, fallback) {
    try {
      const raw = global.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_err) {
      return fallback;
    }
  }

  function safeWriteStorage(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_err) {
      return false;
    }
  }

  function defaultMeta() {
    return {
      theme: 'paper',
      audioEnabled: false,
      unlockedCodex: [],
      unlockedTables: ['tbl_organs'],
      wrongNotes: [],
      unlockedEndings: [],
      runsCompleted: 0,
      lastSeed: 'TX-4072'
    };
  }

  let metaState = Object.assign(defaultMeta(), safeReadStorage(META_KEY, {}));
  let runState = null;

  function saveMeta() {
    safeWriteStorage(META_KEY, metaState);
  }

  function getMeta() {
    return metaState;
  }

  function setTheme(theme) {
    metaState.theme = theme === 'ink' ? 'ink' : 'paper';
    saveMeta();
  }

  function setAudioEnabled(enabled) {
    metaState.audioEnabled = Boolean(enabled);
    saveMeta();
  }

  function unlockCodexIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const newlyUnlocked = [];
    for (let i = 0; i < ids.length; i++) {
      const numId = Number(ids[i]);
      if (!Number.isNaN(numId) && metaState.unlockedCodex.indexOf(numId) === -1) {
        metaState.unlockedCodex.push(numId);
        newlyUnlocked.push(numId);
      }
    }
    if (newlyUnlocked.length > 0) {
      metaState.unlockedCodex.sort((a, b) => a - b);
      saveMeta();
    }
    return newlyUnlocked;
  }

  function unlockTableIds(tableIds) {
    if (!Array.isArray(tableIds)) return;
    let changed = false;
    for (let i = 0; i < tableIds.length; i++) {
      if (metaState.unlockedTables.indexOf(tableIds[i]) === -1) {
        metaState.unlockedTables.push(tableIds[i]);
        changed = true;
      }
    }
    if (changed) saveMeta();
  }

  function addWrongNote(note) {
    if (!note || !note.key) return;
    const exists = metaState.wrongNotes.find((item) => item.key === note.key);
    if (exists) {
      exists.count = (exists.count || 1) + 1;
      exists.timestamp = Date.now();
    } else {
      metaState.wrongNotes.unshift(
        Object.assign({ count: 1, timestamp: Date.now() }, note)
      );
      if (metaState.wrongNotes.length > 80) {
        metaState.wrongNotes.length = 80;
      }
    }
    saveMeta();
  }

  function unlockEnding(endingId) {
    if (!endingId) return;
    if (metaState.unlockedEndings.indexOf(endingId) === -1) {
      metaState.unlockedEndings.push(endingId);
    }
    metaState.runsCompleted = (metaState.runsCompleted || 0) + 1;
    saveMeta();
  }

  function createNewRun(config) {
    const isStory = config.mode === 'story';
    runState = {
      mode: isStory ? 'story' : 'roguelike',
      route: config.route || 'taiyin',
      seed: String(config.seed || 'TX-4072').trim(),
      yin: 50,
      yang: 50,
      guardPills: isStory ? 4 : 3,
      maxGuardPills: isStory ? 4 : 3,
      riskScore: 0,
      crisisCount: 0,
      rescuedCount: 0,
      failedRescueCount: 0,
      correctFirstTry: 0,
      totalAnswered: 0,
      pouchItems: [],
      eventPlan: config.eventPlan || [],
      currentEventIndex: 0,
      currentEventId: null,
      currentVariantId: null,
      currentStepIndex: 0,
      resolvedVariants: config.resolvedVariants || {},
      hubState: config.hubState || null,
      completedEvents: [],
      runWrongNotes: [],
      activeCrisis: null,
      pendingTransition: null,
      etymologyDone: false,
      alchemyState: { betaMethyl: false, carbamoyl: false },
      vitals: Object.assign({}, DEFAULT_VITALS),
      updatedAt: Date.now()
    };
    metaState.lastSeed = runState.seed;
    saveMeta();
    saveRun();
    return runState;
  }

  function getRun() {
    return runState;
  }

  function saveRun() {
    if (!runState) return;
    runState.updatedAt = Date.now();
    safeWriteStorage(SAVE_KEY, runState);
  }

  function loadSavedRun() {
    const saved = safeReadStorage(SAVE_KEY, null);
    if (!saved || !saved.mode || !saved.seed) return null;
    runState = saved;
    return runState;
  }

  function clearSavedRun() {
    runState = null;
    try {
      global.localStorage.removeItem(SAVE_KEY);
    } catch (_err) {
      // ignore storage errors
    }
  }

  function peekSavedRunSummary() {
    const saved = safeReadStorage(SAVE_KEY, null);
    if (!saved || !saved.mode) return null;
    const modeName = saved.mode === 'story' ? '章回篇' : '速行篇';
    const done = Array.isArray(saved.completedEvents) ? saved.completedEvents.length : 0;
    const total = Array.isArray(saved.eventPlan) ? saved.eventPlan.length : 18;
    return `${modeName}・${saved.seed}・進度 ${done}/${total}`;
  }

  function grantPouchItem(item) {
    if (!runState || !item || !item.id) return false;
    if (runState.pouchItems.some((p) => p.id === item.id)) return false;
    runState.pouchItems.push(item);
    saveRun();
    return true;
  }

  function hasPouchItem(itemId) {
    if (!runState || !itemId) return false;
    return runState.pouchItems.some((p) => p.id === itemId);
  }

  function applyDelta(delta) {
    if (!runState || !delta) return;
    if (typeof delta.yin === 'number') {
      runState.yin = Math.max(5, Math.min(95, runState.yin + delta.yin));
    }
    if (typeof delta.yang === 'number') {
      runState.yang = Math.max(5, Math.min(95, runState.yang + delta.yang));
    }
    if (typeof delta.guardPills === 'number') {
      runState.guardPills = Math.max(0, Math.min(runState.maxGuardPills, runState.guardPills + delta.guardPills));
    }
    if (typeof delta.riskScore === 'number') {
      runState.riskScore = Math.max(0, runState.riskScore + delta.riskScore);
    }
    saveRun();
  }

  function updateVitals(partial) {
    if (!runState || !partial) return;
    runState.vitals = Object.assign({}, runState.vitals, partial);
    if (!Array.isArray(runState.vitals.badges)) {
      runState.vitals.badges = [];
    }
    saveRun();
  }

  global.TaixuState = {
    DEFAULT_VITALS,
    getMeta,
    setTheme,
    setAudioEnabled,
    unlockCodexIds,
    unlockTableIds,
    addWrongNote,
    unlockEnding,
    createNewRun,
    getRun,
    saveRun,
    loadSavedRun,
    clearSavedRun,
    peekSavedRunSummary,
    grantPouchItem,
    hasPouchItem,
    applyDelta,
    updateVitals
  };
})(window);
