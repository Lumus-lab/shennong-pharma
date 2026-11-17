(function (global) {
  'use strict';

  let gameBundle = null;

  async function loadJson(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`無法載入資料檔：${path} (${res.status})`);
    return res.json();
  }

  async function loadGameData() {
    if (global.__TAIXU_EMBEDDED_DATA__) {
      return global.__TAIXU_EMBEDDED_DATA__;
    }
    let expansions = null;
    try {
      expansions = await loadJson('data/expansions.json');
    } catch (_err) {
      expansions = null;
    }

    const activeModules =
      (expansions &&
        Array.isArray(expansions.modules) &&
        expansions.modules.filter((m) => m.status === 'active')) || [
        {
          id: 'vol1_vol2',
          nodesFile: 'data/vol1_vol2_nodes.json',
          deckFile: 'data/vol1_vol2_deck.json'
        }
      ];

    const [codex, endings, ...modBundles] = await Promise.all([
      loadJson('data/codex_entries.json'),
      loadJson('data/endings.json'),
      ...activeModules.map(async (m) => ({
        nodes: await loadJson(m.nodesFile),
        deck: await loadJson(m.deckFile)
      }))
    ]);

    const mergedNodes = { events: {} };
    let mergedDeck = null;
    modBundles.forEach((b) => {
      if (b.nodes && b.nodes.events) {
        Object.assign(mergedNodes.events, b.nodes.events);
      }
      if (!mergedDeck && b.deck) {
        mergedDeck = b.deck;
      } else if (mergedDeck && b.deck && b.deck.story && Array.isArray(b.deck.story.chapters)) {
        mergedDeck.story.chapters = mergedDeck.story.chapters.concat(b.deck.story.chapters);
      }
    });

    return {
      nodes: mergedNodes,
      deck: mergedDeck || {},
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
    const mobileMonitorBtn = document.getElementById('btn-toggle-monitor-mobile');
    if (seedChip) seedChip.hidden = !isPlaying;
    if (mobileMonitorBtn) mobileMonitorBtn.hidden = !isPlaying;

    if (!isPlaying) {
      global.TaixuPulseMonitor.stop();
    }
  }

  function refreshTitleScreen() {
    const meta = global.TaixuState.getMeta();
    const seedInput = document.getElementById('input-seed');
    if (seedInput && !seedInput.value) {
      seedInput.value = meta.lastSeed || global.TaixuRNG.generateSeedCode();
    }

    const resumeBtn = document.getElementById('btn-resume-save');
    const resumeSummary = document.getElementById('resume-summary');
    const summaryText = global.TaixuState.peekSavedRunSummary();
    if (resumeBtn && resumeSummary) {
      if (summaryText) {
        resumeBtn.hidden = false;
        resumeSummary.textContent = summaryText;
      } else {
        resumeBtn.hidden = true;
      }
    }
    global.TaixuCodex.refreshCounters();
  }

  function showEndingScreen(summary) {
    showScreen('screen-ending');
    document.getElementById('ending-seal').textContent = summary.ending.seal || '太虛印可';
    document.getElementById('ending-title').textContent = summary.ending.title;
    document.getElementById('ending-subtitle').textContent = `${summary.mode === 'story' ? '全卷章回篇' : 'Roguelike 速行篇'}｜天機籤號：${summary.seed}`;
    document.getElementById('ending-narrative').innerHTML = `<p>${escapeHtml(summary.ending.narrative)}</p><p style="color:var(--ink-secondary);margin-top:8px;">${escapeHtml(summary.ending.summary)}</p>`;

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
          <h4>${escapeHtml(n.title)}</h4>
          <p><strong>誤選：</strong>${escapeHtml(n.picked)}</p>
          <p>${escapeHtml(n.explanation)}</p>
        </div>`
        )
        .join('');
    }
  }

  function bindUi() {
    // Mode card toggles
    const modeRadios = document.querySelectorAll('input[name="game-mode"]');
    const routeBox = document.getElementById('roguelike-route-box');
    modeRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        document.getElementById('card-mode-roguelike').classList.toggle('selected', radio.value === 'roguelike' && radio.checked);
        document.getElementById('card-mode-story').classList.toggle('selected', radio.value === 'story' && radio.checked);
        if (routeBox) routeBox.hidden = radio.value !== 'roguelike';
      });
    });

    // Route pills
    document.querySelectorAll('input[name="rogue-route"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.route-pill').forEach((pill) => {
          const inp = pill.querySelector('input');
          pill.classList.toggle('selected', inp && inp.checked);
        });
      });
    });

    // Random seed
    document.getElementById('btn-random-seed').addEventListener('click', () => {
      document.getElementById('input-seed').value = global.TaixuRNG.generateSeedCode();
    });

    // Start new game
    document.getElementById('btn-start-new').addEventListener('click', () => {
      const modeEl = document.querySelector('input[name="game-mode"]:checked');
      const routeEl = document.querySelector('input[name="rogue-route"]:checked');
      const seedEl = document.getElementById('input-seed');

      const mode = modeEl ? modeEl.value : 'roguelike';
      const route = routeEl ? routeEl.value : 'taiyin';
      const seed = (seedEl && seedEl.value.trim()) || global.TaixuRNG.generateSeedCode();
      if (seedEl) seedEl.value = seed;

      document.getElementById('topbar-seed-value').textContent = seed;
      showScreen('screen-play');
      global.TaixuEngine.startNewRun(mode, route, seed);
    });

    // Resume saved game
    document.getElementById('btn-resume-save').addEventListener('click', () => {
      const saved = global.TaixuState.loadSavedRun();
      if (!saved) return;
      document.getElementById('topbar-seed-value').textContent = saved.seed;
      showScreen('screen-play');
      global.TaixuEngine.resumeCurrentRun();
    });

    // Feedback Next
    document.getElementById('btn-feedback-next').addEventListener('click', () => {
      global.TaixuPulseMonitor.playUiClick(false);
      global.TaixuEngine.continueFromFeedback();
    });

    // Topbar buttons
    document.getElementById('btn-home-logo').addEventListener('click', () => {
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
      gameBundle = await loadGameData();
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
