(function (global) {
  'use strict';

  const CHAPTER_LABELS = {
    'Ch.06': 'Ch.06 總論與受體',
    'Ch.07': 'Ch.07 擬膽鹼與 AChEI',
    'Ch.08': 'Ch.08 抗膽鹼・肌鬆解痙',
    'Ch.09': 'Ch.09 擬交感・α/β 阻斷'
  };

  let bankData = { meta: {}, questions: [] };
  let codexEntries = [];
  let onExitCallback = null;

  const session = {
    active: false,
    mode: 'practice', // 'practice' | 'mock'
    filters: {
      track: 'all',
      period: 'all',
      chapter: 'all',
      status: 'all',
      query: ''
    },
    seed: 'TX-NE01',
    mockLimit: 0, // 0 = all matching
    questions: [],
    currentIndex: 0,
    answers: {}, // qId -> 'A'|'B'|'C'|'D'
    revealed: {}, // qId -> true (practice mode)
    submitted: false, // mock mode
    reviewWrongOnly: false,
    startedAt: 0,
    elapsedSec: 0,
    timerId: null
  };

  function fmtInline(str) {
    return global.TaixuFormat ? global.TaixuFormat.formatClinicalInline(str) : escapeHtml(str);
  }

  function fmtMd(str) {
    return global.TaixuFormat ? global.TaixuFormat.formatClinicalMarkdown(str) : escapeHtml(str);
  }

  function stripClinical(str) {
    return global.TaixuFormat ? global.TaixuFormat.stripClinicalTags(str) : String(str || '');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function init(data, codex, exitCb) {
    setBankData(data);
    codexEntries = (codex && codex.entries) || [];
    onExitCallback = exitCb || null;
    bindArenaControls();
    refreshCounters();
  }

  function setBankData(data) {
    bankData = data && Array.isArray(data.questions) ? data : { meta: {}, questions: [] };
    refreshCounters();
  }

  function getBankData() {
    return bankData;
  }

  function isAnswerCorrect(q, letter) {
    if (!q || !letter) return false;
    const accepted = Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length > 0
      ? q.acceptedAnswers
      : [q.originalAnswer];
    return accepted.indexOf(letter) !== -1;
  }

  function isGiveAllQuestion(q) {
    return Array.isArray(q && q.acceptedAnswers) && q.acceptedAnswers.length >= 4;
  }

  function filterQuestions(filters) {
    const f = filters || {};
    const prog = global.TaixuState ? global.TaixuState.getNeProgress() : { records: {}, flagged: [] };
    const flaggedSet = new Set(prog.flagged || []);
    const qText = f.query ? stripClinical(f.query).trim().toLowerCase() : '';

    return (bankData.questions || []).filter((q) => {
      if (f.track && f.track !== 'all' && q.track !== f.track) return false;
      if (f.period && f.period !== 'all') {
        if (f.period.indexOf('-') !== -1) {
          if (q.exam !== f.period) return false;
        } else if (String(q.year) !== String(f.period)) {
          return false;
        }
      }
      if (f.chapter && f.chapter !== 'all' && q.chapter !== f.chapter) return false;
      if (f.status && f.status !== 'all') {
        const rec = prog.records[q.id];
        if (f.status === 'unanswered' && rec) return false;
        if (f.status === 'wrong' && (!rec || rec.lastCorrect)) return false;
        if (f.status === 'flagged' && !flaggedSet.has(q.id)) return false;
        if (f.status === 'review_wrong') {
          const isUnanswered = !rec;
          const isWrong = rec && !rec.lastCorrect;
          const isFlagged = flaggedSet.has(q.id);
          if (!isUnanswered && !isWrong && !isFlagged) return false;
        }
      }
      if (qText) {
        const hay = stripClinical(
          [
            q.tag,
            q.topic,
            q.stem,
            q.options && q.options.A,
            q.options && q.options.B,
            q.options && q.options.C,
            q.options && q.options.D,
            q.coreSummary
          ].join(' ')
        ).toLowerCase();
        if (!hay.includes(qText)) return false;
      }
      return true;
    });
  }

  function getStatsSummary(list) {
    const arr = Array.isArray(list) ? list : bankData.questions || [];
    let md = 0;
    let ph = 0;
    arr.forEach((q) => {
      if (q.track === 'physician') md += 1;
      else ph += 1;
    });
    return { total: arr.length, physician: md, pharmacist: ph };
  }

  function refreshCounters() {
    const all = bankData.questions || [];
    const total = all.length;
    const prog = global.TaixuState ? global.TaixuState.getNeProgress() : { records: {}, flagged: [] };
    let mastered = 0;
    let attempted = 0;
    all.forEach((q) => {
      const r = prog.records[q.id];
      if (r) {
        attempted += 1;
        if (r.mastered) mastered += 1;
      }
    });

    const topBadge = document.getElementById('ne-progress-badge');
    if (topBadge) topBadge.textContent = `${mastered}/${total}`;

    const statNe = document.getElementById('stat-ne-count');
    if (statNe) statNe.textContent = `${mastered} / ${total}`;

    const titleTotal = document.getElementById('ne-card-total-count');
    if (titleTotal) {
      const s = getStatsSummary(all);
      titleTotal.textContent = `共 ${s.total} 題（醫師 ${s.physician} ＋ 藥師 ${s.pharmacist}）`;
    }
    return { total, mastered, attempted };
  }

  function stopTimer() {
    if (session.timerId) {
      clearInterval(session.timerId);
      session.timerId = null;
    }
  }

  function formatDuration(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function startTimer() {
    stopTimer();
    session.startedAt = Date.now();
    session.elapsedSec = 0;
    updateTimerDisplay();
    session.timerId = setInterval(() => {
      if (!session.active || (session.mode === 'mock' && session.submitted)) return;
      session.elapsedSec = Math.floor((Date.now() - session.startedAt) / 1000);
      updateTimerDisplay();
    }, 1000);
  }

  function updateTimerDisplay() {
    const el = document.getElementById('ne-timer-value');
    if (el) el.textContent = formatDuration(session.elapsedSec);
  }

  function startSession(opts) {
    const o = opts || {};
    session.mode = o.mode === 'mock' ? 'mock' : 'practice';
    session.filters = {
      track: o.track || 'all',
      period: o.period || 'all',
      chapter: o.chapter || 'all',
      status: o.status || 'all',
      query: o.query || ''
    };
    session.seed = String(o.seed || 'TX-NE01').trim();
    session.mockLimit = Number(o.mockLimit) || 0;
    session.answers = {};
    session.revealed = {};
    session.submitted = false;
    session.reviewWrongOnly = false;
    session.currentIndex = 0;
    session.active = true;

    let pool = filterQuestions(session.filters);
    if (pool.length === 0 && session.filters.status !== 'all') {
      session.filters.status = 'all';
      pool = filterQuestions(session.filters);
    }

    if (session.mode === 'mock') {
      const rng = global.TaixuRNG.createMulberry32(session.seed + '_NE_' + Date.now() % 10000);
      const shuffled = rng.shuffle(pool);
      session.questions = session.mockLimit > 0 ? shuffled.slice(0, session.mockLimit) : shuffled;
    } else {
      session.questions = pool.slice();
    }

    syncArenaFilterControls();
    const reportEl = document.getElementById('ne-mock-report');
    if (reportEl) reportEl.hidden = true;
    startTimer();
    renderArena();
  }

  function reapplyInlineFilters() {
    const prevMode = session.mode;
    const prevSeed = session.seed;
    const prevLimit = session.mockLimit;
    startSession({
      mode: prevMode,
      track: session.filters.track,
      period: session.filters.period,
      chapter: session.filters.chapter,
      status: session.filters.status,
      query: session.filters.query,
      seed: prevSeed,
      mockLimit: prevLimit
    });
  }

  function leaveArena() {
    session.active = false;
    stopTimer();
    if (typeof onExitCallback === 'function') {
      onExitCallback();
    }
  }

  function getActiveQuestionList() {
    if (session.mode === 'mock' && session.submitted && session.reviewWrongOnly) {
      return session.questions.filter((q) => {
        const picked = session.answers[q.id];
        return !picked || !isAnswerCorrect(q, picked);
      });
    }
    return session.questions;
  }

  function renderArena() {
    const list = getActiveQuestionList();
    const ribbonMode = document.getElementById('ne-mode-badge');
    const ribbonScope = document.getElementById('ne-scope-summary');
    const submitBtn = document.getElementById('btn-ne-submit-mock');

    if (ribbonMode) {
      ribbonMode.textContent =
        session.mode === 'mock'
          ? session.submitted
            ? '擬真模考・檢討中'
            : '擬真模考・作答中'
          : '逐題精練模式';
      ribbonMode.className = `ne-mode-badge ${session.mode === 'mock' ? 'is-mock' : 'is-practice'}`;
    }

    if (ribbonScope) {
      const trackLbl =
        session.filters.track === 'physician'
          ? '醫師(一)'
          : session.filters.track === 'pharmacist'
            ? '藥師(一)'
            : '醫＋藥全部';
      const periodLbl = session.filters.period === 'all' ? '110–115 年' : `${session.filters.period} 年`;
      const chLbl = session.filters.chapter === 'all' ? 'Ch.06–09' : session.filters.chapter;
      ribbonScope.textContent = `${trackLbl}｜${periodLbl}｜${chLbl}（共 ${session.questions.length} 題）`;
    }

    if (submitBtn) {
      submitBtn.hidden = !(session.mode === 'mock' && !session.submitted && session.questions.length > 0);
    }

    updateSessionMetrics();
    renderNavigatorGrid(list);

    const cardEl = document.getElementById('ne-question-card');
    const emptyEl = document.getElementById('ne-empty-state');
    if (list.length === 0) {
      if (cardEl) cardEl.hidden = true;
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.innerHTML = session.reviewWrongOnly
          ? '<p>🎉 本輪模考全對，沒有錯題可檢討！</p><button type="button" class="btn-secondary" id="btn-ne-show-all-review">檢視全部題目</button>'
          : '<p>目前篩選條件下沒有符合的國考題目，請放寬類科、年度、章節或關鍵字條件。</p>';
        const showAllBtn = emptyEl.querySelector('#btn-ne-show-all-review');
        if (showAllBtn) {
          showAllBtn.addEventListener('click', () => {
            session.reviewWrongOnly = false;
            session.currentIndex = 0;
            renderArena();
          });
        }
      }
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (cardEl) cardEl.hidden = false;

    if (session.currentIndex >= list.length) session.currentIndex = list.length - 1;
    if (session.currentIndex < 0) session.currentIndex = 0;

    const q = list[session.currentIndex];
    renderQuestionCard(q, session.currentIndex, list.length);
  }

  function renderQuestionCard(q, idx, total) {
    const prog = global.TaixuState.getNeProgress();
    const isFlagged = (prog.flagged || []).indexOf(q.id) !== -1;
    const picked = session.answers[q.id] || null;
    const showExplain =
      session.mode === 'practice' ? Boolean(session.revealed[q.id] || picked) : Boolean(session.submitted);

    // Metadata bar
    const metaEl = document.getElementById('ne-q-meta');
    if (metaEl) {
      const trackCls = q.track === 'physician' ? 'is-md' : 'is-ph';
      const revHtml = q.revisionNote
        ? `<span class="ne-tag is-revision" title="${escapeHtml(q.revisionNote)}">考選部更正答案</span>`
        : '';
      metaEl.innerHTML = `
        <span class="ne-tag ${trackCls}">${escapeHtml(q.trackLabel)}</span>
        <span class="ne-tag is-exam">${escapeHtml(q.exam)}｜第 ${q.qnum} 題</span>
        <span class="ne-tag is-chapter">${escapeHtml(CHAPTER_LABELS[q.chapter] || q.chapter)}</span>
        ${revHtml}
      `;
    }

    const numEl = document.getElementById('ne-q-counter');
    if (numEl) numEl.textContent = `第 ${idx + 1} / ${total} 題`;

    const flagBtn = document.getElementById('btn-ne-flag');
    if (flagBtn) {
      flagBtn.classList.toggle('is-flagged', isFlagged);
      flagBtn.textContent = isFlagged ? '★ 已標記複習' : '☆ 標記複習';
    }

    const topicEl = document.getElementById('ne-q-topic');
    if (topicEl) topicEl.innerHTML = fmtInline(q.topic || '');

    const stemEl = document.getElementById('ne-q-stem');
    if (stemEl) stemEl.innerHTML = fmtInline(q.stem || '');

    // Options A–D
    const optsEl = document.getElementById('ne-q-options');
    if (optsEl) {
      optsEl.innerHTML = '';
      ['A', 'B', 'C', 'D'].forEach((letter, i) => {
        const text = (q.options && q.options[letter]) || '';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'choice-btn ne-choice-btn';
        btn.id = `ne-choice-${letter}`;
        btn.setAttribute('data-letter', letter);

        const isAccepted = isAnswerCorrect(q, letter);
        const isPicked = picked === letter;

        if (showExplain) {
          if (isAccepted && isPicked) {
            btn.classList.add('picked-correct');
          } else if (isAccepted) {
            btn.classList.add('is-revealed-correct');
          } else if (isPicked) {
            btn.classList.add('picked-wrong');
          }
          btn.disabled = true;
        } else if (isPicked) {
          btn.classList.add('is-mock-selected');
        }

        btn.innerHTML = `
          <span class="choice-key">${letter}</span>
          <span class="choice-text-wrap">
            <span class="choice-main">${fmtInline(text)}</span>
          </span>
        `;

        btn.addEventListener('click', () => handleOptionSelect(q, letter));
        optsEl.appendChild(btn);
      });
    }

    // Practice quick-reveal button
    const revealBtn = document.getElementById('btn-ne-toggle-explain');
    if (revealBtn) {
      if (session.mode === 'practice' && !picked) {
        revealBtn.hidden = false;
        revealBtn.textContent = session.revealed[q.id] ? '隱藏詳解' : '直接查看詳解';
      } else {
        revealBtn.hidden = true;
      }
    }

    // Explanation panel
    const expPanel = document.getElementById('ne-explain-panel');
    if (expPanel) {
      if (!showExplain) {
        expPanel.hidden = true;
      } else {
        expPanel.hidden = false;
        renderExplanationPanel(expPanel, q, picked);
      }
    }

    // Nav buttons
    const prevBtn = document.getElementById('btn-ne-prev');
    const nextBtn = document.getElementById('btn-ne-next');
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) {
      if (idx >= total - 1) {
        if (session.mode === 'mock' && !session.submitted) {
          nextBtn.textContent = '交卷計分 →';
          nextBtn.disabled = false;
        } else {
          nextBtn.textContent = '已達末題';
          nextBtn.disabled = true;
        }
      } else {
        nextBtn.textContent = '下一題 →';
        nextBtn.disabled = false;
      }
    }
  }

  function renderExplanationPanel(panel, q, picked) {
    const accepted = Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length > 0
      ? q.acceptedAnswers
      : [q.originalAnswer];
    const giveAll = isGiveAllQuestion(q);
    const correct = picked ? isAnswerCorrect(q, picked) : null;

    panel.className =
      'feedback-panel ne-explain-panel ' +
      (picked ? (correct ? 'is-correct' : 'is-crisis') : 'is-neutral');

    let badgeText = '考題詳解';
    let verdictText = giveAll
      ? `本題考選部更正為一律給分（原公布答案 ${q.originalAnswer}）`
      : `考選部最終標準答案：${accepted.join(' 或 ')}`;

    if (picked) {
      if (giveAll) {
        badgeText = '一律給分・考選部更正';
        verdictText = `你選了 ${picked}（本題一律給分；原公布答案 ${q.originalAnswer}）`;
      } else if (correct) {
        badgeText = '答對無誤';
        verdictText = `你選了 ${picked}｜標準答案：${accepted.join(' 或 ')}`;
      } else {
        badgeText = '答錯・已收錄錯題筆記';
        verdictText = `你選了 ${picked}｜正確答案：${accepted.join(' 或 ')}`;
      }
    }

    const revBox = q.revisionNote
      ? `<div class="ne-revision-box"><strong>考選部官方更正備註：</strong>${fmtInline(q.revisionNote)}（原公告標準答案：${escapeHtml(q.originalAnswer)}）</div>`
      : '';

    const optRows = ['A', 'B', 'C', 'D']
      .map((letter) => {
        const isAcc = accepted.indexOf(letter) !== -1;
        const isPick = picked === letter;
        const expText = (q.optionExplanations && q.optionExplanations[letter]) || '';
        const optText = (q.options && q.options[letter]) || '';
        const cls = isAcc ? 'is-correct' : isPick ? 'is-crisis' : 'is-wrong';
        const tagLbl = giveAll ? (letter === q.originalAnswer ? '原公布／給分' : '給分') : isAcc ? '正解' : '解析';
        return `
          <div class="feedback-opt-item ${cls}">
            <div class="feedback-opt-head">
              <span class="feedback-opt-tag">${tagLbl}</span>
              ${isPick ? '<span class="feedback-opt-picked">你的作答</span>' : ''}
              <span class="feedback-opt-label">${letter}. ${fmtInline(optText)}</span>
            </div>
            ${expText ? `<div class="feedback-opt-note">${fmtMd(expText)}</div>` : ''}
          </div>
        `;
      })
      .join('');

    const codexChips = (q.codexIds || [])
      .map((num) => {
        const entry = codexEntries.find((c) => c.num === num);
        const label = entry ? `#${String(num).padStart(2, '0')} ${entry.title}` : `考點 #${num}`;
        return `<button type="button" class="ne-codex-chip" data-open-codex="${num}">${fmtInline(label)}</button>`;
      })
      .join('');

    const moexLink = q.moexUrl
      ? `<a class="ne-moex-link" href="${escapeHtml(q.moexUrl)}" target="_blank" rel="noopener noreferrer">檢視考選部 ${escapeHtml(q.exam)} 原始卷頁 ↗</a>`
      : '';

    panel.innerHTML = `
      <div class="feedback-header">
        <span class="feedback-badge">${escapeHtml(badgeText)}</span>
        <span class="feedback-speaker">${escapeHtml(verdictText)}</span>
      </div>
      ${revBox}
      <div class="ne-core-summary">
        <strong>核心考點速記：</strong>${fmtMd(q.coreSummary || '')}
      </div>
      <div class="feedback-options">
        <p class="feedback-options-title">四選項逐一詳解與誘答辨析</p>
        <div class="feedback-options-list">${optRows}</div>
      </div>
      <div class="ne-explain-footer">
        <div class="ne-codex-links">
          <span class="ne-codex-lbl">對應靈樞丹譜：</span>
          ${codexChips || '<span class="ne-codex-none">自主神經綜合考點</span>'}
        </div>
        ${moexLink}
      </div>
    `;

    panel.querySelectorAll('[data-open-codex]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const num = Number(btn.getAttribute('data-open-codex'));
        if (global.TaixuCodex && typeof global.TaixuCodex.openCard === 'function') {
          global.TaixuCodex.openCard(num);
        }
      });
    });
  }

  function handleOptionSelect(q, letter) {
    if (session.mode === 'mock') {
      if (session.submitted) return;
      session.answers[q.id] = letter;
      global.TaixuPulseMonitor.playUiClick(false);
      renderArena();
      return;
    }

    // Practice mode: immediate grade
    if (session.answers[q.id]) return;
    session.answers[q.id] = letter;
    session.revealed[q.id] = true;
    const ok = isAnswerCorrect(q, letter);
    global.TaixuPulseMonitor.playUiClick(!ok);
    global.TaixuState.recordNeAnswer(q.id, letter, ok);

    if (Array.isArray(q.codexIds) && q.codexIds.length > 0) {
      global.TaixuState.unlockCodexIds(q.codexIds);
    }

    if (!ok) {
      const accepted = (q.acceptedAnswers || [q.originalAnswer]).join('／');
      const pickedText = (q.options && q.options[letter]) || '';
      const exp = (q.optionExplanations && q.optionExplanations[letter]) || '';
      global.TaixuState.addWrongNote({
        key: `NE_${q.id}`,
        title: `【國考】${q.tag}｜${q.topic}`,
        picked: `${letter}. ${pickedText}`,
        explanation: `正確答案：${accepted}。${q.coreSummary || ''} ${exp}`
      });
    }

    global.TaixuCodex.refreshCounters();
    refreshCounters();
    renderArena();
  }

  function submitMockExam() {
    if (session.mode !== 'mock' || session.submitted) return;
    const total = session.questions.length;
    const answeredCount = session.questions.filter((q) => Boolean(session.answers[q.id])).length;
    if (answeredCount < total) {
      const unanswered = total - answeredCount;
      const okProceed = global.confirm(`尚有 ${unanswered} 題未作答，確定要直接交卷計分嗎？`);
      if (!okProceed) return;
    }

    session.submitted = true;
    session.elapsedSec = Math.floor((Date.now() - session.startedAt) / 1000);
    stopTimer();

    let correctCount = 0;
    const byTrack = {
      physician: { label: '醫師(一) 醫學(二)', ok: 0, total: 0 },
      pharmacist: { label: '藥師(一) 藥學(一)', ok: 0, total: 0 }
    };
    const byChapter = {};

    session.questions.forEach((q) => {
      const picked = session.answers[q.id] || null;
      const ok = Boolean(picked && isAnswerCorrect(q, picked));
      if (ok) correctCount += 1;

      if (byTrack[q.track]) {
        byTrack[q.track].total += 1;
        if (ok) byTrack[q.track].ok += 1;
      }
      if (!byChapter[q.chapter]) {
        byChapter[q.chapter] = { label: CHAPTER_LABELS[q.chapter] || q.chapter, ok: 0, total: 0 };
      }
      byChapter[q.chapter].total += 1;
      if (ok) byChapter[q.chapter].ok += 1;

      if (picked) {
        global.TaixuState.recordNeAnswer(q.id, picked, ok);
      }
      if (Array.isArray(q.codexIds) && q.codexIds.length > 0) {
        global.TaixuState.unlockCodexIds(q.codexIds);
      }
      if (!ok) {
        const accepted = (q.acceptedAnswers || [q.originalAnswer]).join('／');
        const pickedText = picked ? `${picked}. ${(q.options && q.options[picked]) || ''}` : '未作答';
        global.TaixuState.addWrongNote({
          key: `NE_${q.id}`,
          title: `【國考模考】${q.tag}｜${q.topic}`,
          picked: pickedText,
          explanation: `正確答案：${accepted}。${q.coreSummary || ''}`
        });
      }
    });

    global.TaixuCodex.refreshCounters();
    refreshCounters();
    renderMockReport(correctCount, total, byTrack, byChapter);
    renderArena();
  }

  function renderMockReport(correctCount, total, byTrack, byChapter) {
    const reportEl = document.getElementById('ne-mock-report');
    if (!reportEl) return;
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const wrongCount = total - correctCount;

    const barsHtml = []
      .concat(
        Object.values(byTrack).filter((b) => b.total > 0),
        ['Ch.06', 'Ch.07', 'Ch.08', 'Ch.09'].map((k) => byChapter[k]).filter(Boolean)
      )
      .map((b) => {
        const p = b.total > 0 ? Math.round((b.ok / b.total) * 100) : 0;
        const tone = p >= 80 ? 'is-good' : p >= 60 ? 'is-mid' : 'is-weak';
        return `
          <div class="ne-bar-row">
            <div class="ne-bar-label">
              <span>${escapeHtml(b.label)}</span>
              <strong>${b.ok}/${b.total} (${p}%)</strong>
            </div>
            <div class="ne-bar-track">
              <div class="ne-bar-fill ${tone}" style="width:${p}%"></div>
            </div>
          </div>
        `;
      })
      .join('');

    reportEl.hidden = false;
    reportEl.innerHTML = `
      <div class="ne-report-head">
        <div>
          <span class="ne-report-seal">${pct >= 80 ? '金榜題名' : pct >= 60 ? '達標及格' : '仍須淬鍊'}</span>
          <h3>擬真模考成績單</h3>
        </div>
        <div class="ne-report-score">
          <strong>${pct} 分</strong>
          <span>答對 ${correctCount} / ${total} 題｜耗時 ${formatDuration(session.elapsedSec)}</span>
        </div>
      </div>
      <div class="ne-report-bars">${barsHtml}</div>
      <div class="ne-report-actions">
        ${wrongCount > 0 ? `<button type="button" class="btn-primary" id="btn-ne-filter-wrong-review">${session.reviewWrongOnly ? '顯示全部題目' : `只檢討本輪錯題 (${wrongCount})`}</button>` : ''}
        <button type="button" class="btn-secondary" id="btn-ne-retake-mock">另抽新卷再考一次</button>
      </div>
    `;

    const wrongBtn = reportEl.querySelector('#btn-ne-filter-wrong-review');
    if (wrongBtn) {
      wrongBtn.addEventListener('click', () => {
        session.reviewWrongOnly = !session.reviewWrongOnly;
        session.currentIndex = 0;
        wrongBtn.textContent = session.reviewWrongOnly ? '顯示全部題目' : `只檢討本輪錯題 (${wrongCount})`;
        renderArena();
      });
    }
    const retakeBtn = reportEl.querySelector('#btn-ne-retake-mock');
    if (retakeBtn) {
      retakeBtn.addEventListener('click', () => {
        session.seed = global.TaixuRNG.generateSeedCode();
        reapplyInlineFilters();
      });
    }
  }

  function updateSessionMetrics() {
    const total = session.questions.length;
    let answered = 0;
    let correct = 0;
    session.questions.forEach((q) => {
      const p = session.answers[q.id];
      if (p) {
        answered += 1;
        if (isAnswerCorrect(q, p)) correct += 1;
      }
    });

    const progEl = document.getElementById('ne-hud-progress');
    if (progEl) progEl.textContent = `已答 ${answered} / ${total}`;

    const accEl = document.getElementById('ne-hud-acc');
    if (accEl) {
      if (session.mode === 'mock' && !session.submitted) {
        accEl.textContent = '交卷後計分';
      } else {
        const pct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
        accEl.textContent = `正確 ${correct}/${answered} (${pct}%)`;
      }
    }

    const stats = refreshCounters();
    const sideSummary = document.getElementById('ne-side-summary');
    if (sideSummary) {
      sideSummary.innerHTML = `
        <div class="ne-side-kv"><span>本輪已答</span><strong>${answered}/${total}</strong></div>
        <div class="ne-side-kv"><span>總庫精熟</span><strong>${stats.mastered}/${stats.total}</strong></div>
      `;
    }
  }

  function renderNavigatorGrid(list) {
    const grid = document.getElementById('ne-nav-grid');
    if (!grid) return;
    const prog = global.TaixuState.getNeProgress();
    const flaggedSet = new Set(prog.flagged || []);

    grid.innerHTML = '';
    list.forEach((q, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ne-nav-cell';
      if (idx === session.currentIndex) btn.classList.add('is-current');
      if (flaggedSet.has(q.id)) btn.classList.add('is-flagged');

      const picked = session.answers[q.id];
      const hist = prog.records[q.id];
      if (session.mode === 'mock' && !session.submitted) {
        if (picked) btn.classList.add('is-mock-ans');
      } else if (picked) {
        btn.classList.add(isAnswerCorrect(q, picked) ? 'is-ok' : 'is-err');
      } else if (session.mode === 'practice' && hist) {
        btn.classList.add(hist.lastCorrect ? 'is-hist-ok' : 'is-hist-err');
      }

      btn.textContent = String(idx + 1);
      btn.title = `${q.tag}｜${q.topic}`;
      btn.addEventListener('click', () => {
        session.currentIndex = idx;
        renderArena();
      });
      grid.appendChild(btn);
    });
  }

  function syncArenaFilterControls() {
    const map = [
      ['ne-inline-track', session.filters.track],
      ['ne-inline-period', session.filters.period],
      ['ne-inline-chapter', session.filters.chapter],
      ['ne-inline-status', session.filters.status],
      ['ne-inline-mode', session.mode]
    ];
    map.forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    });
    const searchEl = document.getElementById('ne-inline-search');
    if (searchEl) searchEl.value = session.filters.query || '';
  }

  function bindArenaControls() {
    const prevBtn = document.getElementById('btn-ne-prev');
    const nextBtn = document.getElementById('btn-ne-next');
    const flagBtn = document.getElementById('btn-ne-flag');
    const revealBtn = document.getElementById('btn-ne-toggle-explain');
    const submitBtn = document.getElementById('btn-ne-submit-mock');
    const backBtn = document.getElementById('btn-ne-back-home');
    const toggleFilterBtn = document.getElementById('btn-ne-toggle-filter');
    const filterDrawer = document.getElementById('ne-inline-filters');
    const resetProgBtn = document.getElementById('btn-ne-reset-progress');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (session.currentIndex > 0) {
          session.currentIndex -= 1;
          renderArena();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const list = getActiveQuestionList();
        if (session.currentIndex < list.length - 1) {
          session.currentIndex += 1;
          renderArena();
        } else if (session.mode === 'mock' && !session.submitted) {
          submitMockExam();
        }
      });
    }

    if (flagBtn) {
      flagBtn.addEventListener('click', () => {
        const list = getActiveQuestionList();
        const q = list[session.currentIndex];
        if (!q) return;
        global.TaixuState.toggleNeFlag(q.id);
        renderArena();
      });
    }

    if (revealBtn) {
      revealBtn.addEventListener('click', () => {
        const list = getActiveQuestionList();
        const q = list[session.currentIndex];
        if (!q) return;
        session.revealed[q.id] = !session.revealed[q.id];
        if (session.revealed[q.id] && Array.isArray(q.codexIds)) {
          global.TaixuState.unlockCodexIds(q.codexIds);
          global.TaixuCodex.refreshCounters();
        }
        renderArena();
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', submitMockExam);
    }

    if (backBtn) {
      backBtn.addEventListener('click', leaveArena);
    }

    if (toggleFilterBtn && filterDrawer) {
      toggleFilterBtn.addEventListener('click', () => {
        filterDrawer.hidden = !filterDrawer.hidden;
      });
    }

    if (resetProgBtn) {
      resetProgBtn.addEventListener('click', () => {
        if (global.confirm('確定要清除所有「國考歷屆實戰殿」的作答精熟與標記紀錄嗎？（不影響靈樞丹譜與錯題筆記）')) {
          global.TaixuState.resetNeProgress();
          session.answers = {};
          session.revealed = {};
          refreshCounters();
          renderArena();
        }
      });
    }

    const bindSelect = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        if (key === 'mode') {
          session.mode = el.value === 'mock' ? 'mock' : 'practice';
        } else {
          session.filters[key] = el.value;
        }
        reapplyInlineFilters();
      });
    };
    bindSelect('ne-inline-track', 'track');
    bindSelect('ne-inline-period', 'period');
    bindSelect('ne-inline-chapter', 'chapter');
    bindSelect('ne-inline-status', 'status');
    bindSelect('ne-inline-mode', 'mode');

    const searchEl = document.getElementById('ne-inline-search');
    if (searchEl) {
      let debounce = null;
      searchEl.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          session.filters.query = searchEl.value.trim();
          reapplyInlineFilters();
        }, 200);
      });
    }

    // Keyboard shortcuts when National Exam screen is active
    document.addEventListener('keydown', (e) => {
      const screen = document.getElementById('screen-national-exam');
      const codexDrawer = document.getElementById('codex-drawer');
      if (!session.active || !screen || screen.hidden || (codexDrawer && !codexDrawer.hidden)) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;

      const keyMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', a: 'A', b: 'B', c: 'C', d: 'D' };
      const k = String(e.key || '').toLowerCase();
      if (keyMap[k]) {
        const btn = document.getElementById(`ne-choice-${keyMap[k]}`);
        if (btn && !btn.disabled) btn.click();
      } else if (e.key === 'ArrowLeft') {
        const prev = document.getElementById('btn-ne-prev');
        if (prev && !prev.disabled) prev.click();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        const next = document.getElementById('btn-ne-next');
        if (next && !next.disabled) next.click();
      } else if (k === 'f') {
        const flag = document.getElementById('btn-ne-flag');
        if (flag) flag.click();
      }
    });
  }

  global.TaixuNationalExam = {
    init,
    setBankData,
    getBankData,
    filterQuestions,
    getStatsSummary,
    refreshCounters,
    startSession,
    leaveArena
  };
})(window);
