(function (global) {
  'use strict';

  const META_KEY = 'taixu_shennong_meta_v1';
  const LEGACY_SAVE_KEY = 'taixu_shennong_save_v1';
  const SAVES_V2_KEY = 'taixu_shennong_saves_v2';

  const DEFAULT_VITALS = {
    subject: '林玄（試煉基準態）',
    hr: 74,
    sbp: 118,
    dbp: 76,
    iop: 15,
    tempC: 36.8,
    potassium: 4.2,
    rhythm: 'normal',
    rhythmText: '竇性節律（迷走張力主導）',
    pupilMm: 3.5,
    ciliary: '適度平衡',
    airway: 100,
    secretion: '正常潤澤',
    nmj: 50,
    nmjLabel: '穩健有力',
    tofPattern: 'normal',
    tofNote: 'TOF 100%（無衰減）',
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

  function readAllSaves() {
    const v2 = safeReadStorage(SAVES_V2_KEY, null);
    if (v2 && typeof v2 === 'object') {
      return v2;
    }
    const slots = {};
    const legacy = safeReadStorage(LEGACY_SAVE_KEY, null);
    if (legacy && legacy.mode && legacy.seed) {
      const slotId = legacy.mode === 'story' ? 'story' : 'roguelike';
      legacy.slotId = slotId;
      slots[slotId] = legacy;
      safeWriteStorage(SAVES_V2_KEY, slots);
    }
    return slots;
  }

  function writeAllSaves(slots) {
    safeWriteStorage(SAVES_V2_KEY, slots || {});
  }

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
      if (metaState.wrongNotes.length > 120) {
        metaState.wrongNotes.length = 120;
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
    const slotId = config.slotId || (isStory ? 'story' : 'roguelike');
    runState = {
      slotId,
      mode: isStory ? 'story' : 'roguelike',
      route: config.route || 'all_mixed',
      storyScope: config.storyScope || 'full',
      storyVariantMode: config.storyVariantMode || 'compact',
      rogueVariantMode: config.rogueVariantMode || 'balanced',
      rogueLength: config.rogueLength || 6,
      seed: String(config.seed || 'TX-4072').trim(),
      yin: 50,
      yang: 50,
      guardPills: isStory ? (config.storyScope === 'full' ? 5 : 4) : 3,
      maxGuardPills: isStory ? (config.storyScope === 'full' ? 5 : 4) : 3,
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
      currentVariantIndex: 0,
      currentStepIndex: 0,
      resolvedVariants: config.resolvedVariants || {},
      hubState: config.hubState || null,
      completedEvents: [],
      runWrongNotes: [],
      activeCrisis: null,
      pendingTransition: null,
      etymologyDone: false,
      alchemyState: { betaMethyl: false, carbamoyl: false },
      nmjLab: { blocker: 'sch_phase1', action: 'baseline' },
      tyramineMeal: { selected: ['pickled_herring', 'aged_cheese'] },
      catecholSar: { rGroup: 'H', removeRingOh: false, addAlphaMethyl: false },
      sympathoLab: { drug: 'ne', alphaBlocked: false },
      adhdLab: { state: 'baseline' },
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

  function saveRun(customSlotId) {
    if (!runState) return;
    runState.updatedAt = Date.now();
    const targetSlot = customSlotId || runState.slotId || (runState.mode === 'story' ? 'story' : 'roguelike');
    const slots = readAllSaves();
    const snapshot = JSON.parse(JSON.stringify(runState));
    snapshot.slotId = targetSlot;
    slots[targetSlot] = snapshot;
    writeAllSaves(slots);
    if (targetSlot !== 'bookmark') {
      safeWriteStorage(LEGACY_SAVE_KEY, snapshot);
    }
  }

  function saveBookmarkSnapshot(label) {
    if (!runState) return false;
    const slots = readAllSaves();
    const snapshot = JSON.parse(JSON.stringify(runState));
    snapshot.slotId = 'bookmark';
    snapshot.bookmarkLabel = label || '中繼修煉書籤';
    snapshot.updatedAt = Date.now();
    slots.bookmark = snapshot;
    writeAllSaves(slots);
    return true;
  }

  function formatScopeLabel(saved) {
    if (saved.mode === 'story') {
      if (saved.storyScope === 'part1') return '章回篇・上篇（一二卷）';
      if (saved.storyScope === 'part2') return '章回篇・下篇（三四卷）';
      return '章回篇・全四卷貫通';
    }
    return `速行篇（${saved.route || '混戰'}）`;
  }

  function listSavedSlots() {
    const slots = readAllSaves();
    const order = ['story', 'bookmark', 'roguelike'];
    const result = [];
    order.forEach((slotId) => {
      const s = slots[slotId];
      if (!s || !s.mode || !s.seed) return;
      const done = Array.isArray(s.completedEvents) ? s.completedEvents.length : 0;
      const total = Array.isArray(s.eventPlan) ? s.eventPlan.length : 18;
      result.push({
        slotId,
        title: slotId === 'bookmark'
          ? `書籤暫存：${s.bookmarkLabel || formatScopeLabel(s)}`
          : slotId === 'story'
            ? `長篇進度：${formatScopeLabel(s)}`
            : `速行進度：${formatScopeLabel(s)}`,
        summary: `籤號 ${s.seed}｜關卡 ${Math.min(done + 1, total)}/${total}（已完成 ${done} 關）｜護心丹 ${s.guardPills ?? 3}/${s.maxGuardPills ?? 3}`,
        updatedAt: s.updatedAt || 0,
        data: s
      });
    });
    return result;
  }

  function loadSavedRun(slotId) {
    const slots = readAllSaves();
    const target = slotId ? slots[slotId] : (slots.story || slots.roguelike || slots.bookmark);
    if (!target || !target.mode || !target.seed) return null;
    runState = Object.assign(
      {
        storyScope: 'full',
        nmjLab: { blocker: 'sch_phase1', action: 'baseline' },
        tyramineMeal: { selected: ['pickled_herring', 'aged_cheese'] },
        catecholSar: { rGroup: 'H', removeRingOh: false, addAlphaMethyl: false },
        sympathoLab: { drug: 'ne', alphaBlocked: false },
        adhdLab: { state: 'baseline' }
      },
      target
    );
    runState.vitals = Object.assign({}, DEFAULT_VITALS, runState.vitals || {});
    return runState;
  }

  function deleteSavedSlot(slotId) {
    const slots = readAllSaves();
    delete slots[slotId];
    writeAllSaves(slots);
    if (runState && runState.slotId === slotId) {
      runState = null;
    }
  }

  function clearSavedRun(slotId) {
    const targetSlot = slotId || (runState && runState.slotId) || null;
    if (targetSlot) {
      deleteSavedSlot(targetSlot);
    } else {
      runState = null;
      try {
        global.localStorage.removeItem(LEGACY_SAVE_KEY);
      } catch (_err) {
        // ignore storage errors
      }
    }
  }

  function peekSavedRunSummary() {
    const items = listSavedSlots();
    if (items.length === 0) return null;
    return items[0].summary;
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

  const SUB_CHAR_MAP = {
    '₀': '0',
    '₁': '1',
    '₂': '2',
    '₃': '3',
    '₄': '4',
    '₅': '5',
    '₆': '6',
    '₇': '7',
    '₈': '8',
    '₉': '9'
  };

  const SUP_CHAR_MAP = {
    '⁰': '0',
    '¹': '1',
    '²': '2',
    '³': '3',
    '⁴': '4',
    '⁵': '5',
    '⁶': '6',
    '⁷': '7',
    '⁸': '8',
    '⁹': '9',
    '⁺': '+',
    '⁻': '−'
  };

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toAsciiSub(str) {
    return String(str || '').replace(/[₀-₉]/g, (ch) => SUB_CHAR_MAP[ch] || ch);
  }

  function toAsciiSup(str) {
    return String(str || '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, (ch) => SUP_CHAR_MAP[ch] || ch);
  }

  // Single-pass union regex outside HTML tags so generated <sub>/<sup> tags are never nested or corrupted
  const CLINICAL_TOKEN_RE = new RegExp(
    [
      '\\b(?:GABA_[AB]|N_[MN]|G_[isq]|ET_[AB]|I_(?:K,ACh|Ca|f)|NK_[1-3])',
      'PGF[₂2]α',
      'NaHCO[₃3]|MgSO[₄4]|OCONH[₂2]|CH[₂2]OH|CH[₃3]|H[₂2]O',
      'α[₇7]AChR',
      'α[₂2](?:A\\/[2₂]?B\\/[2₂]?C|A\\/B\\/C)',
      'α[₁1]A\\/B\\/D',
      'β[₁1]\\/2\\/3',
      '5-HT[1-7₁-₇][A-D]*(?:\\/[1-7₁-₇]?[A-D]+)*',
      'G(?:₁₂\\/₁₃|12\\/13|i\\/o|q\\/11|α[isq]|βγ)',
      '\\)[235₂₃₅](?![A-Za-z0-9_])',
      '[αβ](?:[1-7][A-D]?|[₁-₇][A-D]*)(?![A-Za-z0-9_])',
      '(?<![A-Za-z0-9_])(?:M[1-5]|H[1-4]|D[1-5]|AT[12]|V[12]|NK[1-3]|IP3|PIP2|G[isq])(?![A-Za-z0-9_])',
      '[₀-₉]+',
      '[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+'
    ].join('|'),
    'g'
  );

  function formatClinicalToken(tok) {
    if (tok === 'PGF₂α' || tok === 'PGF2α') return 'PGF<sub>2α</sub>';
    if (tok === 'NaHCO₃' || tok === 'NaHCO3') return 'NaHCO<sub>3</sub>';
    if (tok === 'MgSO₄' || tok === 'MgSO4') return 'MgSO<sub>4</sub>';
    if (tok === 'OCONH₂' || tok === 'OCONH2') return 'OCONH<sub>2</sub>';
    if (tok === 'CH₂OH' || tok === 'CH2OH') return 'CH<sub>2</sub>OH';
    if (tok === 'CH₃' || tok === 'CH3') return 'CH<sub>3</sub>';
    if (tok === 'H₂O' || tok === 'H2O') return 'H<sub>2</sub>O';
    if (tok === 'α₇AChR' || tok === 'α7AChR') return 'α<sub>7</sub>AChR';

    if (tok.startsWith('GABA_')) return `GABA<sub>${tok.slice(5)}</sub>`;
    if (tok.startsWith('N_')) return `N<sub>${tok.slice(2)}</sub>`;
    if (tok.startsWith('G_')) return `G<sub>${tok.slice(2)}</sub>`;
    if (tok.startsWith('ET_')) return `ET<sub>${tok.slice(3)}</sub>`;
    if (tok.startsWith('I_')) return `I<sub>${tok.slice(2)}</sub>`;
    if (tok.startsWith('NK_')) return `NK<sub>${tok.slice(3)}</sub>`;

    if (tok.startsWith('5-HT')) return `5-HT<sub>${toAsciiSub(tok.slice(4))}</sub>`;
    if (tok.startsWith('G') && tok.length >= 2) return `G<sub>${toAsciiSub(tok.slice(1))}</sub>`;
    if (tok.startsWith(')')) return `)<sub>${toAsciiSub(tok.slice(1))}</sub>`;
    if (tok[0] === 'α' || tok[0] === 'β') return `${tok[0]}<sub>${toAsciiSub(tok.slice(1))}</sub>`;
    if (/^(?:M|H|D|V)[1-5]$/.test(tok)) return `${tok[0]}<sub>${tok.slice(1)}</sub>`;
    if (/^(?:AT|NK)[1-3]$/.test(tok)) return `${tok.slice(0, 2)}<sub>${tok.slice(2)}</sub>`;
    if (tok === 'IP3') return 'IP<sub>3</sub>';
    if (tok === 'PIP2') return 'PIP<sub>2</sub>';
    if (/^[₀-₉]+$/.test(tok)) return `<sub>${toAsciiSub(tok)}</sub>`;
    if (/^[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+$/.test(tok)) return `<sup>${toAsciiSup(tok)}</sup>`;
    return tok;
  }

  function applyClinicalScripts(htmlStr) {
    return String(htmlStr || '').replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
      if (tag) return tag;
      return text.replace(CLINICAL_TOKEN_RE, formatClinicalToken);
    });
  }

  function formatClinicalInline(rawStr) {
    return applyClinicalScripts(escapeHtml(rawStr));
  }

  function formatClinicalMarkdown(rawStr) {
    const escaped = escapeHtml(rawStr)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    return applyClinicalScripts(escaped);
  }

  function stripClinicalTags(str) {
    return toAsciiSub(String(str || ''))
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, (ch) => {
        const mapped = SUP_CHAR_MAP[ch] || ch;
        return mapped === '−' ? '-' : mapped;
      })
      .replace(/−/g, '-')
      .replace(/<\/?(?:sub|sup|strong|code)>/gi, '')
      .replace(/_/g, '');
  }

  global.TaixuFormat = {
    escapeHtml,
    formatClinicalInline,
    formatClinicalMarkdown,
    stripClinicalTags
  };

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
    saveBookmarkSnapshot,
    listSavedSlots,
    loadSavedRun,
    deleteSavedSlot,
    clearSavedRun,
    peekSavedRunSummary,
    grantPouchItem,
    hasPouchItem,
    applyDelta,
    updateVitals
  };
})(window);
