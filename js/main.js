(function (global) {
  'use strict';

  let gameBundle = null;
  let expansionsCfg = null;
  const moduleCache = {};

  async function loadJson(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`無法載入資料檔：${path} (${res.status})`);
    return res.json();
  }

  function uniqueConcat(a, b) {
    const out = Array.isArray(a) ? a.slice() : [];
    const seen = new Set(out);
    (b || []).forEach((item) => {
      if (!seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    });
    return out;
  }

  function mergeLoadedModules() {
    if (global.__TAIXU_EMBEDDED_DATA__) {
      return global.__TAIXU_EMBEDDED_DATA__;
    }

    const orderedMods =
      (expansionsCfg && Array.isArray(expansionsCfg.modules) && expansionsCfg.modules.filter((m) => m.status === 'active')) || [
        { id: 'vol1_vol2', nodesFile: 'data/vol1_vol2_nodes.json', deckFile: 'data/vol1_vol2_deck.json' },
        { id: 'vol3_vol4', nodesFile: 'data/vol3_vol4_nodes.json', deckFile: 'data/vol3_vol4_deck.json' }
      ];

    const mergedNodes = { events: {} };
    const mergedDeck = {
      roguelike: { prologuePool: [], bossPool: [], routes: {} },
      story: { chapters: [] }
    };

    orderedMods.forEach((mod) => {
      const b = moduleCache[mod.id];
      if (!b) return;
      if (b.nodes && b.nodes.events) {
        Object.assign(mergedNodes.events, b.nodes.events);
      }
      if (b.deck) {
        if (b.deck.roguelike) {
          const dr = b.deck.roguelike;
          if (Array.isArray(dr.prologuePool)) {
            mergedDeck.roguelike.prologuePool = uniqueConcat(mergedDeck.roguelike.prologuePool, dr.prologuePool);
          }
          if (Array.isArray(dr.bossPool)) {
            mergedDeck.roguelike.bossPool = uniqueConcat(mergedDeck.roguelike.bossPool, dr.bossPool);
          }
          if (dr.routes && typeof dr.routes === 'object') {
            Object.keys(dr.routes).forEach((rk) => {
              const src = dr.routes[rk];
              const dst = mergedDeck.roguelike.routes[rk];
              if (!dst) {
                mergedDeck.roguelike.routes[rk] = JSON.parse(JSON.stringify(src));
              } else {
                dst.pool = uniqueConcat(dst.pool || [], src.pool || []);
                dst.bossPool = uniqueConcat(dst.bossPool || [], src.bossPool || []);
                if (src.prologuePool) {
                  dst.prologuePool = uniqueConcat(dst.prologuePool || [], src.prologuePool);
                }
                dst.weights = Object.assign({}, dst.weights || {}, src.weights || {});
              }
            });
          }
        }
        if (b.deck.story && Array.isArray(b.deck.story.chapters)) {
          mergedDeck.story.chapters = mergedDeck.story.chapters.concat(b.deck.story.chapters);
        }
      }
    });

    gameBundle.nodes = mergedNodes;
    gameBundle.deck = mergedDeck;
    return gameBundle;
  }

  function resolveRequiredModules(mode, route, storyScope, eventPlan) {
    const needed = new Set();
    if (Array.isArray(eventPlan) && eventPlan.length > 0) {
      eventPlan.forEach((eid) => {
        const num = Number(String(eid || '').replace(/^E/i, ''));
        if (num >= 19) needed.add('vol3_vol4');
        else if (num >= 1) needed.add('vol1_vol2');
      });
    }
    if (mode === 'story') {
      if (storyScope === 'part1') needed.add('vol1_vol2');
      else if (storyScope === 'part2') needed.add('vol3_vol4');
      else {
        needed.add('vol1_vol2');
        needed.add('vol3_vol4');
      }
    } else if (route === 'taiyin' || route === 'liangyi') {
      needed.add('vol1_vol2');
    } else if (route === 'xuanming' || route === 'taiyang') {
      needed.add('vol3_vol4');
    } else {
      needed.add('vol1_vol2');
      needed.add('vol3_vol4');
    }
    return Array.from(needed);
  }

  async function ensureModulesLoaded(moduleIds) {
    if (global.__TAIXU_EMBEDDED_DATA__) {
      return global.__TAIXU_EMBEDDED_DATA__;
    }
    const orderedMods =
      (expansionsCfg && Array.isArray(expansionsCfg.modules) && expansionsCfg.modules.filter((m) => m.status === 'active')) || [
        { id: 'vol1_vol2', nodesFile: 'data/vol1_vol2_nodes.json', deckFile: 'data/vol1_vol2_deck.json' },
        { id: 'vol3_vol4', nodesFile: 'data/vol3_vol4_nodes.json', deckFile: 'data/vol3_vol4_deck.json' }
      ];

    const targets = moduleIds.filter((id) => !moduleCache[id]);
    if (targets.length > 0) {
      await Promise.all(
        targets.map(async (id) => {
          const mod = orderedMods.find((m) => m.id === id);
          if (!mod) return;
          const [nodes, deck] = await Promise.all([loadJson(mod.nodesFile), loadJson(mod.deckFile)]);
          moduleCache[id] = { nodes, deck };
        })
      );
    }

    const updated = mergeLoadedModules();
    if (global.TaixuEngine && typeof global.TaixuEngine.setBundleData === 'function') {
      global.TaixuEngine.setBundleData(updated);
    }
    return updated;
  }

  async function loadInitialMetadata() {
    if (global.__TAIXU_EMBEDDED_DATA__) {
      return global.__TAIXU_EMBEDDED_DATA__;
    }

    let expansions = null;
    try {
      expansions = await loadJson('data/expansions.json');
    } catch (_err) {
      expansions = null;
    }
    expansionsCfg = expansions;

    const [codex, endings] = await Promise.all([
      loadJson('data/codex_entries.json'),
      loadJson('data/endings.json')
    ]);

    return {
      nodes: { events: {} },
      deck: { roguelike: { prologuePool: [], bossPool: [], routes: {} }, story: { chapters: [] } },
      codex,
      endings,
      expansions
    };
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    const t = theme === 'ink' ? 'ink' : 'paper';
    root.setAttribute('data-theme', t);
    const label = document.getElementById('theme-toggle-label');
    if (label) label.textContent = t === 'ink' ? '素箋日間' : '墨硯夜讀';
  }

  function applyAudioLabel(enabled) {
    const btn = document.getElementById('btn-toggle-audio');
    const lbl = document.getElementById('audio-toggle-label');
    if (btn) btn.setAttribute('aria-pressed', String(Boolean(enabled)));
    if (lbl) lbl.textContent = enabled ? '脈音開' : '靜音';
  }

  function showScreen(screenId) {
    ['screen-title', 'screen-play', 'screen-ending'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        const active = id === screenId;
        el.hidden = !active;
        el.classList.toggle('active', active);
      }
    });

    const isPlaying = screenId === 'screen-play';
    const seedChip = document.getElementById('topbar-seed-chip');
    const bookmarkBtn = document.getElementById('btn-save-bookmark');
    const mobileMonitorBtn = document.getElementById('btn-toggle-monitor-mobile');
    if (seedChip) seedChip.hidden = !isPlaying;
    if (bookmarkBtn) bookmarkBtn.hidden = !isPlaying;
    if (mobileMonitorBtn) mobileMonitorBtn.hidden = !isPlaying;

    if (!isPlaying) {
      global.TaixuPulseMonitor.stop();
    }
  }

  async function resumeSlot(slotId) {
    const saved = global.TaixuState.loadSavedRun(slotId);
    if (!saved) return;
    const modIds = resolveRequiredModules(saved.mode, saved.route, saved.storyScope, saved.eventPlan);
    await ensureModulesLoaded(modIds);
    document.getElementById('topbar-seed-value').textContent = saved.seed;
    showScreen('screen-play');
    global.TaixuEngine.resumeCurrentRun();
  }

  function refreshTitleScreen() {
    const meta = global.TaixuState.getMeta();
    const seedInput = document.getElementById('input-seed');
    if (seedInput && !seedInput.value) {
      seedInput.value = meta.lastSeed || global.TaixuRNG.generateSeedCode();
    }

    const panel = document.getElementById('saved-runs-panel');
    const listEl = document.getElementById('saved-runs-list');
    const slots = global.TaixuState.listSavedSlots();
    if (panel && listEl) {
      if (slots.length === 0) {
        panel.hidden = true;
        listEl.innerHTML = '';
      } else {
        panel.hidden = false;
        listEl.innerHTML = '';
        slots.forEach((slot) => {
          const row = document.createElement('div');
          row.className = 'save-slot-row';
          row.setAttribute('data-slot-id', slot.slotId);
          const fmt = (s) => (global.TaixuFormat ? global.TaixuFormat.formatClinicalInline(s) : escapeHtml(s));
          row.innerHTML = `
            <div class="save-slot-meta">
              <span class="save-slot-title">${fmt(slot.title)}</span>
              <span class="save-slot-desc">${fmt(slot.summary)}</span>
            </div>
            <div class="save-slot-actions">
              <button type="button" class="btn-primary btn-resume-slot" data-resume-slot="${escapeHtml(slot.slotId)}">繼續此進度</button>
              <button type="button" class="btn-del-save" data-delete-slot="${escapeHtml(slot.slotId)}" title="清除此存檔槽位">清除</button>
            </div>
          `;
          listEl.appendChild(row);
        });

        listEl.querySelectorAll('[data-resume-slot]').forEach((btn) => {
          btn.addEventListener('click', () => {
            resumeSlot(btn.getAttribute('data-resume-slot')).catch((err) => {
              alert(`讀取進度失敗：${err.message}`);
            });
          });
        });

        listEl.querySelectorAll('[data-delete-slot]').forEach((btn) => {
          btn.addEventListener('click', () => {
            global.TaixuState.deleteSavedSlot(btn.getAttribute('data-delete-slot'));
            refreshTitleScreen();
          });
        });
      }
    }
    global.TaixuCodex.refreshCounters();
  }

  function showEndingScreen(summary) {
    const fmtInline = (s) => (global.TaixuFormat ? global.TaixuFormat.formatClinicalInline(s) : escapeHtml(s));
    const fmtMd = (s) => (global.TaixuFormat ? global.TaixuFormat.formatClinicalMarkdown(s) : escapeHtml(s));
    showScreen('screen-ending');
    document.getElementById('ending-seal').innerHTML = fmtInline(summary.ending.seal || '太虛印可');
    document.getElementById('ending-title').innerHTML = fmtInline(summary.ending.title);
    const scopeName =
      summary.mode === 'story'
        ? summary.storyScope === 'part1'
          ? '上篇重溫（一二卷）'
          : summary.storyScope === 'part2'
            ? '下篇直入（三四卷）'
            : '全四卷大貫通'
        : `Roguelike 速行篇 (${summary.route || '混戰'})`;
    document.getElementById('ending-subtitle').textContent = `${scopeName}｜天機籤號：${summary.seed}`;
    document.getElementById('ending-narrative').innerHTML = `<p>${fmtMd(summary.ending.narrative)}</p><p style="color:var(--ink-secondary);margin-top:8px;">${fmtMd(summary.ending.summary)}</p>`;

    const acc = summary.totalAnswered > 0 ? Math.round((summary.correctFirstTry / summary.totalAnswered) * 100) : 100;
    const metricsEl = document.getElementById('ending-metrics');
    metricsEl.innerHTML = `
      <div class="ending-metric-card"><strong>${acc}%</strong><span>首判準確率 (${summary.correctFirstTry}/${summary.totalAnswered})</span></div>
      <div class="ending-metric-card"><strong>陰${summary.yin} : 陽${summary.yang}</strong><span>太陰太陽平衡度</span></div>
      <div class="ending-metric-card"><strong>${summary.rescuedCount} / ${summary.crisisCount}</strong><span>危機成功補救數</span></div>
      <div class="ending-metric-card"><strong>${summary.guardPills} / ${summary.maxGuardPills}</strong><span>剩餘護心丹</span></div>
    `;

    const wrongList = document.getElementById('ending-wrong-list');
    if (!summary.wrongNotes || summary.wrongNotes.length === 0) {
      wrongList.innerHTML = '<p style="color:var(--jade-ok)">本輪零誤判！全數藥理決策皆一次精準命中。</p>';
    } else {
      wrongList.innerHTML = summary.wrongNotes
        .map(
          (n) => `
        <div class="wrong-card">
          <h4>${fmtInline(n.title)}</h4>
          <p><strong>誤選：</strong>${fmtInline(n.picked)}</p>
          <p>${fmtMd(n.explanation)}</p>
        </div>`
        )
        .join('');
    }
  }

  function bindUi() {
    // Mode card toggles
    const modeRadios = document.querySelectorAll('input[name="game-mode"]');
    const routeBox = document.getElementById('roguelike-route-box');
    const storyScopeBox = document.getElementById('story-scope-box');
    modeRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        document.getElementById('card-mode-roguelike').classList.toggle('selected', radio.value === 'roguelike' && radio.checked);
        document.getElementById('card-mode-story').classList.toggle('selected', radio.value === 'story' && radio.checked);
        if (routeBox) routeBox.hidden = radio.value !== 'roguelike';
        if (storyScopeBox) storyScopeBox.hidden = radio.value !== 'story';
      });
    });

    // Route pills & Story scope pills
    document.querySelectorAll('#roguelike-route-box input[name="rogue-route"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('#roguelike-route-box .route-pill').forEach((pill) => {
          const inp = pill.querySelector('input');
          pill.classList.toggle('selected', Boolean(inp && inp.checked));
        });
      });
    });

    document.querySelectorAll('#story-scope-box input[name="story-scope"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('#story-scope-box .route-pill').forEach((pill) => {
          const inp = pill.querySelector('input');
          pill.classList.toggle('selected', Boolean(inp && inp.checked));
        });
      });
    });

    document.querySelectorAll('input[name="rogue-length"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.sub-chip').forEach((chip) => {
          const inp = chip.querySelector('input');
          chip.classList.toggle('selected', Boolean(inp && inp.checked));
        });
      });
    });

    // Random seed
    document.getElementById('btn-random-seed').addEventListener('click', () => {
      document.getElementById('input-seed').value = global.TaixuRNG.generateSeedCode();
    });

    // Start new game (with on-demand module loading)
    const startBtn = document.getElementById('btn-start-new');
    startBtn.addEventListener('click', async () => {
      const modeEl = document.querySelector('input[name="game-mode"]:checked');
      const routeEl = document.querySelector('input[name="rogue-route"]:checked');
      const scopeEl = document.querySelector('input[name="story-scope"]:checked');
      const lenEl = document.querySelector('input[name="rogue-length"]:checked');
      const seedEl = document.getElementById('input-seed');

      const mode = modeEl ? modeEl.value : 'roguelike';
      const route = routeEl ? routeEl.value : 'all_mixed';
      const storyScope = scopeEl ? scopeEl.value : 'full';
      const rogueLength = lenEl ? Number(lenEl.value) : 6;
      const seed = (seedEl && seedEl.value.trim()) || global.TaixuRNG.generateSeedCode();
      if (seedEl) seedEl.value = seed;

      const origText = startBtn.textContent;
      startBtn.disabled = true;
      startBtn.textContent = '載入丹卷中…';
      try {
        const needed = resolveRequiredModules(mode, route, storyScope);
        await ensureModulesLoaded(needed);
        document.getElementById('topbar-seed-value').textContent = seed;
        showScreen('screen-play');
        global.TaixuEngine.startNewRun({ mode, route, rogueLength, storyScope, seed });
      } catch (err) {
        alert(`資料載入失敗：${err.message}`);
      } finally {
        startBtn.disabled = false;
        startBtn.textContent = origText;
      }
    });

    // Manual Bookmark Save
    const bookmarkBtn = document.getElementById('btn-save-bookmark');
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener('click', () => {
        const run = global.TaixuState.getRun();
        if (!run) return;
        const loc = (document.getElementById('crumb-location') && document.getElementById('crumb-location').textContent) || '';
        const lbl = `${run.mode === 'story' ? '章回' : '速行'}・${loc || run.currentEventId || '中繼'} (${run.seed})`;
        global.TaixuState.saveBookmarkSnapshot(lbl);
        const span = bookmarkBtn.querySelector('span');
        if (span) {
          span.textContent = '已存書籤 ✓';
          setTimeout(() => {
            span.textContent = '存書籤';
          }, 1800);
        }
      });
    }

    // Feedback Next
    document.getElementById('btn-feedback-next').addEventListener('click', () => {
      global.TaixuPulseMonitor.playUiClick(false);
      global.TaixuEngine.continueFromFeedback();
    });

    // Topbar buttons
    document.getElementById('btn-home-logo').addEventListener('click', () => {
      if (global.TaixuState.getRun()) {
        global.TaixuState.saveRun();
      }
      showScreen('screen-title');
      refreshTitleScreen();
    });

    document.getElementById('btn-open-codex').addEventListener('click', () => {
      global.TaixuCodex.open('cards');
    });

    document.getElementById('btn-toggle-theme').addEventListener('click', () => {
      const meta = global.TaixuState.getMeta();
      const next = meta.theme === 'ink' ? 'paper' : 'ink';
      global.TaixuState.setTheme(next);
      applyTheme(next);
    });

    document.getElementById('btn-toggle-audio').addEventListener('click', () => {
      const meta = global.TaixuState.getMeta();
      const next = !meta.audioEnabled;
      global.TaixuState.setAudioEnabled(next);
      applyAudioLabel(next);
      if (next) global.TaixuPulseMonitor.playUiClick(false);
    });

    // Mobile monitor collapse
    const monitorPanel = document.getElementById('pulse-monitor-panel');
    const toggleMobileBtn = document.getElementById('btn-toggle-monitor-mobile');
    const closeMobileBtn = document.getElementById('btn-close-monitor-mobile');

    if (toggleMobileBtn) {
      toggleMobileBtn.addEventListener('click', () => {
        const collapsed = monitorPanel.classList.toggle('mobile-collapsed');
        toggleMobileBtn.setAttribute('aria-expanded', String(!collapsed));
      });
    }
    if (closeMobileBtn) {
      closeMobileBtn.addEventListener('click', () => {
        monitorPanel.classList.add('mobile-collapsed');
        if (toggleMobileBtn) toggleMobileBtn.setAttribute('aria-expanded', 'false');
      });
    }

    // Ending buttons
    document.getElementById('btn-ending-replay').addEventListener('click', () => {
      showScreen('screen-title');
      refreshTitleScreen();
    });

    document.getElementById('btn-ending-codex').addEventListener('click', () => {
      global.TaixuCodex.open('cards');
    });

    document.getElementById('btn-copy-seed').addEventListener('click', (e) => {
      const seedText = document.getElementById('topbar-seed-value').textContent || '';
      if (navigator.clipboard && seedText) {
        navigator.clipboard.writeText(seedText).catch(() => {});
      }
      e.target.textContent = `已複製籤號 (${seedText})`;
      setTimeout(() => {
        e.target.textContent = '複製本局天機籤號';
      }, 2000);
    });

    // Keyboard shortcuts 1-4 and Enter
    document.addEventListener('keydown', (e) => {
      const playScreen = document.getElementById('screen-play');
      const codexDrawer = document.getElementById('codex-drawer');
      if (!playScreen || playScreen.hidden || (codexDrawer && !codexDrawer.hidden)) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      if (e.key >= '1' && e.key <= '4') {
        const idx = Number(e.key);
        const btn = document.getElementById(`choice-${idx}`) || document.getElementById(`rescue-choice-${idx}`);
        if (btn && !btn.disabled) btn.click();
      } else if (e.key === 'Enter') {
        const nextBtn = document.getElementById('btn-feedback-next');
        const contBtn = document.getElementById('btn-step-continue');
        if (nextBtn && !nextBtn.hidden) {
          const fbPanel = document.getElementById('feedback-panel');
          if (fbPanel && !fbPanel.hidden) nextBtn.click();
        } else if (contBtn) {
          contBtn.click();
        }
      }
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function bootstrap() {
    const meta = global.TaixuState.getMeta();
    applyTheme(meta.theme);
    applyAudioLabel(meta.audioEnabled);

    try {
      gameBundle = await loadInitialMetadata();
      global.TaixuCodex.init(gameBundle.codex, gameBundle.endings);
      global.TaixuEngine.init(gameBundle, showEndingScreen);
      bindUi();
      refreshTitleScreen();
      showScreen('screen-title');
      global.__TAIXU_READY__ = true;
    } catch (err) {
      global.__TAIXU_READY__ = true;
      const desc = document.querySelector('.hero-desc');
      if (desc) {
        desc.innerHTML = `<strong style="color:var(--cinnabar)">資料載入失敗：</strong>${escapeHtml(err.message)}。若您直接雙擊本機 HTML 開啟，請改用本地伺服器（如 <code>python3 -m http.server</code>）或執行 <code>tools/bundle_single_file.py</code> 產生單檔離線版！`;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})(window);
