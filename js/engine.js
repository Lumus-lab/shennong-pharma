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
    setBundleData(bundle);
    onEndingCallback = endingCb;
  }

  function setBundleData(bundle) {
    nodesData = (bundle && bundle.nodes) || { events: {} };
    deckData = (bundle && bundle.deck) || {};
    codexData = (bundle && bundle.codex) || { entries: [], referenceTables: [] };
    endingsData = (bundle && bundle.endings) || [];
  }

  function getStoryChaptersForScope(scope) {
    const allChapters = (deckData.story && deckData.story.chapters) || [];
    if (scope === 'part1') {
      return allChapters.filter((ch) => (ch.volPart || 1) === 1);
    }
    if (scope === 'part2') {
      return allChapters.filter((ch) => ch.volPart === 2);
    }
    return allChapters.slice();
  }

  function startNewRun(modeOrOpts, routeArg, seedArg) {
    const opts =
      typeof modeOrOpts === 'object' && modeOrOpts !== null
        ? modeOrOpts
        : { mode: modeOrOpts, route: routeArg, seed: seedArg };

    const mode = opts.mode === 'story' ? 'story' : 'roguelike';
    const route = opts.route || 'all_mixed';
    const storyScope = opts.storyScope || 'full';
    const storyVariantMode = opts.storyVariantMode || 'core_only';
    const rogueVariantMode = opts.rogueVariantMode || 'core_only';
    const rogueLength = Number(opts.rogueLength) === 8 ? 8 : 6;
    const seed = String(opts.seed || 'TX-4072').trim();

    const rng = global.TaixuRNG.createMulberry32(seed);
    const resolvedVariants = {};
    let eventPlan = [];
    let hubState = null;

    if (mode === 'roguelike') {
      const rCfg = deckData.roguelike || {};
      const routeCfg = (rCfg.routes && rCfg.routes[route]) || Object.values(rCfg.routes || {})[0] || {};
      const isSchoolFocus = rogueVariantMode === 'school_exam' || rogueVariantMode === 'past_exam';
      const isNatFocus = rogueVariantMode === 'national_exam';
      const hasNationalExam = (id) => {
        const ev = nodesData.events[id];
        return Boolean(ev && Array.isArray(ev.variants) && ev.variants.some((v) => v.examSource === 'national_exam'));
      };
      const hasSchoolExam = (id) => {
        const ev = nodesData.events[id];
        return Boolean(
          ev &&
            Array.isArray(ev.variants) &&
            ev.variants.some((v) => v.variantType === 'past_exam' && v.examSource !== 'national_exam')
        );
      };
      const hasFocusedExam = (id) => (isNatFocus ? hasNationalExam(id) : isSchoolFocus ? hasSchoolExam(id) : false);

      const pPoolAll = (routeCfg.prologuePool || rCfg.prologuePool || ['E01', 'E02']).filter((id) =>
        Boolean(nodesData.events[id])
      );
      const midPoolAll = (routeCfg.pool || []).filter((id) => Boolean(nodesData.events[id]));
      const midPoolFocus = isNatFocus || isSchoolFocus ? midPoolAll.filter(hasFocusedExam) : [];
      const pPoolFocus = isNatFocus || isSchoolFocus ? pPoolAll.filter(hasFocusedExam) : [];
      const prologueCandidates =
        pPoolFocus.length > 0
          ? pPoolFocus
          : (isNatFocus || isSchoolFocus) && midPoolFocus.length > 0
            ? midPoolFocus
            : pPoolAll;
      const prologueId = rng.pick(prologueCandidates) || Object.keys(nodesData.events)[0];

      const midWeights = routeCfg.weights || {};
      const midCount = rogueLength === 8 ? 6 : 4;
      const midPoolFiltered = midPoolAll.filter((id) => id !== prologueId);
      const midFocusFiltered = midPoolFocus.filter((id) => id !== prologueId);
      const midSource = midFocusFiltered.length >= midCount ? midFocusFiltered : midPoolFiltered;
      const drawnMid = rng.weightedSample(
        midSource,
        midCount,
        (id) => (midWeights[id] || 1) * ((isNatFocus || isSchoolFocus) && hasFocusedExam(id) ? 5 : 1)
      );

      const bossCandidatesAll = (routeCfg.bossPool || rCfg.bossPool || ['E15', 'E16', 'E17', 'E18']).filter((id) =>
        Boolean(nodesData.events[id])
      );
      const bossCandidatesFocus = isNatFocus || isSchoolFocus ? bossCandidatesAll.filter(hasFocusedExam) : [];
      const bossCandidates = bossCandidatesFocus.length > 0 ? bossCandidatesFocus : bossCandidatesAll;
      const bossId =
        rng.weightedSample(bossCandidates, 1, (id) => midWeights[id] || 1)[0] ||
        bossCandidates[0];

      eventPlan = [prologueId].concat(drawnMid).concat(bossId ? [bossId] : []).filter(Boolean);

      eventPlan.forEach((eid) => {
        const ev = nodesData.events[eid];
        if (ev && ev.variants && ev.variants.length > 0) {
          const coreVariants = ev.variants.filter((v) => v.variantType !== 'past_exam');
          const schoolVariants = ev.variants.filter((v) => v.variantType === 'past_exam' && v.examSource !== 'national_exam');
          const neVariants = ev.variants.filter((v) => v.examSource === 'national_exam');
          const allExamVariants = schoolVariants.concat(neVariants);
          let picked = null;
          if (rogueVariantMode === 'core_only' && coreVariants.length > 0) {
            picked = rng.pick(coreVariants);
          } else if (isNatFocus && neVariants.length > 0) {
            picked = rng.pick(neVariants);
          } else if (isSchoolFocus && schoolVariants.length > 0) {
            picked = rng.pick(schoolVariants);
          } else if ((isNatFocus || isSchoolFocus) && coreVariants.length > 0) {
            picked = rng.pick(coreVariants);
          } else if (coreVariants.length > 0 && allExamVariants.length > 0) {
            picked = rng.next() < 0.5 ? rng.pick(allExamVariants) : rng.pick(coreVariants);
          } else {
            picked = rng.pick(ev.variants);
          }
          resolvedVariants[eid] = [picked.variantId];
        }
      });
    } else {
      const chapters = getStoryChaptersForScope(storyScope);
      chapters.forEach((ch) => {
        eventPlan = eventPlan.concat((ch.events || []).filter((id) => Boolean(nodesData.events[id])));
      });

      eventPlan.forEach((eid) => {
        const ev = nodesData.events[eid];
        if (!ev || !ev.variants || ev.variants.length === 0) return;
        const coreVariants = ev.variants.filter((v) => v.variantType !== 'past_exam');
        const schoolVariants = ev.variants.filter((v) => v.variantType === 'past_exam' && v.examSource !== 'national_exam');
        const neVariants = ev.variants.filter((v) => v.examSource === 'national_exam');
        const allExamVariants = schoolVariants.concat(neVariants);

        let coreQueue = [];
        if (coreVariants.length > 0) {
          const coreIds = coreVariants.map((v) => v.variantId);
          coreQueue = ev.storyMode === 'all' ? rng.shuffle(coreIds) : [rng.pick(coreIds)];
        }

        if (storyVariantMode === 'core_only') {
          resolvedVariants[eid] = coreQueue.length > 0 ? coreQueue : [ev.variants[0].variantId];
        } else if (storyVariantMode === 'school_compact' || storyVariantMode === 'compact') {
          const sampledSchool = schoolVariants.length > 0 ? rng.pick(schoolVariants) : null;
          resolvedVariants[eid] = sampledSchool ? coreQueue.concat([sampledSchool.variantId]) : coreQueue;
        } else if (storyVariantMode === 'school_all') {
          const schoolIds = rng.shuffle(schoolVariants.map((v) => v.variantId));
          resolvedVariants[eid] = coreQueue.concat(schoolIds);
        } else if (storyVariantMode === 'national_only') {
          const neIds = rng.shuffle(neVariants.map((v) => v.variantId));
          resolvedVariants[eid] = coreQueue.concat(neIds);
        } else if (storyVariantMode === 'all') {
          const allIds = rng.shuffle(allExamVariants.map((v) => v.variantId));
          resolvedVariants[eid] = coreQueue.concat(allIds);
        } else {
          resolvedVariants[eid] = coreQueue.length > 0 ? coreQueue : [ev.variants[0].variantId];
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
      storyScope,
      storyVariantMode,
      rogueVariantMode,
      rogueLength,
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
    const chapters = getStoryChaptersForScope(run.storyScope || 'full');
    const doneSet = new Set(run.completedEvents || []);

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const remaining = (ch.events || []).filter((id) => !doneSet.has(id) && Boolean(nodesData.events[id]));
      if (remaining.length === 0) continue;

      const prevChIdx = run.hubState ? run.hubState.chapterIndex : 0;
      run.hubState.chapterIndex = i;

      // 在全四卷長篇跨入第三卷或第四卷時，自動生成中繼書籤以防迷失或想分段重溫
      if ((run.storyScope || 'full') === 'full' && i > prevChIdx && (ch.id === 'ch6' || ch.id === 'ch9')) {
        global.TaixuState.saveBookmarkSnapshot(ch.id === 'ch6' ? '進入第三卷・玄冥篇起點' : '進入第四卷・太陽篇起點');
      }

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
    hubDesc.innerHTML = formatInline(ch.hubDescription || '請自由選擇接下來欲前往的試煉殿堂或診間。先取得「隨身丹囊」道具，將為後續關卡提供靈應線索！');

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
          <span>${escapeHtml(eid)}・${formatInline(ev.location)}</span>
          <span class="hub-card-status">${isDone ? '已完成 ✓' : '前往試煉 →'}</span>
        </div>
        <h3>${formatInline(ev.title)}</h3>
        <p>${formatInline(ev.hubSummary || ev.subtitle || '')}</p>
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

    document.getElementById('crumb-chapter').innerHTML = formatInline(ev.chapterTitle || `第${ev.chapter}章`);
    document.getElementById('crumb-location').innerHTML = formatInline(`${ev.location}｜${ev.title}`);

    const variantChip = document.getElementById('variant-chip');
    if (variantChip) {
      variantChip.hidden = false;
      const isNat = variant.examSource === 'national_exam';
      const isSchool = variant.variantType === 'past_exam' && !isNat;
      variantChip.textContent = variant.examTag
        ? isNat
          ? `國考真題｜${variant.examTag}`
          : `校內考古｜${variant.examTag}`
        : `原著劇情｜變體 ${variant.variantId}`;
      variantChip.classList.toggle('is-past-exam', isSchool);
      variantChip.classList.toggle('is-national-exam', isNat);
    }

    // Check active crisis
    const crisisBanner = document.getElementById('crisis-banner');
    if (run.activeCrisis) {
      crisisBanner.hidden = false;
      document.getElementById('crisis-title-text').innerHTML = formatInline(run.activeCrisis.title);
      document.getElementById('crisis-mech-text').innerHTML = formatInlineMarkup(run.activeCrisis.mechanism);
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
      pouchTextEl.innerHTML = formatInline(matchedHint.text);
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
      renderChoices(step.choices || [], true, run.pendingTransition.pickedChoiceId || null);
    } else {
      fbPanel.hidden = true;
      const subEl = document.getElementById('feedback-subnote');
      const optEl = document.getElementById('feedback-options');
      if (subEl) { subEl.hidden = true; subEl.innerHTML = ''; }
      if (optEl) { optEl.hidden = true; optEl.innerHTML = ''; }
      renderChoices(step.choices || [], false, null);
    }
  }

  function renderSpeaker(speakerKey, name, role) {
    const avatar = document.getElementById('speaker-avatar');
    if (avatar) {
      avatar.innerHTML = SPEAKER_AVATARS[speakerKey] || SPEAKER_AVATARS.narrator;
    }
    document.getElementById('speaker-name').innerHTML = formatInline(name);
    document.getElementById('speaker-role').innerHTML = formatInline(role);
  }

  function renderRichText(container, text) {
    if (!container) return;
    const paragraphs = String(text || '').split('\n');
    container.innerHTML = paragraphs
      .filter((p) => p.trim().length > 0)
      .map((p) => `<p>${formatInlineMarkup(p)}</p>`)
      .join('');
  }

  function formatInline(str) {
    return global.TaixuFormat ? global.TaixuFormat.formatClinicalInline(str) : escapeHtml(str);
  }

  function formatInlineMarkup(str) {
    if (global.TaixuFormat) {
      return global.TaixuFormat.formatClinicalMarkdown(str);
    }
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
            ${formatInline((al.betaMethyl ? '✓ ' : '') + '導入 β-甲基 (-CH₃)')}
          </button>
          <button type="button" class="lab-toggle ${al.carbamoyl ? 'active' : ''}" id="btn-lab-carb">
            ${formatInline((al.carbamoyl ? '✓ ' : '') + '換入 Carbamoyl 基 (-OCONH₂)')}
          </button>
        </div>
        <div class="lab-readout">
          <div class="lab-kv"><span>煉成產物</span><strong>${formatInline(esterName)}</strong></div>
          <div class="lab-kv"><span>對 AChE 敏感度</span><strong>${formatInline(acheSens)}</strong></div>
          <div class="lab-kv"><span>菸鹼 (N) 活性</span><strong>${formatInline(nAct)}</strong></div>
          <div class="lab-kv"><span>蕈毒鹼 (M) 與用途</span><strong>${formatInline(mAct)}｜${formatInline(clinical)}</strong></div>
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
        <h3 class="lab-title">${formatInline('Furchgott 離體血管試驗台（切換內皮狀態再注 ACh 3×10⁻⁷ M）')}</h3>
        <div class="lab-controls">
          <button type="button" class="lab-toggle ${intact ? 'active' : ''}" id="btn-endo-unrubbed">完整未磨除內皮 (Unrubbed)</button>
          <button type="button" class="lab-toggle ${!intact ? 'active' : ''}" id="btn-endo-rubbed">已磨除內皮 (Rubbed)</button>
        </div>
        <div class="lab-readout">
          <div class="lab-kv"><span>主要結合位置</span><strong>${formatInline(intact ? '內皮細胞 M₃ → eNOS' : '平滑肌細胞 M₃ (直接 Gq→IP₃→↑Ca²⁺)')}</strong></div>
          <div class="lab-kv"><span>血管反應</span><strong>${formatInline(intact ? '釋放 EDRF (NO) → 血管舒張' : '失去 NO 緩衝 → 反轉為血管收縮')}</strong></div>
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
              <code>${escapeHtml(item.term)}</code> ${revealed[item.term] ? '→ ' + formatInline(item.ans) : '（點擊破譯）'}
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
    } else if (step.widget === 'nmj_phase_lab') {
      const lab = run.nmjLab || { blocker: 'sch_phase1', action: 'baseline' };
      run.nmjLab = lab;

      const computeNmjState = (curLab) => {
        const blockerMeta = {
          rocuronium: {
            title: 'Rocuronium（非去極化競爭型）',
            onset: '無肌束顫動（直接弛緩麻痺）',
            tof: '出現衰減 (Fade) ＋ 有強直後促進',
            tofPattern: 'fade',
            tofNote: '非去極化：TOF T4/T1 明顯衰減 (Fade)'
          },
          sch_phase1: {
            title: 'Succinylcholine Phase I（去極化阻斷）',
            onset: '有明顯肌束顫動 (Fasciculations)',
            tof: '張力維持、振幅等比縮小（無衰減），無強直後促進',
            tofPattern: 'depolarized',
            tofNote: 'Phase I：等比縮小（無 Fade）'
          },
          sch_phase2: {
            title: 'Succinylcholine Phase II（去敏感化阻斷）',
            onset: '膜已再極化，但 N_M 受體去敏感化',
            tof: '轉為漸進衰減 (Fade) ＋ 恢復慢 (>20 min)',
            tofPattern: 'fade',
            tofNote: 'Phase II：類非去極化衰減 (Fade)'
          }
        }[curLab.blocker] || {};

        let actionResult = '觀察單獨阻斷下之 TOF 波形與初始肌象變化。';
        let appliedTof = blockerMeta.tofPattern;
        let appliedTofNote = blockerMeta.tofNote;
        let appliedNmj = 18;
        let appliedNmjLabel = 'N_M 阻斷鬆弛';

        if (curLab.action === 'neostigmine') {
          if (curLab.blocker === 'rocuronium') {
            actionResult = '拮抗／逆轉阻斷！ACh 大增把競爭型的 Rocuronium 擠出 N_M 受體。';
            appliedTof = 'normal';
            appliedTofNote = 'TOF 逐步回升至 4/4（逆轉成功）';
            appliedNmj = 48;
            appliedNmjLabel = '肌力恢復中';
          } else if (curLab.blocker === 'sch_phase1') {
            actionResult = '【危險惡化】增強去極化阻斷 (Augmented)！Neostigmine 增加 ACh 又抑假性膽鹼酯酶，讓 Na⁺ 通道更難恢復！';
            appliedTof = 'deep';
            appliedTofNote = 'Phase I + Neostigmine → 阻斷加深至 0/4';
            appliedNmj = 8;
            appliedNmjLabel = '深度加重麻痺！';
          } else {
            actionResult = '可部份逆轉 (Antagonistic)！Phase II 終板膜已再極化，表現接近非去極化，提高 ACh 有助喚醒受體。';
            appliedTof = 'normal';
            appliedTofNote = 'Phase II 獲部分喚醒';
            appliedNmj = 42;
            appliedNmjLabel = '部分逆轉恢復';
          }
        } else if (curLab.action === 'tubocurarine') {
          if (curLab.blocker === 'rocuronium') {
            actionResult = '加成阻斷 (Additive)！兩者皆為非去極化競爭型，且 Tubocurarine 兼促組織胺釋放易降壓。';
            appliedTof = 'deep';
            appliedTofNote = '雙重非去極化加成深度麻痺';
            appliedNmj = 8;
            appliedNmjLabel = '雙重非去極加成阻斷';
          } else if (curLab.blocker === 'sch_phase1') {
            actionResult = '拮抗減輕去極化 (Antagonistic)！少量非去極化 precurarization 可阻擋 SCh 過度去極化，減輕肌束顫動。';
            appliedTof = 'depolarized';
            appliedTofNote = 'Precurarization 減輕顫動';
            appliedNmj = 30;
            appliedNmjLabel = '抗去極減輕顫動';
          } else {
            actionResult = '增強阻斷 (Augmented)！在去敏感期加入非去極化劑會讓神經傳導進一步失靈。';
            appliedTof = 'deep';
            appliedTofNote = 'Phase II + 非去極化深度加重';
            appliedNmj = 8;
            appliedNmjLabel = '深度加重阻斷';
          }
        } else if (curLab.action === 'sugammadex') {
          if (curLab.blocker === 'rocuronium') {
            actionResult = '★ 神效逆轉（1.5–3 分鐘）！Sugammadex (16 mg/kg) 1:1 精準包覆類固醇骨架 Rocuronium 並排入尿液，即使深度阻斷也能瞬間解鎖（須衛教服口服避孕藥者 7 天採替代避孕）！';
            appliedTof = 'normal';
            appliedTofNote = 'TOF 100%（γ-環糊精瞬時螯合逆轉）';
            appliedNmj = 52;
            appliedNmjLabel = '瞬間完全恢復';
          } else {
            actionResult = '【完全無效】Sugammadex 僅能包覆「類固醇類」NMB（Rocuronium / Vecuronium），對雙乙醯膽鹼鏈狀結構的 Succinylcholine 完全抓不住！';
            appliedNmjLabel = '螯合無效（非類固醇 NMB）';
          }
        }

        return { blockerMeta, actionResult, appliedTof, appliedTofNote, appliedNmj, appliedNmjLabel };
      };

      const { blockerMeta, actionResult, appliedTof, appliedTofNote } = computeNmjState(lab);

      const tofHeights = appliedTof === 'normal' ? [24, 24, 24, 24]
        : appliedTof === 'depolarized' ? [11, 11, 11, 11]
        : appliedTof === 'deep' ? [2, 1, 1, 1]
        : [22, 15, 9, 4];

      labEl.innerHTML = `
        <h3 class="lab-title">NMJ 陰陽雙相鎖與四連刺激 (TOF) 逆轉模擬台</h3>
        <div class="lab-controls">
          <button type="button" class="lab-toggle ${lab.blocker === 'rocuronium' ? 'active' : ''}" data-nmj-b="rocuronium">Rocuronium（非去極化）</button>
          <button type="button" class="lab-toggle ${lab.blocker === 'sch_phase1' ? 'active' : ''}" data-nmj-b="sch_phase1">SCh Phase I（去極化）</button>
          <button type="button" class="lab-toggle ${lab.blocker === 'sch_phase2' ? 'active' : ''}" data-nmj-b="sch_phase2">SCh Phase II（去敏感）</button>
        </div>
        <div class="lab-controls">
          <button type="button" class="lab-toggle ${lab.action === 'baseline' ? 'active' : ''}" data-nmj-a="baseline">單獨觀察基態</button>
          <button type="button" class="lab-toggle ${lab.action === 'neostigmine' ? 'active' : ''}" data-nmj-a="neostigmine">+ Neostigmine (AChEI)</button>
          <button type="button" class="lab-toggle ${lab.action === 'tubocurarine' ? 'active' : ''}" data-nmj-a="tubocurarine">+ Tubocurarine</button>
          <button type="button" class="lab-toggle ${lab.action === 'sugammadex' ? 'active' : ''}" data-nmj-a="sugammadex">+ Sugammadex 16mg/kg</button>
        </div>
        <div class="lab-inline-tof">
          <svg viewBox="0 0 96 34" width="84" height="30" aria-hidden="true">
            <line x1="2" y1="30" x2="94" y2="30" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
            ${tofHeights.map((h, i) => `<rect x="${8 + i * 22}" y="${30 - h}" width="14" height="${h}" rx="2" fill="hsl(166,68%,54%)"/>`).join('')}
          </svg>
          <span><strong>${formatInline(appliedTofNote)}</strong></span>
        </div>
        <div class="lab-readout">
          <div class="lab-kv"><span>初始骨骼肌反應</span><strong>${formatInline(blockerMeta.onset)}</strong></div>
          <div class="lab-kv"><span>強直／TOF 特徵</span><strong>${formatInline(blockerMeta.tof)}</strong></div>
          <div class="lab-kv"><span>併用介入實測結論</span><strong>${formatInline(actionResult)}</strong></div>
        </div>
      `;

      const syncNmjVitals = (curLab) => {
        const st = computeNmjState(curLab);
        global.TaixuState.updateVitals({
          nmj: st.appliedNmj,
          nmjLabel: st.appliedNmjLabel,
          tofPattern: st.appliedTof,
          tofNote: st.appliedTofNote,
          badges: curLab.action === 'neostigmine' && curLab.blocker === 'sch_phase1'
            ? ['去極化阻斷惡化']
            : curLab.action === 'sugammadex' && curLab.blocker === 'rocuronium'
              ? ['Sugammadex 瞬時螯合']
              : ['TOF 監測中']
        });
        global.TaixuPulseMonitor.update(run.vitals);
      };

      labEl.querySelectorAll('[data-nmj-b]').forEach((btn) => {
        btn.addEventListener('click', () => {
          lab.blocker = btn.getAttribute('data-nmj-b');
          lab.action = 'baseline';
          syncNmjVitals(lab);
          renderInteractiveLab(step, run);
        });
      });
      labEl.querySelectorAll('[data-nmj-a]').forEach((btn) => {
        btn.addEventListener('click', () => {
          lab.action = btn.getAttribute('data-nmj-a');
          syncNmjVitals(lab);
          renderInteractiveLab(step, run);
        });
      });
    } else if (step.widget === 'tyramine_table_lab') {
      const meal = run.tyramineMeal || { selected: ['pickled_herring', 'aged_cheese'] };
      run.tyramineMeal = meal;
      const foods = [
        { id: 'pickled_herring', name: '煙燻／醃漬鯡魚', mg: '0–198 mg (最高)', mid: 95, cls: 'danger', note: '持續高危險：魚肉蛋白發酵含極高酪胺。' },
        { id: 'aged_cheese', name: '熟成起司 (Cheddar)', mg: '0–130 mg', mid: 65, cls: 'danger', note: '持續高危險：「起司效應」主因。' },
        { id: 'fermented_sausage', name: '發酵香腸 (Salami)', mg: '0–74 mg', mid: 38, cls: 'danger', note: '持續高危險：風乾發酵累積大量酪胺。' },
        { id: 'yeast_extract', name: '濃縮啤酒酵母補充品', mg: '2–68 mg', mid: 35, cls: 'danger', note: '持續高危險：服不可逆 MAOI 絕對禁忌。' },
        { id: 'beer', name: '未過濾生啤酒', mg: '4–45 mg', mid: 20, cls: 'warn', note: '中度風險：部份精釀生啤酪胺偏高。' },
        { id: 'chicken_liver', name: '雞肝（視新鮮度）', mg: '0–9 mg', mid: 5, cls: 'warn', note: '低至中度風險：隔夜未冷藏含量劇增。' },
        { id: 'red_wine', name: '適量紅酒', mg: '0–3 mg', mid: 2, cls: 'safe', note: '低風險：一般適量含酪胺極少。' },
        { id: 'fava_beans', name: '蠶豆 (Broad/Fava)', mg: '酪胺極微 (L-DOPA!)', mid: 0, cls: 'warn', note: '⚠️ 含天然多巴胺前驅物 L-DOPA，一樣致命升壓！' },
        { id: 'chocolate', name: '大量巧克力', mg: '酪胺極微 (PEA!)', mid: 0, cls: 'warn', note: '⚠️ 含苯乙胺 (Phenylethylamine)，大量仍易促釋 NE！' }
      ];
      const selSet = new Set(meal.selected || []);
      let totalMg = 0;
      const specialFlags = [];
      foods.forEach((f) => {
        if (selSet.has(f.id)) {
          totalMg += f.mid;
          if (f.id === 'fava_beans') specialFlags.push('L-DOPA 前驅物風險');
          if (f.id === 'chocolate') specialFlags.push('苯乙胺 PEA 促釋風險');
        }
      });

      const isCrisis = totalMg >= 25 || selSet.has('fava_beans');
      const isBorder = !isCrisis && (totalMg >= 10 || selSet.has('chocolate'));
      const verdict = isCrisis
        ? `【致命高血壓危象】推估酪胺 ${totalMg} mg（>20–50 mg 即爆發）${specialFlags.length ? '＋ ' + specialFlags.join('、') : ''}！避開首渡 MAO 後經 NET 進入末梢→轉化章魚胺/置換囊泡大量 NE→極須 Phentolamine 急救！`
        : isBorder
          ? `【中度警示】預估酪胺 ${totalMg} mg${specialFlags.length ? '＋ ' + specialFlags.join('、') : ''}；若雞肝不新鮮或過量仍可能升壓。`
          : `【安全飲食】酪胺負荷僅 ${totalMg} mg，無特別胺類前驅物負荷，服不可逆 MAOI 下脈壓平穩。`;

      labEl.innerHTML = `
        <h3 class="lab-title">不可逆 MAOI「起司效應」餐盤推演台（點擊加減食物，觀察 Tyramine 負荷）</h3>
        <div class="lab-food-grid">
          ${foods
            .map(
              (f) => `
            <button type="button" class="lab-food-btn ${f.cls === 'safe' ? 'safe' : ''} ${selSet.has(f.id) ? 'active' : ''}" data-food="${f.id}">
              <span>${selSet.has(f.id) ? '✓ ' : ''}${formatInline(f.name)}</span>
              <small>${formatInline(f.mg)}</small>
            </button>`
            )
            .join('')}
        </div>
        <div class="lab-readout">
          <div class="lab-kv"><span>推估餐食負荷</span><strong>~${totalMg} mg Tyramine${specialFlags.length ? ' + 特規胺' : ''}</strong></div>
          <div class="lab-kv"><span>預估血壓／脈象</span><strong>${isCrisis ? '214/126 mmHg（嚴重頭痛・血管炸裂）' : isBorder ? '148/92 mmHg（輕度升壓）' : '118/76 mmHg（安全平穩）'}</strong></div>
        </div>
        <div class="lab-note-box">${formatInline(verdict)}</div>
      `;

      labEl.querySelectorAll('[data-food]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-food');
          if (selSet.has(id)) selSet.delete(id);
          else selSet.add(id);
          meal.selected = Array.from(selSet);
          let sum = 0;
          foods.forEach((f) => {
            if (selSet.has(f.id)) sum += f.mid;
          });
          const danger = sum >= 25 || selSet.has('fava_beans');
          global.TaixuState.updateVitals({
            hr: danger ? 54 : sum >= 10 ? 78 : 74,
            sbp: danger ? 214 : sum >= 10 ? 148 : 118,
            dbp: danger ? 126 : sum >= 10 ? 92 : 76,
            rhythmText: danger ? '酪胺暴走高血壓＋反射性心搏過緩' : '竇性節律',
            badges: danger ? ['起司效應高血壓危機'] : []
          });
          global.TaixuPulseMonitor.update(run.vitals);
          renderInteractiveLab(step, run);
        });
      });
    } else if (step.widget === 'catechol_sar_lab') {
      const sar = run.catecholSar || { rGroup: 'H', removeRingOh: false, addAlphaMethyl: false };
      run.catecholSar = sar;

      const rLabels = { H: 'R = -H (極小)', CH3: 'R = -CH₃ (甲基)', ISO: 'R = -CH(CH₃)₂ (異丙基)' };
      let baseName = sar.rGroup === 'H' ? 'Norepinephrine (α₁,α₂,β₁；極少 β₂)' : sar.rGroup === 'CH3' ? 'Epinephrine (α₁,α₂,β₁,β₂ 全致效)' : 'Isoproterenol (純 β₁,β₂；無 α 作用)';
      if (sar.removeRingOh && !sar.addAlphaMethyl) {
        baseName = sar.rGroup === 'CH3' ? '類似 Phenylephrine 單羥化改造（失 β 傾 α₁ 且抗 COMT）' : '去鄰二酚羥基非兒茶酚胺（口服可用＋進腦）';
      } else if (sar.removeRingOh && sar.addAlphaMethyl) {
        baseName = sar.rGroup === 'H' ? 'Amphetamine 骨架（高脂溶穿 BBB ＋ 同時抗 COMT 與 MAO）' : sar.rGroup === 'CH3' ? 'Ephedrine / Methamphetamine 骨架（長效進腦）' : '超長效 β₂/非兒茶酚擬交感胺';
      }

      const betaAff = sar.rGroup === 'H' ? '較弱（β₁ 可、β₂ 幾近無）' : sar.rGroup === 'CH3' ? '強（β₁ ≈ β₂）' : '最強！（異丙基大幅強化 β，幾無 α）';
      const comtText = sar.removeRingOh ? '完全抵抗 COMT（缺鄰二酚 -OH；極性↓ 可口服進 BBB）' : '快速被 COMT 甲基化失活（口服生體可用率極差）';
      const maoText = sar.addAlphaMethyl ? '阻擋 MAO 氧化去胺！（半衰期大幅延長，多作長效／中樞藥）' : '易被腸道與肝臟 MAO 分解（短效）';

      labEl.innerHTML = `
        <h3 class="lab-title">兒茶酚胺構效關係 (SAR) 煉丹改造台（切換 R 基與去酚/α-甲基）</h3>
        <div class="lab-controls">
          ${Object.keys(rLabels)
            .map(
              (rk) => `<button type="button" class="lab-toggle ${sar.rGroup === rk ? 'active' : ''}" data-sar-r="${rk}">${formatInline(rLabels[rk])}</button>`
            )
            .join('')}
        </div>
        <div class="lab-controls">
          <button type="button" class="lab-toggle ${sar.removeRingOh ? 'active' : ''}" id="btn-sar-ringoh">${sar.removeRingOh ? '✓ ' : ''}去除苯環 3,4-鄰二酚羥基 (-OH)</button>
          <button type="button" class="lab-toggle ${sar.addAlphaMethyl ? 'active' : ''}" id="btn-sar-alphame">${formatInline((sar.addAlphaMethyl ? '✓ ' : '') + 'α-碳導入甲基 (-CH₃)')}</button>
        </div>
        <div class="lab-readout">
          <div class="lab-kv"><span>對應藥理原型</span><strong>${formatInline(baseName)}</strong></div>
          <div class="lab-kv"><span>β 受體親和力變化</span><strong>${formatInline(betaAff)}</strong></div>
          <div class="lab-kv"><span>COMT 代謝與 BBB 穿透</span><strong>${formatInline(comtText)}</strong></div>
          <div class="lab-kv"><span>MAO 抗性與藥效時間</span><strong>${formatInline(maoText)}</strong></div>
        </div>
      `;
      labEl.querySelectorAll('[data-sar-r]').forEach((btn) => {
        btn.addEventListener('click', () => {
          sar.rGroup = btn.getAttribute('data-sar-r');
          global.TaixuState.saveRun();
          renderInteractiveLab(step, run);
        });
      });
      labEl.querySelector('#btn-sar-ringoh').addEventListener('click', () => {
        sar.removeRingOh = !sar.removeRingOh;
        global.TaixuState.saveRun();
        renderInteractiveLab(step, run);
      });
      labEl.querySelector('#btn-sar-alphame').addEventListener('click', () => {
        sar.addAlphaMethyl = !sar.addAlphaMethyl;
        global.TaixuState.saveRun();
        renderInteractiveLab(step, run);
      });
    } else if (step.widget === 'sympatho_hemo') {
      const sl = run.sympathoLab || { drug: 'ne', alphaBlocked: false };
      run.sympathoLab = sl;

      const profiles = {
        pe: {
          title: 'Phenylephrine（純 α₁）',
          normal: { tpr: '↑↑↑', sbpText: '↑↑', dbpText: '↑↑', mapText: '↑↑', pp: '0（平行上升）', hrText: '↓↓ 迷走感壓反射勝出', vitals: { hr: 50, sbp: 170, dbp: 108, pupilMm: 6.0, airway: 100, rhythmText: 'α₁ 升壓 → 強烈迷走感壓反射心搏過緩', badges: ['感壓反射心搏過緩'] } },
          blocked: { tpr: '0（α₁ 被封鎖）', sbpText: '0', dbpText: '0', mapText: '0', pp: '0', hrText: '無反射波動', vitals: { hr: 76, sbp: 112, dbp: 72, pupilMm: 3.5, airway: 100, rhythmText: 'α 阻斷下純 α₁ 致效劑無處施力', badges: ['α₁ 路徑已被阻斷'] } }
        },
        ne: {
          title: 'Norepinephrine（α₁, α₂, β₁；無 β₂）',
          normal: { tpr: '↑↑↑（無 β₂ 緩衝）', sbpText: '↑↑', dbpText: '↑↑', mapText: '↑↑', pp: '↑ 略寬', hrText: '↓↓ 感壓反射蓋過直接 β₁！', vitals: { hr: 54, sbp: 174, dbp: 108, pupilMm: 5.5, airway: 100, rhythmText: '靜注 NE：SBP/DBP↑↑，感壓反射令脈搏反降！', badges: ['NE 反射性心搏過緩'] } },
          blocked: { tpr: '0 / 微降', sbpText: '↑（僅餘 β₁）', dbpText: '0', mapText: '微 ↑', pp: '略 ↑', hrText: '↑ 直接 β₁ 顯現（不逆轉降壓因無 β₂！）', vitals: { hr: 96, sbp: 126, dbp: 74, pupilMm: 3.5, airway: 102, rhythmText: 'α 阻斷下 NE 僅現微弱 β₁，無腎上腺素反轉', badges: ['NE 無明顯 β₂ 故不反轉'] } }
        },
        epi: {
          title: 'Epinephrine（α₁, α₂, β₁, β₂ 全致效）',
          normal: { tpr: '↓（輸注劑量 β₂ 舒張骨骼肌勝出）', sbpText: '↑↑', dbpText: '↓', mapText: '↑ 輕升', pp: '↑↑ 大幅變寬！', hrText: '↑ 直接 β₁ 加速＋弱反射', vitals: { hr: 106, sbp: 158, dbp: 62, pupilMm: 5.8, airway: 126, rhythmText: '低中劑量 Epi：SBP↑↑、DBP↓、脈壓大寬', badges: ['β₂ 舒張使 DBP 下降'] } },
          blocked: { tpr: '↓↓（僅餘 β₂）', sbpText: '↓↓ 反轉下降！', dbpText: '↓↓ 劇降！', mapText: '↓↓ 腎上腺素反轉！', pp: '微寬後低灌流', hrText: '↑↑ β₁＋交感雙重加速', vitals: { hr: 124, sbp: 86, dbp: 44, pupilMm: 3.5, airway: 128, rhythmText: '★ 腎上腺素反轉：α₁ 被封僅餘 β₂ 致血壓遽降！', badges: ['腎上腺素反轉危機'] } }
        },
        iso: {
          title: 'Isoproterenol（純 β₁, β₂；無 α）',
          normal: { tpr: '↓↓（純 β₂ 全身骨骼肌擴張）', sbpText: '0 / 微波動', dbpText: '↓↓', mapText: '↓（因 DBP 大降）', pp: '↑↑↑ 極度變寬', hrText: '↑↑↑ 直接 β₁ ＋ 低壓交感反射', vitals: { hr: 132, sbp: 120, dbp: 48, pupilMm: 3.6, airway: 128, rhythmText: '純 β 作用：TPR↓↓、DBP↓↓、HR↑↑↑', badges: ['β₁/β₂ 純 β 脈象'] } },
          blocked: { tpr: '↓↓（不受 α 阻斷影響）', sbpText: '0 / 微降', dbpText: '↓↓', mapText: '↓', pp: '↑↑↑', hrText: '↑↑↑ 同樣劇烈加速', vitals: { hr: 132, sbp: 118, dbp: 48, pupilMm: 3.6, airway: 128, rhythmText: 'Isoproterenol 本無 α 作用，α 阻斷不改變波形', badges: ['β₁/β₂ 不受 α 阻斷影響'] } }
        }
      };

      const prof = profiles[sl.drug] || profiles.ne;
      const st = sl.alphaBlocked ? prof.blocked : prof.normal;

      labEl.innerHTML = `
        <h3 class="lab-title">四大擬交感胺 IV 血流動力學＆「腎上腺素反轉」模擬器（同步驅動右側 SVG 脈象儀）</h3>
        <div class="lab-controls">
          <button type="button" class="lab-toggle ${sl.drug === 'pe' ? 'active' : ''}" data-symp="pe">${formatInline('Phenylephrine (α₁)')}</button>
          <button type="button" class="lab-toggle ${sl.drug === 'ne' ? 'active' : ''}" data-symp="ne">${formatInline('Norepinephrine (α+β₁)')}</button>
          <button type="button" class="lab-toggle ${sl.drug === 'epi' ? 'active' : ''}" data-symp="epi">${formatInline('Epinephrine (α+β₁+β₂)')}</button>
          <button type="button" class="lab-toggle ${sl.drug === 'iso' ? 'active' : ''}" data-symp="iso">${formatInline('Isoproterenol (β₁+β₂)')}</button>
        </div>
        <div class="lab-controls">
          <button type="button" class="lab-toggle ${sl.alphaBlocked ? 'active' : ''}" id="btn-symp-ablock">
            ${sl.alphaBlocked ? '✓ ' : ''}預先投入 α 阻斷劑（如 Phentolamine）觀察「反轉效應」
          </button>
        </div>
        <div class="lab-readout">
          <div class="lab-kv"><span>總周邊阻力 (TPR)</span><strong>${formatInline(st.tpr)}</strong></div>
          <div class="lab-kv"><span>收縮壓 / 舒張壓</span><strong>SBP ${formatInline(st.sbpText)} / DBP ${formatInline(st.dbpText)}</strong></div>
          <div class="lab-kv"><span>平均動脈壓 / 脈壓</span><strong>MAP ${formatInline(st.mapText)}｜PP ${formatInline(st.pp)}</strong></div>
          <div class="lab-kv"><span>${formatInline('心跳淨效應 (β₁ vs 迷走)')}</span><strong>${formatInline(st.hrText)}</strong></div>
        </div>
      `;

      const applySympVitals = (vObj) => {
        global.TaixuState.updateVitals(vObj);
        global.TaixuPulseMonitor.update(run.vitals);
      };

      labEl.querySelectorAll('[data-symp]').forEach((btn) => {
        btn.addEventListener('click', () => {
          sl.drug = btn.getAttribute('data-symp');
          const p = profiles[sl.drug];
          applySympVitals((sl.alphaBlocked ? p.blocked : p.normal).vitals);
          renderInteractiveLab(step, run);
        });
      });
      labEl.querySelector('#btn-symp-ablock').addEventListener('click', () => {
        sl.alphaBlocked = !sl.alphaBlocked;
        const p = profiles[sl.drug];
        applySympVitals((sl.alphaBlocked ? p.blocked : p.normal).vitals);
        renderInteractiveLab(step, run);
      });
    } else if (step.widget === 'adhd_pfc_lab') {
      const adhd = run.adhdLab || { state: 'baseline' };
      run.adhdLab = adhd;
      const info = {
        baseline: {
          title: 'ADHD 前額葉基態（兒茶酚胺不足）',
          rec: 'α₂A 與 D₁ 未充分調節 HCN 通道',
          camp: '訊號樹突棘微漏、背景雜訊持續干擾',
          result: 'Signal ↓ / Noise ↑（工作記憶渙散、易衝動分心）'
        },
        ne_a2a: {
          title: 'NE / Guanfacine（突觸後 α₂A 致效）',
          rec: 'α₂A 偶聯 G_i 蛋白 → ↓ cAMP',
          camp: '★ 關閉 (Close) 正向主幹樹突棘之 HCN 通道，封堵訊號漏電！',
          result: '有效訊號強化 (Signal ↑↑)；Guanfacine 專一 α₂A 較 Clonidine 少鎮靜與低血壓！'
        },
        da_d1: {
          title: 'DA 調控背景（突觸後 D₁ 適度活化）',
          rec: 'D₁ 偶聯 G_s 蛋白 → ↑ cAMP',
          camp: '★ 打開 (Open) 處理無關雜訊分支上的 HCN 通道，讓干擾漏出消散！',
          result: '背景雜訊消弭 (Noise ↓↓)，突出目標訊息對比度！'
        },
        atomoxetine: {
          title: 'Atomoxetine（非中樞興奮劑・選擇性 NET 抑制）',
          rec: '★ 前額葉皮質 DAT 極少，NET 同時負責回收 NE 與 DA！',
          camp: '單純抑制 NET 即可於前額葉同時↑NE（關 HCN 強訊號）＋↑DA（開 HCN 減雜訊）',
          result: '雙效強化 PFC 功能，且不升高依核紋狀體 DA → 無成癮濫用風險！'
        }
      }[adhd.state] || {};

      labEl.innerHTML = `
        <h3 class="lab-title">前額葉皮質 (PFC) HCN 通道「訊號 vs. 雜訊」調控模擬台</h3>
        <div class="lab-controls">
          <button type="button" class="lab-toggle ${adhd.state === 'baseline' ? 'active' : ''}" data-adhd="baseline">ADHD 基態</button>
          <button type="button" class="lab-toggle ${adhd.state === 'ne_a2a' ? 'active' : ''}" data-adhd="ne_a2a">${formatInline('NE / Guanfacine (α₂A)')}</button>
          <button type="button" class="lab-toggle ${adhd.state === 'da_d1' ? 'active' : ''}" data-adhd="da_d1">${formatInline('DA (D₁ 開通道去雜訊)')}</button>
          <button type="button" class="lab-toggle ${adhd.state === 'atomoxetine' ? 'active' : ''}" data-adhd="atomoxetine">Atomoxetine (NET 雙收)</button>
        </div>
        <div class="lab-readout">
          <div class="lab-kv"><span>目前路徑</span><strong>${formatInline(info.title)}</strong></div>
          <div class="lab-kv"><span>G 蛋白／cAMP 方向</span><strong>${formatInline(info.rec)}</strong></div>
          <div class="lab-kv"><span>HCN 通道開關</span><strong>${formatInline(info.camp)}</strong></div>
          <div class="lab-kv"><span>臨床認知淨效應</span><strong>${formatInline(info.result)}</strong></div>
        </div>
      `;
      labEl.querySelectorAll('[data-adhd]').forEach((btn) => {
        btn.addEventListener('click', () => {
          adhd.state = btn.getAttribute('data-adhd');
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

  function getStepOrderedChoices(choices) {
    const run = global.TaixuState.getRun();
    const ev = run && nodesData.events[run.currentEventId];
    const variant = ev ? getActiveVariantObj(run, ev) : null;
    const step = variant ? variant.steps[run.currentStepIndex] : null;
    const salt = `choices_${run ? run.currentEventId : ''}_${variant ? variant.variantId : ''}_${step ? step.id : run.currentStepIndex}`;
    return getOrderedList(choices, salt);
  }

  function getRescueOrderedChoices(rescueChoices) {
    const run = global.TaixuState.getRun();
    const salt = `rescue_${run ? run.currentEventId : ''}_${run ? run.currentVariantIndex : 0}_${run ? run.currentStepIndex : 0}`;
    return getOrderedList(rescueChoices, salt);
  }

  function renderChoices(choices, lockAll, pickedChoiceId) {
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

    const ordered = getStepOrderedChoices(choices);

    ordered.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';
      btn.id = `choice-${idx + 1}`;
      const isDisabled = lockAll || disabledChoicesOnStep.has(choice.id);
      btn.disabled = isDisabled;

      if (disabledChoicesOnStep.has(choice.id)) {
        btn.classList.add('picked-wrong');
      } else if (lockAll && pickedChoiceId && choice.id === pickedChoiceId) {
        btn.classList.add('picked-correct');
      }

      btn.innerHTML = `
        <span class="choice-key">${idx + 1}</span>
        <span class="choice-text-wrap">
          <span class="choice-main">${formatInline(choice.label)}</span>
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

    const ordered = getRescueOrderedChoices(rescueChoices);

    ordered.forEach((rc, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';
      btn.id = `rescue-choice-${idx + 1}`;
      btn.innerHTML = `
        <span class="choice-key">${idx + 1}</span>
        <span class="choice-text-wrap">
          <span class="choice-main">${formatInline(rc.label)}</span>
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
        title: `${ev.title}${variant.examTag ? `（${variant.examTag}）` : ''}｜${crisisObj.title || '急症危機'}`,
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
        title: `${ev.title}${variant.examTag ? `（${variant.examTag}）` : ''}｜誘答辨析`,
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
      document.getElementById('feedback-speaker').innerHTML = formatInline(fb.speakerName || '蘇苓師妹');

      const subnoteEl = document.getElementById('feedback-subnote');
      if (subnoteEl) {
        if (choice.sublabel) {
          subnoteEl.hidden = false;
          subnoteEl.innerHTML = `<strong>誘答關鍵點：</strong>${formatInline(choice.sublabel)}`;
        } else {
          subnoteEl.hidden = true;
          subnoteEl.innerHTML = '';
        }
      }

      const optionsEl = document.getElementById('feedback-options');
      if (optionsEl) {
        optionsEl.hidden = true;
        optionsEl.innerHTML = '';
      }

      renderRichText(document.getElementById('feedback-body'), fb.text || '此方案將造成異常反應，請再行斟酌！');
      document.getElementById('feedback-unlocks').hidden = true;
      document.getElementById('btn-feedback-next').hidden = true;

      renderChoices(step.choices || [], false, null);
      return;
    }

    // Correct / Suboptimal
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

    const orderedChoices = getStepOrderedChoices(step.choices || []);
    const optionNotes = orderedChoices.map((c, idx) => ({
      num: idx + 1,
      id: c.id,
      outcome: c.outcome,
      picked: c.id === choice.id,
      label: c.label || '',
      sublabel: c.sublabel || ''
    }));

    run.pendingTransition = {
      type: 'correct',
      badge: choice.outcome === 'suboptimal' ? '勉強過關（可再精進）' : '推演無誤',
      speakerName: fb.speakerName || '弘岳真人',
      text: fb.text || '施治得宜，氣脈循常！',
      pickedChoiceId: choice.id,
      optionNotes,
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
    renderChoices(step.choices || [], true, choice.id);
  }

  function handleRescueClick(rc) {
    const run = global.TaixuState.getRun();
    const ev = nodesData.events[run.currentEventId];
    const variant = getActiveVariantObj(run, ev);
    const step = variant.steps[run.currentStepIndex];
    const crisis = run.activeCrisis;
    if (!crisis) return;

    const orderedRescue = getRescueOrderedChoices(crisis.rescueChoices || []);
    const optionNotes = orderedRescue.map((opt, idx) => ({
      num: idx + 1,
      id: opt.id,
      outcome: opt.isSuccess ? 'correct' : 'crisis',
      picked: opt.id === rc.id,
      label: opt.label || '',
      sublabel: opt.sublabel || ''
    }));

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

      if (ev.isBoss) {
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
      optionNotes,
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

  function formatOptionStatusTag(outcome) {
    if (outcome === 'correct') return { cls: 'is-correct', label: '正解' };
    if (outcome === 'suboptimal') return { cls: 'is-suboptimal', label: '次優' };
    if (outcome === 'crisis') return { cls: 'is-crisis', label: '危機陷阱' };
    return { cls: 'is-wrong', label: '誘答' };
  }

  function showPendingFeedbackPanel(tr) {
    const fbPanel = document.getElementById('feedback-panel');
    fbPanel.className = `feedback-panel ${tr.type === 'crisis' ? 'is-crisis' : 'is-correct'}`;
    document.getElementById('feedback-badge').textContent = tr.badge;
    document.getElementById('feedback-speaker').innerHTML = formatInline(tr.speakerName);

    const subnoteEl = document.getElementById('feedback-subnote');
    if (subnoteEl) {
      subnoteEl.hidden = true;
      subnoteEl.innerHTML = '';
    }

    renderRichText(document.getElementById('feedback-body'), tr.text);

    const optionsEl = document.getElementById('feedback-options');
    if (optionsEl) {
      const notes = Array.isArray(tr.optionNotes) ? tr.optionNotes : [];
      if (notes.length > 0 && notes.some((o) => Boolean(o.sublabel))) {
        optionsEl.hidden = false;
        const rowsHtml = notes
          .map((opt) => {
            const st = formatOptionStatusTag(opt.outcome);
            return `
              <div class="feedback-opt-item ${st.cls}">
                <div class="feedback-opt-head">
                  <span class="feedback-opt-tag">${st.label}</span>
                  ${opt.picked ? '<span class="feedback-opt-picked">本輪選擇</span>' : ''}
                  <span class="feedback-opt-label">${opt.num}. ${formatInline(opt.label)}</span>
                </div>
                ${opt.sublabel ? `<div class="feedback-opt-note">${formatInline(opt.sublabel)}</div>` : ''}
              </div>
            `;
          })
          .join('');
        optionsEl.innerHTML = `
          <h4 class="feedback-options-title">作答詳解・各選項機轉與誘答辨析</h4>
          <div class="feedback-options-list">${rowsHtml}</div>
        `;
      } else {
        optionsEl.hidden = true;
        optionsEl.innerHTML = '';
      }
    }

    const unlocksEl = document.getElementById('feedback-unlocks');
    if (tr.unlockedNames && tr.unlockedNames.length > 0) {
      unlocksEl.hidden = false;
      unlocksEl.innerHTML = tr.unlockedNames
        .map((n) => `<span class="unlock-tag">解鎖 ${formatInline(n)}</span>`)
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
    const riskThreshold = total >= 100 ? Math.max(16, Math.round(total * 0.22)) : total >= 35 ? Math.max(10, Math.round(total * 0.18)) : total >= 16 ? 8 : 6;

    if (run.failedRescueCount > 0 && run.guardPills <= 0) {
      return endingsData.find((e) => e.id === 'reincarnate') || endingsData[0];
    }
    if (run.failedRescueCount >= 2) {
      return endingsData.find((e) => e.id === 'qi_reversal') || endingsData[0];
    }
    if (run.crisisCount > 0 && run.rescuedCount >= run.crisisCount && run.failedRescueCount === 0) {
      return endingsData.find((e) => e.id === 'crisis_master') || endingsData[0];
    }
    if (run.riskScore >= riskThreshold) {
      return endingsData.find((e) => e.id === 'toxic_elder') || endingsData[0];
    }
    if (
      run.mode === 'story' &&
      (run.storyScope || 'full') === 'full' &&
      total >= 30 &&
      acc >= 0.88 &&
      balanceDiff <= 24
    ) {
      return endingsData.find((e) => e.id === 'grand_perfection') || endingsData.find((e) => e.id === 'shennong_heir') || endingsData[0];
    }
    if (run.mode === 'story' && acc >= 0.9 && balanceDiff <= 20) {
      return endingsData.find((e) => e.id === 'shennong_heir') || endingsData[0];
    }
    if (
      (run.route === 'xuanming' || run.route === 'taiyang' || run.storyScope === 'part2' || (run.yang - run.yin) >= 12) &&
      acc >= 0.7
    ) {
      return endingsData.find((e) => e.id === 'xuanming_taiyang_master') || endingsData[0];
    }
    if ((run.route === 'taiyin' || (run.yin - run.yang) >= 12) && acc >= 0.7) {
      return endingsData.find((e) => e.id === 'taiyin_grandmaster') || endingsData[0];
    }
    if (run.crisisCount === 0 && acc >= 0.8 && balanceDiff <= 22) {
      return endingsData.find((e) => e.id === 'flawless_sage') || endingsData[0];
    }
    if (acc >= 0.65) {
      return endingsData.find((e) => e.id === ((run.yang > run.yin) ? 'xuanming_taiyang_master' : 'taiyin_grandmaster')) || endingsData[0];
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
      storyScope: run.storyScope || 'full',
      storyVariantMode: run.storyVariantMode || 'core_only',
      rogueVariantMode: run.rogueVariantMode || 'core_only',
      route: run.route,
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

    global.TaixuState.clearSavedRun(run.slotId);
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
      const scopeTag = run.storyScope === 'part1' ? '上篇' : run.storyScope === 'part2' ? '下篇' : '全四卷';
      const modeTag = run.mode === 'story' ? `章回・${scopeTag}` : '速行篇';
      const queue = run.currentEventId && run.resolvedVariants ? (run.resolvedVariants[run.currentEventId] || []) : [];
      const qSuffix = queue.length > 1 ? `（陣 ${(run.currentVariantIndex || 0) + 1}/${queue.length}）` : '';
      progEl.textContent = `${modeTag}・${Math.min(done + 1, totalEvents)}/${totalEvents}${qSuffix}`;
    }

    // Pouch items
    const pouchEl = document.getElementById('hud-pouch');
    if (pouchEl) {
      pouchEl.innerHTML = (run.pouchItems || [])
        .map((it) => `<span class="pouch-item" title="${escapeHtml(it.desc || '')}">${formatInline(it.name)}</span>`)
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
    setBundleData,
    startNewRun,
    resumeCurrentRun,
    continueFromFeedback,
    finishRun
  };
})(window);
