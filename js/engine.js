(function (global) {
  'use strict';

  let nodesData = { events: {} };
  let deckData = {};
  let codexData = { entries: [], referenceTables: [] };
  let endingsData = [];
  let onEndingCallback = null;

  let currentStepHadMistake = false;
  let disabledChoicesOnStep = new Set();

  const SPEAKER_AVATARS = {
    hongyue:
      '<svg viewBox="0 0 40 40" width="32" height="32"><circle cx="20" cy="20" r="18" fill="none" stroke="var(--yin-color)" stroke-width="1.4"/><path d="M12 31 C13 24, 27 24, 28 31" fill="none" stroke="var(--ink-primary)" stroke-width="1.6"/><circle cx="20" cy="16" r="5.5" fill="none" stroke="var(--ink-primary)" stroke-width="1.6"/><path d="M16 10 L20 6 L24 10" fill="none" stroke="var(--cinnabar)" stroke-width="1.5"/><path d="M17 21 Q20 26 23 21" fill="none" stroke="var(--ink-muted)" stroke-width="1.3"/></svg>',
    linxuan:
      '<svg viewBox="0 0 40 40" width="32" height="32"><circle cx="20" cy="20" r="18" fill="none" stroke="var(--ink-muted)" stroke-width="1.2"/><path d="M12 31 C13 24, 27 24, 28 31" fill="none" stroke="var(--yin-color)" stroke-width="1.8"/><circle cx="20" cy="16" r="5.5" fill="none" stroke="var(--ink-primary)" stroke-width="1.6"/><circle cx="14" cy="26" r="2" fill="var(--yin-color)"/><circle cx="26" cy="26" r="2" fill="var(--yang-color)"/></svg>',
    luli:
      '<svg viewBox="0 0 40 40" width="32" height="32"><circle cx="20" cy="20" r="18" fill="none" stroke="var(--yang-color)" stroke-width="1.5"/><path d="M12 31 C13 24, 27 24, 28 31" fill="none" stroke="var(--yang-color)" stroke-width="1.8"/><circle cx="20" cy="16" r="5.5" fill="none" stroke="var(--ink-primary)" stroke-width="1.6"/><path d="M15 11 L20 7 L25 12" fill="none" stroke="var(--cinnabar)" stroke-width="1.8"/></svg>',
    suling:
      '<svg viewBox="0 0 40 40" width="32" height="32"><circle cx="20" cy="20" r="18" fill="none" stroke="var(--jade-ok)" stroke-width="1.4"/><path d="M12 31 C13 24, 27 24, 28 31" fill="none" stroke="var(--yin-color)" stroke-width="1.6"/><circle cx="20" cy="16" r="5.2" fill="none" stroke="var(--ink-primary)" stroke-width="1.6"/><path d="M13 14 Q20 8 27 14" fill="none" stroke="var(--yin-color)" stroke-width="1.5"/></svg>',
    patient:
      '<svg viewBox="0 0 40 40" width="32" height="32"><circle cx="20" cy="20" r="18" fill="none" stroke="var(--cinnabar)" stroke-width="1.3" stroke-dasharray="3 2"/><path d="M12 31 C13 24, 27 24, 28 31" fill="none" stroke="var(--ink-secondary)" stroke-width="1.6"/><circle cx="20" cy="16" r="5.2" fill="none" stroke="var(--ink-secondary)" stroke-width="1.6"/><path d="M17 16 L23 16" stroke="var(--cinnabar)" stroke-width="1.4"/></svg>',
    narrator:
      '<svg viewBox="0 0 40 40" width="32" height="32"><rect x="9" y="8" width="22" height="24" rx="2" fill="none" stroke="var(--ink-muted)" stroke-width="1.4"/><line x1="13" y1="14" x2="27" y2="14" stroke="var(--ink-muted)" stroke-width="1.4"/><line x1="13" y1="20" x2="27" y2="20" stroke="var(--ink-muted)" stroke-width="1.4"/><line x1="13" y1="26" x2="22" y2="26" stroke="var(--ink-muted)" stroke-width="1.4"/></svg>'
  };

  function init(bundle, endingCb) {
    nodesData = bundle.nodes || { events: {} };
    deckData = bundle.deck || {};
    codexData = bundle.codex || { entries: [], referenceTables: [] };
    endingsData = bundle.endings || [];
    onEndingCallback = endingCb;
  }

  function startNewRun(mode, route, seed) {
    const rng = global.TaixuRNG.createMulberry32(seed);
    const resolvedVariants = {};
    let eventPlan = [];
    let hubState = null;

    if (mode === 'roguelike') {
      const rCfg = deckData.roguelike;
      const routeCfg = (rCfg.routes && rCfg.routes[route]) || rCfg.routes.taiyin;
      const prologueId = rng.pick(rCfg.prologuePool || ['E01', 'E02']);

      const midPool = (routeCfg.pool || []).slice();
      const midWeights = routeCfg.weights || {};
      const drawnMid = rng.weightedSample(midPool, 4, (id) => midWeights[id] || 1);

      const bossPool = routeCfg.bossPool || rCfg.bossPool || ['E15', 'E16', 'E17', 'E18'];
      const bossId = rng.weightedSample(bossPool, 1, (id) => midWeights[id] || 1)[0];

      eventPlan = [prologueId].concat(drawnMid).concat([bossId]);

      eventPlan.forEach((eid) => {
        const ev = nodesData.events[eid];
        if (ev && ev.variants && ev.variants.length > 0) {
          const picked = rng.pick(ev.variants);
          resolvedVariants[eid] = [picked.variantId];
        }
      });
    } else {
      const chapters = (deckData.story && deckData.story.chapters) || [];
      chapters.forEach((ch) => {
        eventPlan = eventPlan.concat(ch.events || []);
      });

      eventPlan.forEach((eid) => {
        const ev = nodesData.events[eid];
        if (!ev || !ev.variants || ev.variants.length === 0) return;
        const vIds = ev.variants.map((v) => v.variantId);
        if (ev.storyMode === 'all') {
          resolvedVariants[eid] = rng.shuffle(vIds);
        } else {
          resolvedVariants[eid] = [rng.pick(vIds)];
        }
      });

      hubState = {
        chapterIndex: 0,
        activeHubChapterId: null
      };
    }

    const run = global.TaixuState.createNewRun({
      mode,
      route,
      seed,
      eventPlan,
      resolvedVariants,
      hubState
    });

    if (mode === 'story') {
      advanceStoryProgress();
    } else {
      beginEvent(eventPlan[0]);
    }
    return run;
  }

  function resumeCurrentRun() {
    const run = global.TaixuState.getRun();
    if (!run) return;
    if (run.mode === 'story' && run.hubState && run.hubState.activeHubChapterId && !run.currentEventId) {
      renderHub(run.hubState.activeHubChapterId);
      return;
    }
    if (!run.currentEventId) {
      if (run.mode === 'story') {
        advanceStoryProgress();
      } else {
        const nextId = run.eventPlan[run.currentEventIndex];
        if (nextId) beginEvent(nextId);
        else finishRun();
      }
      return;
    }
    renderCurrentState();
  }

  function advanceStoryProgress() {
    const run = global.TaixuState.getRun();
    const chapters = (deckData.story && deckData.story.chapters) || [];
    const doneSet = new Set(run.completedEvents || []);

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const remaining = (ch.events || []).filter((id) => !doneSet.has(id));
      if (remaining.length === 0) continue;

      run.hubState.chapterIndex = i;
      if (ch.freeOrder && remaining.length > 1) {
        run.hubState.activeHubChapterId = ch.id;
        run.currentEventId = null;
        global.TaixuState.saveRun();
        renderHub(ch.id);
        return;
      } else {
        run.hubState.activeHubChapterId = null;
        beginEvent(remaining[0]);
        return;
      }
    }
    finishRun();
  }

  function renderHub(chapterId) {
    const run = global.TaixuState.getRun();
    const chapters = (deckData.story && deckData.story.chapters) || [];
    const ch = chapters.find((c) => c.id === chapterId);
    if (!ch) {
      advanceStoryProgress();
      return;
    }

    const doneSet = new Set(run.completedEvents || []);
    const hubPanel = document.getElementById('hub-panel');
    const sceneCard = document.getElementById('scene-card');
    const hubTitle = document.getElementById('hub-title');
    const hubDesc = document.getElementById('hub-desc');
    const hubCards = document.getElementById('hub-cards');

    document.getElementById('crumb-chapter').textContent = ch.title;
    document.getElementById('crumb-location').textContent = '自由接診／破陣樞紐';

    hubTitle.textContent = ch.title;
    hubDesc.textContent = ch.hubDescription || '請自由選擇接下來欲前往的試煉殿堂或診間。先取得「隨身丹囊」道具，將為後續關卡提供靈應線索！';

    hubCards.innerHTML = '';
    (ch.events || []).forEach((eid) => {
      const ev = nodesData.events[eid];
      if (!ev) return;
      const isDone = doneSet.has(eid);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `hub-card ${isDone ? 'done' : ''}`;
      card.disabled = isDone;
      card.setAttribute('data-event-id', eid);
      card.innerHTML = `
        <div class="hub-card-top">
          <span>${escapeHtml(eid)}・${escapeHtml(ev.location)}</span>
          <span class="hub-card-status">${isDone ? '已完成 ✓' : '前往試煉 →'}</span>
        </div>
        <h3>${escapeHtml(ev.title)}</h3>
        <p>${escapeHtml(ev.hubSummary || ev.subtitle || '')}</p>
      `;
      if (!isDone) {
        card.addEventListener('click', () => {
          global.TaixuPulseMonitor.playUiClick(false);
          run.hubState.activeHubChapterId = null;
          beginEvent(eid);
        });
      }
      hubCards.appendChild(card);
    });

    sceneCard.hidden = true;
    hubPanel.hidden = false;
    updateHud();
    global.TaixuPulseMonitor.update(run.vitals);
  }

  function beginEvent(eventId) {
    const run = global.TaixuState.getRun();
    const ev = nodesData.events[eventId];
    if (!ev) {
      finishRun();
      return;
    }
    run.currentEventId = eventId;
    run.currentVariantIndex = 0;
    run.currentStepIndex = 0;
    run.activeCrisis = null;
    run.pendingTransition = null;
    currentStepHadMistake = false;
    disabledChoicesOnStep = new Set();

    if (Array.isArray(ev.unlockTables)) {
      global.TaixuState.unlockTableIds(ev.unlockTables);
    }

    global.TaixuState.saveRun();
    renderCurrentState();
  }

  function getActiveVariantObj(run, ev) {
    const queue = run.resolvedVariants[ev.id] || [ev.variants[0].variantId];
    const vIdx = Math.min(run.currentVariantIndex || 0, queue.length - 1);
    const vId = queue[vIdx];
    return ev.variants.find((v) => v.variantId === vId) || ev.variants[0];
  }

  function renderCurrentState() {
    const run = global.TaixuState.getRun();
    const ev = nodesData.events[run.currentEventId];
    if (!ev) {
      finishRun();
      return;
    }

    const hubPanel = document.getElementById('hub-panel');
    const sceneCard = document.getElementById('scene-card');
    hubPanel.hidden = true;
    sceneCard.hidden = false;

    const variant = getActiveVariantObj(run, ev);
    const step = variant.steps[run.currentStepIndex] || variant.steps[0];
    if (!step) {
      completeCurrentVariantOrEvent();
      return;
    }

    if (step.vitals && !run.activeCrisis && !run.pendingTransition) {
      global.TaixuState.updateVitals(step.vitals);
    }
    if (Array.isArray(step.unlockCodex)) {
      global.TaixuState.unlockCodexIds(step.unlockCodex);
      global.TaixuCodex.refreshCounters();
    }

    updateHud();
    global.TaixuPulseMonitor.update(run.vitals);

    document.getElementById('crumb-chapter').textContent = ev.chapterTitle || `第${ev.chapter}章`;
    document.getElementById('crumb-location').textContent = `${ev.location}｜${ev.title}`;

    const variantChip = document.getElementById('variant-chip');
    if (variantChip) {
      variantChip.hidden = false;
      variantChip.textContent = `變體 ${variant.variantId}`;
    }

    // Check active crisis
    const crisisBanner = document.getElementById('crisis-banner');
    if (run.activeCrisis) {
      crisisBanner.hidden = false;
      document.getElementById('crisis-title-text').textContent = run.activeCrisis.title;
      document.getElementById('crisis-mech-text').textContent = run.activeCrisis.mechanism;
      renderSpeaker('suling', '急症搶救線', '臨危處置・即時補救');
      renderRichText(document.getElementById('scene-body'), run.activeCrisis.rescuePrompt);
      document.getElementById('pouch-hint').hidden = true;
      document.getElementById('interactive-lab').hidden = true;
      document.getElementById('feedback-panel').hidden = true;
      renderRescueChoices(run.activeCrisis.rescueChoices || []);
      return;
    }

    crisisBanner.hidden = true;
    renderSpeaker(step.speaker || 'narrator', step.speakerName || '太虛旁白', step.speakerTag || '');
    renderRichText(document.getElementById('scene-body'), step.text);

    // Pouch Hints
    const pouchHintEl = document.getElementById('pouch-hint');
    const pouchTextEl = document.getElementById('pouch-hint-text');
    let matchedHint = null;
    if (Array.isArray(step.pouchHints)) {
      matchedHint = step.pouchHints.find((h) => global.TaixuState.hasPouchItem(h.itemId));
    }
    if (matchedHint) {
      pouchHintEl.hidden = false;
      pouchTextEl.textContent = matchedHint.text;
    } else {
      pouchHintEl.hidden = true;
    }

    // Interactive micro-lab
    renderInteractiveLab(step, run);

    // Pending feedback vs Choices
    const fbPanel = document.getElementById('feedback-panel');
    if (run.pendingTransition) {
      fbPanel.hidden = false;
      showPendingFeedbackPanel(run.pendingTransition);
      renderChoices(step.choices || [], true);
    } else {
      fbPanel.hidden = true;
      renderChoices(step.choices || [], false);
    }
  }

  function renderSpeaker(speakerKey, name, role) {
    const avatar = document.getElementById('speaker-avatar');
    if (avatar) {
      avatar.innerHTML = SPEAKER_AVATARS[speakerKey] || SPEAKER_AVATARS.narrator;
    }
    document.getElementById('speaker-name').textContent = name;
    document.getElementById('speaker-role').textContent = role;
  }

  function renderRichText(container, text) {
    if (!container) return;
    const paragraphs = String(text || '').split('\n');
    container.innerHTML = paragraphs
      .filter((p) => p.trim().length > 0)
      .map((p) => `<p>${formatInlineMarkup(p)}</p>`)
      .join('');
  }

  function formatInlineMarkup(str) {
    const escaped = escapeHtml(str);
    return escaped
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function renderInteractiveLab(step, run) {
    const labEl = document.getElementById('interactive-lab');
    if (!step.widget) {
      labEl.hidden = true;
      labEl.innerHTML = '';
      return;
    }

    labEl.hidden = false;
    if (step.widget === 'alchemy_ester') {
      const al = run.alchemyState || { betaMethyl: false, carbamoyl: false };
      let esterName = 'Acetylcholine (Miochol-E)';
      let acheSens = '++++（150 μs 極快水解）';
      let nAct = '+++（強效 N_M / N_N）';
      let mAct = '+++（強效）';
      let clinical = '極短效；眼科手術縮瞳';

      if (al.betaMethyl && !al.carbamoyl) {
        esterName = 'Methacholine (Provocholine)';
        acheSens = '+（β-甲基立體障礙部分抗水解）';
        nAct = 'None（β-甲基完全消除 N 作用）';
        mAct = '++++（極強效 M 選擇性）';
        clinical = '氣喘支氣管激發試驗';
      } else if (!al.betaMethyl && al.carbamoyl) {
        esterName = 'Carbachol (Miostat)';
        acheSens = 'Negligible（胺基甲酸酯共振抗水解）';
        nAct = '+++（保留強效 N 作用）';
        mAct = '++（中度）';
        clinical = '青光眼點眼縮瞳（不口服）';
      } else if (al.betaMethyl && al.carbamoyl) {
        esterName = 'Bethanechol (Urecholine)';
        acheSens = 'Negligible（雙重修飾完全抗 AChE）';
        nAct = 'None（完全無 N 作用）';
        mAct = '++（專一活化 M 受體）';
        clinical = '術後／神經性尿滯留與腸阻塞（禁用於氣喘）';
      }

      labEl.innerHTML = `
        <h3 class="lab-title">四象膽鹼酯煉丹台（點擊切換基團觀察構效關係 SAR）</h3>
        <div class="lab-controls">
          <button type="button" class="lab-toggle ${al.betaMethyl ? 'active' : ''}" id="btn-lab-beta">
            ${al.betaMethyl ? '✓ ' : ''}導入 β-甲基 (-CH₃)
          </button>
          <button type="button" class="lab-toggle ${al.carbamoyl ? 'active' : ''}" id="btn-lab-carb">
            ${al.carbamoyl ? '✓ ' : ''}換入 Carbamoyl 基 (-OCONH₂)
          </button>
        </div>
        <div class="lab-readout">
          <div class="lab-kv"><span>煉成產物</span><strong>${esterName}</strong></div>
          <div class="lab-kv"><span>對 AChE 敏感度</span><strong>${acheSens}</strong></div>
          <div class="lab-kv"><span>菸鹼 (N) 活性</span><strong>${nAct}</strong></div>
          <div class="lab-kv"><span>蕈毒鹼 (M) 與用途</span><strong>${mAct}｜${clinical}</strong></div>
        </div>
      `;

      labEl.querySelector('#btn-lab-beta').addEventListener('click', () => {
        run.alchemyState.betaMethyl = !run.alchemyState.betaMethyl;
        global.TaixuState.saveRun();
        renderInteractiveLab(step, run);
      });
      labEl.querySelector('#btn-lab-carb').addEventListener('click', () => {
        run.alchemyState.carbamoyl = !run.alchemyState.carbamoyl;
        global.TaixuState.saveRun();
        renderInteractiveLab(step, run);
      });
    } else if (step.widget === 'endothelium_lab') {
      const intact = run.endotheliumIntact !== false;
      labEl.innerHTML = `
        <h3 class="lab-title">Furchgott 離體血管試驗台（切換內皮狀態再注 ACh 3×10⁻⁷ M）</h3>
        <div class="lab-controls">
          <button type="button" class="lab-toggle ${intact ? 'active' : ''}" id="btn-endo-unrubbed">完整未磨除內皮 (Unrubbed)</button>
          <button type="button" class="lab-toggle ${!intact ? 'active' : ''}" id="btn-endo-rubbed">已磨除內皮 (Rubbed)</button>
        </div>
        <div class="lab-readout">
          <div class="lab-kv"><span>主要結合位置</span><strong>${intact ? '內皮細胞 M₃ → eNOS' : '平滑肌細胞 M₃ (直接 Gq→IP₃→↑Ca²⁺)'}</strong></div>
          <div class="lab-kv"><span>血管反應</span><strong>${intact ? '釋放 EDRF (NO) → 血管舒張' : '失去 NO 緩衝 → 反轉為血管收縮'}</strong></div>
        </div>
      `;
      labEl.querySelector('#btn-endo-unrubbed').addEventListener('click', () => {
        run.endotheliumIntact = true;
        global.TaixuState.updateVitals({ sbp: 92, dbp: 58, hr: 96, rhythmText: '內皮舒張・輕度反射加速', badges: ['EDRF/NO 釋放'] });
        global.TaixuPulseMonitor.update(run.vitals);
        renderInteractiveLab(step, run);
      });
      labEl.querySelector('#btn-endo-rubbed').addEventListener('click', () => {
        run.endotheliumIntact = false;
        global.TaixuState.updateVitals({ sbp: 174, dbp: 106, hr: 62, rhythmText: '內皮缺失・平滑肌 M₃ 收縮升壓', badges: ['內皮磨除反轉收縮'] });
        global.TaixuPulseMonitor.update(run.vitals);
        renderInteractiveLab(step, run);
      });
    } else if (step.widget === 'etymology_forge') {
      const pool = [
        { term: 'brady-', ans: '慢 (Slow) — 如 Bradycardia' },
        { term: 'tachy-', ans: '快 (Fast) — 如 Tachycardia' },
        { term: 'contra-', ans: '反對／禁忌 (Against) — 如 Contraindicated' },
        { term: 'a- / an-', ans: '無／不 (Without) — 如 Anesthesia' },
        { term: 'cardi/o', ans: '心臟 (Heart) — 如 Cardiomyopathy' },
        { term: 'hepat/o', ans: '肝臟 (Liver) — 如 Hepatology' },
        { term: 'gastr/o', ans: '胃 (Stomach) — 如 Gastroenterology' },
        { term: '-lysis', ans: '分解／破壞 (Breakdown) — 如 Hemolysis' },
        { term: '-stasis', ans: '停止／控制 (Stopping) — 如 Hemostasis' },
        { term: '-plasia', ans: '形成／發育 (Formation) — 如 Dysplasia' },
        { term: '-phagia', ans: '進食／吞嚥 (Swallowing) — 如 Dysphagia' },
        { term: '-genic', ans: '產生／源於 (Originating) — 如 Pathogenic' }
      ];
      const rng = global.TaixuRNG.createMulberry32(run.seed + '_E01_RUNES');
      const drawn = rng.shuffle(pool).slice(0, 3);
      const revealed = run.revealedRunes || {};

      labEl.innerHTML = `
        <h3 class="lab-title">三才真言碑・本局天機抽籤符文（點擊符文即可拓印破譯）</h3>
        <div class="lab-controls">
          ${drawn
            .map(
              (item) => `
            <button type="button" class="lab-toggle ${revealed[item.term] ? 'active' : ''}" data-rune="${escapeHtml(item.term)}">
              <code>${escapeHtml(item.term)}</code> ${revealed[item.term] ? '→ ' + escapeHtml(item.ans) : '（點擊破譯）'}
            </button>`
            )
            .join('')}
        </div>
      `;
      labEl.querySelectorAll('[data-rune]').forEach((btn) => {
        btn.addEventListener('click', () => {
          run.revealedRunes = run.revealedRunes || {};
          run.revealedRunes[btn.getAttribute('data-rune')] = true;
          global.TaixuState.saveRun();
          renderInteractiveLab(step, run);
        });
      });
    }
  }

  function getOrderedList(items, salt) {
    if (!Array.isArray(items) || items.length <= 1) return items ? items.slice() : [];
    const run = global.TaixuState.getRun();
    const seedStr = `${run ? run.seed : 'TX'}_${salt}`;
    const rng = global.TaixuRNG.createMulberry32(seedStr);
    return rng.shuffle(items);
  }

  function renderChoices(choices, lockAll) {
    const area = document.getElementById('choices-area');
    area.innerHTML = '';

    if (!choices || choices.length === 0) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-primary';
      btn.id = 'btn-step-continue';
      btn.textContent = '繼續推進';
      btn.addEventListener('click', () => {
        global.TaixuPulseMonitor.playUiClick(false);
        advanceStepOrEvent();
      });
      area.appendChild(btn);
      return;
    }

    const run = global.TaixuState.getRun();
    const ev = run && nodesData.events[run.currentEventId];
    const variant = ev ? getActiveVariantObj(run, ev) : null;
    const step = variant ? variant.steps[run.currentStepIndex] : null;
    const salt = `choices_${run ? run.currentEventId : ''}_${variant ? variant.variantId : ''}_${step ? step.id : run.currentStepIndex}`;
    const ordered = getOrderedList(choices, salt);

    ordered.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';
      btn.id = `choice-${idx + 1}`;
      const isDisabled = lockAll || disabledChoicesOnStep.has(choice.id);
      btn.disabled = isDisabled;

      if (disabledChoicesOnStep.has(choice.id)) {
        btn.classList.add('picked-wrong');
      }

      btn.innerHTML = `
        <span class="choice-key">${idx + 1}</span>
        <span class="choice-text-wrap">
          <span class="choice-main">${escapeHtml(choice.label)}</span>
          ${choice.sublabel ? `<span class="choice-sub">${escapeHtml(choice.sublabel)}</span>` : ''}
        </span>
      `;
      btn.addEventListener('click', () => handleChoiceClick(choice));
      area.appendChild(btn);
    });
  }

  function renderRescueChoices(rescueChoices) {
    const area = document.getElementById('choices-area');
    const fbPanel = document.getElementById('feedback-panel');
    area.innerHTML = '';
    fbPanel.hidden = true;

    const run = global.TaixuState.getRun();
    const salt = `rescue_${run ? run.currentEventId : ''}_${run ? run.currentVariantIndex : 0}_${run ? run.currentStepIndex : 0}`;
    const ordered = getOrderedList(rescueChoices, salt);

    ordered.forEach((rc, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';
      btn.id = `rescue-choice-${idx + 1}`;
      btn.innerHTML = `
        <span class="choice-key">${idx + 1}</span>
        <span class="choice-text-wrap">
          <span class="choice-main">${escapeHtml(rc.label)}</span>
          ${rc.sublabel ? `<span class="choice-sub">${escapeHtml(rc.sublabel)}</span>` : ''}
        </span>
      `;
      btn.addEventListener('click', () => handleRescueClick(rc));
      area.appendChild(btn);
    });
  }

  function handleChoiceClick(choice) {
    const run = global.TaixuState.getRun();
    const ev = nodesData.events[run.currentEventId];
    const variant = getActiveVariantObj(run, ev);
    const step = variant.steps[run.currentStepIndex];

    if (choice.outcome === 'crisis') {
      global.TaixuPulseMonitor.playUiClick(true);
      currentStepHadMistake = true;
      run.totalAnswered += 1;
      run.crisisCount += 1;

      const prevPills = run.guardPills;
      global.TaixuState.applyDelta({
        guardPills: -1,
        riskScore: 2,
        ...(choice.feedback && choice.feedback.delta ? choice.feedback.delta : {})
      });

      const crisisObj = choice.crisis || {};
      if (crisisObj.vitals) {
        global.TaixuState.updateVitals(crisisObj.vitals);
      }

      const note = {
        key: `${ev.id}_${variant.variantId}_${step.id}_${choice.id}`,
        title: `${ev.title}｜${crisisObj.title || '急症危機'}`,
        picked: choice.label,
        explanation: crisisObj.mechanism || (choice.feedback && choice.feedback.text) || ''
      };
      global.TaixuState.addWrongNote(note);
      if (!run.runWrongNotes.some((n) => n.key === note.key)) {
        run.runWrongNotes.push(note);
      }

      run.activeCrisis = {
        title: crisisObj.title || '藥理急症危機',
        mechanism: crisisObj.mechanism || '',
        rescuePrompt: crisisObj.rescuePrompt || '請立即採取緊急補救措施！',
        rescueChoices: crisisObj.rescueChoices || [],
        nextStepId: choice.nextStepId || null,
        depletedBeforeCrisis: prevPills <= 0
      };
      global.TaixuState.saveRun();
      global.TaixuCodex.refreshCounters();
      renderCurrentState();
      return;
    }

    if (choice.outcome === 'wrong') {
      global.TaixuPulseMonitor.playUiClick(true);
      disabledChoicesOnStep.add(choice.id);

      if (!currentStepHadMistake) {
        run.totalAnswered += 1;
        currentStepHadMistake = true;
      }

      const fb = choice.feedback || {};
      global.TaixuState.applyDelta({
        riskScore: 1,
        ...(fb.delta || {})
      });
      if (fb.vitals) {
        global.TaixuState.updateVitals(fb.vitals);
        global.TaixuPulseMonitor.update(run.vitals);
      }

      const note = {
        key: `${ev.id}_${variant.variantId}_${step.id}_${choice.id}`,
        title: `${ev.title}｜誘答辨析`,
        picked: choice.label,
        explanation: fb.text || ''
      };
      global.TaixuState.addWrongNote(note);
      if (!run.runWrongNotes.some((n) => n.key === note.key)) {
        run.runWrongNotes.push(note);
      }

      global.TaixuCodex.refreshCounters();
      updateHud();

      const fbPanel = document.getElementById('feedback-panel');
      fbPanel.hidden = false;
      fbPanel.className = 'feedback-panel is-wrong';
      document.getElementById('feedback-badge').textContent = '藥理推演警示（可改選其他方案）';
      document.getElementById('feedback-speaker').textContent = fb.speakerName || '蘇苓師妹';
      renderRichText(document.getElementById('feedback-body'), fb.text || '此方案將造成異常反應，請再行斟酌！');
      document.getElementById('feedback-unlocks').hidden = true;
      document.getElementById('btn-feedback-next').hidden = true;

      renderChoices(step.choices || [], false);
      return;
    }

    // Correct / Branch
    global.TaixuPulseMonitor.playUiClick(false);
    if (!currentStepHadMistake) {
      run.totalAnswered += 1;
      run.correctFirstTry += 1;
    }

    const fb = choice.feedback || {};
    if (fb.delta) global.TaixuState.applyDelta(fb.delta);
    if (fb.vitals) global.TaixuState.updateVitals(fb.vitals);

    let unlockedNames = [];
    const stepCodex = [].concat(step.unlockCodex || []).concat(fb.unlockCodex || []);
    const isFinalStepOfEvent =
      choice.nextStepId === '__EVENT_COMPLETE__' || run.currentStepIndex + 1 >= variant.steps.length;
    const codexToUnlock =
      stepCodex.length > 0 ? stepCodex : isFinalStepOfEvent ? ev.codexIds || [] : [];

    const newly = global.TaixuState.unlockCodexIds(codexToUnlock);
    newly.forEach((num) => {
      const found = (codexData.entries || []).find((e) => e.num === num);
      if (found) unlockedNames.push(`#${num} ${found.title}`);
    });

    if (fb.grantItem) {
      const gained = global.TaixuState.grantPouchItem(fb.grantItem);
      if (gained) unlockedNames.push(`丹囊入手：${fb.grantItem.name}`);
    }

    run.pendingTransition = {
      type: 'correct',
      badge: choice.outcome === 'suboptimal' ? '勉強過關（可再精進）' : '推演無誤',
      speakerName: fb.speakerName || '弘岳真人',
      text: fb.text || '施治得宜，氣脈循常！',
      unlockedNames,
      nextStepId: choice.nextStepId || null
    };

    global.TaixuState.saveRun();
    global.TaixuCodex.refreshCounters();
    updateHud();
    global.TaixuPulseMonitor.update(run.vitals);

    const fbPanel = document.getElementById('feedback-panel');
    fbPanel.hidden = false;
    showPendingFeedbackPanel(run.pendingTransition);
    renderChoices(step.choices || [], true);
  }

  function handleRescueClick(rc) {
    const run = global.TaixuState.getRun();
    const ev = nodesData.events[run.currentEventId];
    const variant = getActiveVariantObj(run, ev);
    const step = variant.steps[run.currentStepIndex];
    const crisis = run.activeCrisis;
    if (!crisis) return;

    if (rc.vitals) global.TaixuState.updateVitals(rc.vitals);
    if (rc.delta) global.TaixuState.applyDelta(rc.delta);

    let forceEndId = null;
    let feedbackText = rc.feedbackText || '';
    if (rc.isSuccess) {
      global.TaixuPulseMonitor.playUiClick(false);
      run.rescuedCount += 1;
      if (crisis.depletedBeforeCrisis) {
        forceEndId = 'reincarnate';
        feedbackText += '\n（護心丹早已耗盡，林玄憑最後靈氣搶回病患後隨即力竭退出本輪試煉……）';
      }
    } else {
      global.TaixuPulseMonitor.playUiClick(true);
      run.failedRescueCount += 1;
      global.TaixuState.applyDelta({ guardPills: -1, riskScore: 3 });

      if (ev.isBoss || ev.chapter === 5) {
        forceEndId = 'qi_reversal';
      } else if (run.guardPills <= 0) {
        forceEndId = 'reincarnate';
      }
    }

    const correctOpt = (step && step.choices ? step.choices : []).find((c) => c.outcome === 'correct');
    const stepUnlockIds = []
      .concat(rc.unlockCodex || [])
      .concat((step && step.unlockCodex) || [])
      .concat((correctOpt && correctOpt.feedback && correctOpt.feedback.unlockCodex) || []);
    const unlockTarget = stepUnlockIds.length > 0 ? stepUnlockIds : ev.codexIds || [];
    const unlocked = global.TaixuState.unlockCodexIds(unlockTarget);
    const unlockedNames = unlocked.map((num) => {
      const found = (codexData.entries || []).find((e) => e.num === num);
      return found ? `#${num} ${found.title}` : `#${num}`;
    });

    run.activeCrisis = null;
    run.pendingTransition = {
      type: rc.isSuccess ? 'correct' : 'crisis',
      badge: rc.isSuccess ? '險中求生・成功搶救' : '搶救失利・師尊強行保命',
      speakerName: rc.isSuccess ? '弘岳真人' : '弘岳真人（強行出手）',
      text: feedbackText,
      unlockedNames,
      nextStepId: crisis.nextStepId || null,
      forceEndId
    };

    global.TaixuState.saveRun();
    global.TaixuCodex.refreshCounters();
    updateHud();
    global.TaixuPulseMonitor.update(run.vitals);

    document.getElementById('crisis-banner').hidden = true;
    document.getElementById('choices-area').innerHTML = '';
    const fbPanel = document.getElementById('feedback-panel');
    fbPanel.hidden = false;
    showPendingFeedbackPanel(run.pendingTransition);
  }

  function showPendingFeedbackPanel(tr) {
    const fbPanel = document.getElementById('feedback-panel');
    fbPanel.className = `feedback-panel ${tr.type === 'crisis' ? 'is-crisis' : 'is-correct'}`;
    document.getElementById('feedback-badge').textContent = tr.badge;
    document.getElementById('feedback-speaker').textContent = tr.speakerName;
    renderRichText(document.getElementById('feedback-body'), tr.text);

    const unlocksEl = document.getElementById('feedback-unlocks');
    if (tr.unlockedNames && tr.unlockedNames.length > 0) {
      unlocksEl.hidden = false;
      unlocksEl.innerHTML = tr.unlockedNames
        .map((n) => `<span class="unlock-tag">解鎖 ${escapeHtml(n)}</span>`)
        .join('');
    } else {
      unlocksEl.hidden = true;
    }

    const nextBtn = document.getElementById('btn-feedback-next');
    nextBtn.hidden = false;
    nextBtn.textContent = tr.forceEndId ? '前往結算結局' : '繼續前行';
  }

  function continueFromFeedback() {
    const run = global.TaixuState.getRun();
    if (!run || !run.pendingTransition) return;

    const tr = run.pendingTransition;
    run.pendingTransition = null;

    if (tr.forceEndId) {
      finishRun(tr.forceEndId);
      return;
    }

    if (tr.nextStepId && tr.nextStepId !== '__EVENT_COMPLETE__') {
      const ev = nodesData.events[run.currentEventId];
      const variant = getActiveVariantObj(run, ev);
      const targetIdx = variant.steps.findIndex((s) => s.id === tr.nextStepId);
      if (targetIdx !== -1) {
        run.currentStepIndex = targetIdx;
        currentStepHadMistake = false;
        disabledChoicesOnStep = new Set();
        global.TaixuState.saveRun();
        renderCurrentState();
        return;
      }
    }

    advanceStepOrEvent();
  }

  function advanceStepOrEvent() {
    const run = global.TaixuState.getRun();
    const ev = nodesData.events[run.currentEventId];
    const variant = getActiveVariantObj(run, ev);

    if (run.currentStepIndex + 1 < variant.steps.length) {
      run.currentStepIndex += 1;
      currentStepHadMistake = false;
      disabledChoicesOnStep = new Set();
      global.TaixuState.saveRun();
      renderCurrentState();
      return;
    }

    completeCurrentVariantOrEvent();
  }

  function completeCurrentVariantOrEvent() {
    const run = global.TaixuState.getRun();
    const ev = nodesData.events[run.currentEventId];
    const queue = run.resolvedVariants[ev.id] || [];

    if ((run.currentVariantIndex || 0) + 1 < queue.length) {
      run.currentVariantIndex += 1;
      run.currentStepIndex = 0;
      currentStepHadMistake = false;
      disabledChoicesOnStep = new Set();
      global.TaixuState.saveRun();
      renderCurrentState();
      return;
    }

    // Event finished
    if (run.completedEvents.indexOf(ev.id) === -1) {
      run.completedEvents.push(ev.id);
    }
    if (Array.isArray(ev.codexIds)) {
      global.TaixuState.unlockCodexIds(ev.codexIds);
    }
    run.currentEventId = null;
    run.currentStepIndex = 0;
    global.TaixuCodex.refreshCounters();

    if (run.mode === 'story') {
      global.TaixuState.saveRun();
      advanceStoryProgress();
    } else {
      run.currentEventIndex += 1;
      if (run.currentEventIndex < run.eventPlan.length) {
        beginEvent(run.eventPlan[run.currentEventIndex]);
      } else {
        finishRun();
      }
    }
  }

  function evaluateEnding(forcedId) {
    const run = global.TaixuState.getRun();
    if (forcedId) {
      return endingsData.find((e) => e.id === forcedId) || endingsData[0];
    }

    const total = Math.max(1, run.totalAnswered);
    const acc = run.correctFirstTry / total;
    const balanceDiff = Math.abs((run.yin || 50) - (run.yang || 50));

    if (run.failedRescueCount > 0 && run.guardPills <= 0) {
      return endingsData.find((e) => e.id === 'reincarnate') || endingsData[0];
    }
    if (run.failedRescueCount >= 2) {
      return endingsData.find((e) => e.id === 'qi_reversal') || endingsData[0];
    }
    if (run.crisisCount > 0 && run.rescuedCount >= run.crisisCount && run.failedRescueCount === 0) {
      return endingsData.find((e) => e.id === 'crisis_master') || endingsData[0];
    }
    if (run.riskScore >= 6) {
      return endingsData.find((e) => e.id === 'toxic_elder') || endingsData[0];
    }
    if (run.mode === 'story' && acc >= 0.9 && balanceDiff <= 18) {
      return endingsData.find((e) => e.id === 'shennong_heir') || endingsData[0];
    }
    if ((run.route === 'taiyin' || (run.yin - run.yang) >= 12) && acc >= 0.7) {
      return endingsData.find((e) => e.id === 'taiyin_grandmaster') || endingsData[0];
    }
    if (run.crisisCount === 0 && acc >= 0.8 && balanceDiff <= 22) {
      return endingsData.find((e) => e.id === 'flawless_sage') || endingsData[0];
    }
    if (acc >= 0.65) {
      return endingsData.find((e) => e.id === 'taiyin_grandmaster') || endingsData[0];
    }
    return endingsData.find((e) => e.id === 'toxic_elder') || endingsData[0];
  }

  function finishRun(forcedId) {
    const run = global.TaixuState.getRun();
    const ending = evaluateEnding(forcedId);
    global.TaixuState.unlockEnding(ending.id);
    global.TaixuCodex.refreshCounters();

    const summary = {
      ending,
      mode: run.mode,
      seed: run.seed,
      yin: run.yin,
      yang: run.yang,
      guardPills: run.guardPills,
      maxGuardPills: run.maxGuardPills,
      crisisCount: run.crisisCount,
      rescuedCount: run.rescuedCount,
      correctFirstTry: run.correctFirstTry,
      totalAnswered: run.totalAnswered,
      completedCount: run.completedEvents.length,
      wrongNotes: run.runWrongNotes || []
    };

    global.TaixuState.clearSavedRun();
    if (typeof onEndingCallback === 'function') {
      onEndingCallback(summary);
    }
  }

  function updateHud() {
    const run = global.TaixuState.getRun();
    if (!run) return;

    // Guard pills
    const pillsEl = document.getElementById('hud-guard-pills');
    if (pillsEl) {
      pillsEl.innerHTML = '';
      for (let i = 0; i < run.maxGuardPills; i++) {
        const orb = document.createElement('span');
        orb.className = `pill-orb ${i < run.guardPills ? 'active' : 'spent'}`;
        orb.title = i < run.guardPills ? '可用護心丹' : '已消耗';
        pillsEl.appendChild(orb);
      }
    }

    // Yin/Yang bar
    const totalYY = (run.yin || 50) + (run.yang || 50);
    const yinPct = Math.round(((run.yin || 50) / totalYY) * 100);
    const yangPct = 100 - yinPct;
    const barYin = document.getElementById('bar-yin');
    const barYang = document.getElementById('bar-yang');
    if (barYin) barYin.style.width = `${yinPct}%`;
    if (barYang) barYang.style.width = `${yangPct}%`;
    const nums = document.getElementById('hud-yinyang');
    if (nums) nums.textContent = `陰${run.yin} : 陽${run.yang}`;

    // Progress
    const totalEvents = run.eventPlan ? run.eventPlan.length : 1;
    const done = run.completedEvents ? run.completedEvents.length : 0;
    const progEl = document.getElementById('hud-progress');
    if (progEl) {
      const modeTag = run.mode === 'story' ? '章回篇' : '速行篇';
      progEl.textContent = `${modeTag}・${Math.min(done + 1, totalEvents)}/${totalEvents}`;
    }

    // Pouch items
    const pouchEl = document.getElementById('hud-pouch');
    if (pouchEl) {
      pouchEl.innerHTML = (run.pouchItems || [])
        .map((it) => `<span class="pouch-item" title="${escapeHtml(it.desc || '')}">${escapeHtml(it.name)}</span>`)
        .join('');
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  global.TaixuEngine = {
    init,
    startNewRun,
    resumeCurrentRun,
    continueFromFeedback,
    finishRun
  };
})(window);
