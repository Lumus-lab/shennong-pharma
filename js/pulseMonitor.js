(function (global) {
  'use strict';

  const WIDTH = 320;
  const BASE_Y = 52;
  let currentVitals = null;
  let rafId = null;
  let phaseX = 0;
  let lastTs = 0;
  let audioCtx = null;
  let lastBeatCycle = -1;

  function playTone(freq, durationSec, gainVal) {
    const meta = global.TaixuState && global.TaixuState.getMeta();
    if (!meta || !meta.audioEnabled) return;
    try {
      const AudioCtor = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtor) return;
      if (!audioCtx) audioCtx = new AudioCtor();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durationSec);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + durationSec);
    } catch (_err) {
      // ignore WebAudio errors in headless environments
    }
  }

  function ecgSample(u, rhythm) {
    if (rhythm === 'asystole') {
      return BASE_Y + (Math.sin(u * 40) * 0.4);
    }
    if (rhythm === 'afib') {
      const fWave = Math.sin(u * Math.PI * 14) * 2.2 + Math.cos(u * Math.PI * 22) * 1.4;
      if (u > 0.24 && u < 0.30) {
        const q = (u - 0.24) / 0.06;
        if (q < 0.25) return BASE_Y + 5;
        if (q < 0.55) return BASE_Y - 28;
        return BASE_Y + 7;
      }
      if (u > 0.40 && u < 0.58) {
        return BASE_Y - Math.sin(((u - 0.40) / 0.18) * Math.PI) * 7;
      }
      return BASE_Y + fWave;
    }

    // Hyperkalemia: flattened/absent P, widened QRS, sharp tall tented T wave
    if (rhythm === 'hyperk') {
      if (u >= 0.20 && u < 0.35) {
        const q = (u - 0.20) / 0.15;
        if (q < 0.2) return BASE_Y + 5;
        if (q < 0.5) return BASE_Y - 22;
        return BASE_Y + 8;
      }
      if (u >= 0.40 && u < 0.58) {
        const t = (u - 0.40) / 0.18;
        const peak = 1 - Math.abs(t * 2 - 1);
        return BASE_Y - Math.pow(peak, 1.3) * 27;
      }
      return BASE_Y;
    }

    // P wave
    if (u >= 0.08 && u < 0.18) {
      const p = (u - 0.08) / 0.10;
      return BASE_Y - Math.sin(p * Math.PI) * 5.5;
    }

    // QRS complex (wideqrs extends depolarization)
    const qrsEnd = rhythm === 'wideqrs' ? 0.35 : 0.29;
    if (u >= 0.22 && u < qrsEnd) {
      const q = (u - 0.22) / (qrsEnd - 0.22);
      if (q < 0.2) return BASE_Y + 6;
      if (q < 0.5) return BASE_Y - (rhythm === 'wideqrs' ? 24 : 33);
      if (q < 0.8) return BASE_Y + 10;
      return BASE_Y;
    }

    // T wave (longqt shifts & widens T wave)
    const tStart = rhythm === 'longqt' ? 0.46 : 0.38;
    const tEnd = rhythm === 'longqt' ? 0.78 : 0.56;
    if (u >= tStart && u < tEnd) {
      const t = (u - tStart) / (tEnd - tStart);
      return BASE_Y - Math.sin(t * Math.PI) * (rhythm === 'longqt' ? 11 : 8.5);
    }

    return BASE_Y;
  }

  function buildEcgPath(hr, rhythm, sweepOffset) {
    const safeHr = rhythm === 'asystole' ? 0 : Math.max(25, Math.min(200, Number(hr) || 74));
    const beatsAcross = safeHr === 0 ? 1 : Math.max(1.4, (safeHr / 60) * 2.2);
    const step = 2;
    let bgD = '';
    let liveD = '';

    for (let x = 0; x <= WIDTH; x += step) {
      const norm = (x / WIDTH) * beatsAcross;
      const u = norm - Math.floor(norm);
      const y = ecgSample(u, rhythm).toFixed(1);
      bgD += (x === 0 ? `M${x},${y}` : ` L${x},${y}`);
      if (x <= sweepOffset) {
        liveD += (x === 0 ? `M${x},${y}` : ` L${x},${y}`);
      }
    }

    const sweepNorm = (sweepOffset / WIDTH) * beatsAcross;
    const sweepU = sweepNorm - Math.floor(sweepNorm);
    const sweepY = ecgSample(sweepU, rhythm);
    return { bgD, liveD, sweepY, cycleIndex: Math.floor(sweepNorm) };
  }

  function renderTofBars(pattern, customNote) {
    const configs = {
      normal: { heights: [24, 24, 24, 24], color: 'hsl(166, 68%, 54%)', note: 'TOF 100%（4/4 無衰減）' },
      depolarized: { heights: [10, 10, 10, 10], color: 'hsl(36, 86%, 58%)', note: 'Phase I：等比縮小（無衰減）' },
      fade: { heights: [22, 15, 9, 4], color: 'hsl(20, 88%, 60%)', note: '非去極／Phase II：漸進衰減 (Fade)' },
      deep: { heights: [2, 1, 1, 1], color: 'hsl(7, 84%, 62%)', note: 'TOF 0/4 深度完全麻痺 (CICV)' },
      spastic: { heights: [26, 26, 26, 26], color: 'hsl(7, 84%, 62%)', note: '骨骼肌強直僵硬／高張痙攣' }
    };
    const cfg = configs[pattern] || configs.normal;
    for (let i = 0; i < 4; i++) {
      const bar = document.getElementById(`tof-b${i + 1}`);
      if (bar) {
        const h = cfg.heights[i];
        bar.setAttribute('height', String(h));
        bar.setAttribute('y', String(30 - h));
        bar.setAttribute('fill', cfg.color);
      }
    }
    const noteEl = document.getElementById('val-tof-note');
    if (noteEl) {
      const fmt = global.TaixuFormat;
      noteEl.innerHTML = fmt ? fmt.formatClinicalInline(customNote || cfg.note) : (customNote || cfg.note);
    }
  }

  function renderStaticMetrics(v) {
    const fmt = global.TaixuFormat;
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    const setFormatted = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = fmt ? fmt.formatClinicalInline(text) : text;
    };

    setFormatted('monitor-subject', `受測對象：${v.subject || '林玄'}`);
    setText('val-hr', v.rhythm === 'asystole' ? '0' : String(v.hr));
    setFormatted('val-rhythm', v.rhythmText || '竇性節律');
    setText('val-bp', `${v.sbp}/${v.dbp}`);
    const sbp = Number(v.sbp) || 118;
    const dbp = Number(v.dbp) || 76;
    const map = Math.round((sbp + 2 * dbp) / 3);
    const pulseP = Math.max(0, sbp - dbp);
    setText('val-map', `MAP ${map}・脈壓 ${pulseP}`);

    const bpPct = Math.max(12, Math.min(100, Math.round(((sbp - 50) / 160) * 100)));
    const barBp = document.getElementById('bar-bp');
    if (barBp) {
      barBp.style.width = `${bpPct}%`;
      barBp.style.backgroundColor =
        sbp >= 155 || sbp <= 85 ? 'hsl(7, 78%, 58%)' : 'hsl(36, 82%, 58%)';
    }

    const iop = Number(v.iop) || 15;
    setText('val-iop', String(iop));
    const iopPct = Math.max(10, Math.min(100, Math.round((iop / 60) * 100)));
    const barIop = document.getElementById('bar-iop');
    if (barIop) {
      barIop.style.width = `${iopPct}%`;
      barIop.style.backgroundColor = iop > 21 ? 'hsl(7, 78%, 58%)' : 'hsl(184, 64%, 54%)';
    }
    setText('val-iop-note', iop > 21 ? '高眼壓警示 (>21)' : '房水通暢 (10–20)');

    // 核心體溫 Temp (°C)
    const temp = typeof v.tempC === 'number' ? v.tempC : 36.8;
    setText('val-temp', temp.toFixed(1));
    const tempItem = document.getElementById('temp-item');
    if (tempItem) {
      tempItem.classList.toggle('is-danger', temp >= 39.0);
      tempItem.classList.toggle('is-warn', temp >= 37.8 && temp < 39.0);
    }
    setFormatted(
      'val-temp-note',
      temp >= 39.5 ? '惡性高熱／高溫危象！' : temp >= 38.2 ? '體溫竄升（無汗熱症）' : '體溫恆定'
    );

    // 血清血鉀 Potassium (mEq/L)
    const kVal = typeof v.potassium === 'number' ? v.potassium : 4.2;
    setText('val-k', kVal.toFixed(1));
    const kItem = document.getElementById('k-item');
    if (kItem) {
      kItem.classList.toggle('is-danger', kVal >= 5.8 || kVal <= 2.8);
      kItem.classList.toggle('is-warn', (kVal >= 5.2 && kVal < 5.8) || (kVal > 2.8 && kVal <= 3.4));
    }
    setFormatted(
      'val-k-note',
      kVal >= 5.8
        ? '致命高血鉀！急須鈣鹽穩膜'
        : kVal <= 3.4
          ? '低血鉀（β₂ FXYD1/NKCC 攝入）'
          : '正常範圍 (3.5–5.0)'
    );

    // 瞳孔：1.5mm -> r=3.8, 3.5mm -> r=9, 8.0mm -> r=17.5
    const mm = Math.max(1.2, Math.min(8.5, Number(v.pupilMm) || 3.5));
    const pupilR = (3.8 + ((mm - 1.5) / 6.5) * 13.7).toFixed(1);
    const pupilCircle = document.getElementById('pupil-circle');
    if (pupilCircle) pupilCircle.setAttribute('r', pupilR);

    const pupilTag = mm <= 2.2 ? '針尖縮瞳 (Miosis)' : mm >= 5.5 ? '散瞳放大 (Mydriasis)' : '正常調控';
    setText('val-pupil', `${mm.toFixed(1)} mm・${pupilTag}`);
    setFormatted('val-ciliary', `睫狀肌：${v.ciliary || '適度平衡'}`);

    const ciliaryRing = document.getElementById('ciliary-ring');
    if (ciliaryRing) {
      const spasm = String(v.ciliary || '').includes('痙攣') || String(v.ciliary || '').includes('收縮');
      ciliaryRing.setAttribute('stroke', spasm ? 'hsl(7, 78%, 58%)' : 'var(--yin-color)');
    }

    // 支氣管：airway 20-130%
    const airway = Math.max(20, Math.min(130, Number(v.airway) || 100));
    const lumenR = (6 + (airway / 130) * 15).toFixed(1);
    const airwayLumen = document.getElementById('airway-lumen');
    if (airwayLumen) {
      airwayLumen.setAttribute('r', lumenR);
      airwayLumen.setAttribute(
        'stroke',
        airway <= 55 ? 'hsl(7, 82%, 60%)' : airway >= 110 ? 'hsl(156, 62%, 52%)' : 'var(--yin-color)'
      );
    }
    const airwayTag = airway <= 55 ? '支氣管痙攣' : airway >= 112 ? '擴張通暢' : '氣道暢通';
    setText('val-airway', `${airwayTag} (${airway}%)`);
    setFormatted('val-secretion', `腺體分泌：${v.secretion || '正常'}`);

    const mucusGroup = document.getElementById('airway-mucus');
    if (mucusGroup) {
      const heavyMucus =
        String(v.secretion || '').includes('湧') ||
        String(v.secretion || '').includes('大量') ||
        String(v.secretion || '').includes('黏液');
      mucusGroup.setAttribute('opacity', heavyMucus ? '0.92' : '0');
    }

    // 肌終板張力 + TOF 四連刺激
    const nmj = Math.max(5, Math.min(95, Number(v.nmj) || 50));
    const nmjMarker = document.getElementById('nmj-marker');
    if (nmjMarker) nmjMarker.style.left = `${nmj}%`;
    setFormatted('val-nmj-label', v.nmjLabel || '穩健有力');
    renderTofBars(v.tofPattern || 'normal', v.tofNote);

    // ECG block alarm styling
    const ecgBlock = document.getElementById('ecg-block');
    const isDangerRhythm =
      v.rhythm === 'asystole' ||
      v.rhythm === 'wideqrs' ||
      v.rhythm === 'longqt' ||
      v.rhythm === 'hyperk';
    if (ecgBlock) ecgBlock.classList.toggle('alarm', isDangerRhythm);

    const livePath = document.getElementById('ecg-path-live');
    const sweepDot = document.getElementById('ecg-sweep-dot');
    const traceColor = isDangerRhythm ? 'hsl(7, 84%, 62%)' : 'hsl(166, 68%, 54%)';
    if (livePath) livePath.setAttribute('stroke', traceColor);
    if (sweepDot) sweepDot.setAttribute('fill', traceColor);

    // 警報印記
    const sealsEl = document.getElementById('alert-seals');
    const mobileDot = document.getElementById('mobile-monitor-dot');
    const badges = Array.isArray(v.badges) ? v.badges : [];
    let hasDanger = isDangerRhythm || airway <= 55 || temp >= 39.0 || kVal >= 5.8 || sbp >= 190 || sbp <= 78;

    if (sealsEl) {
      if (badges.length === 0) {
        sealsEl.innerHTML = '<span class="seal-tag seal-neutral">經脈平穩・無特規警報</span>';
      } else {
        sealsEl.innerHTML = '';
        badges.forEach((b) => {
          const span = document.createElement('span');
          const text = typeof b === 'string' ? b : b.text;
          const level = typeof b === 'string'
            ? (text.includes('Asystole') || text.includes('失效') || text.includes('痙攣') || text.includes('危機') || text.includes('過量') || text.includes('惡性高熱') || text.includes('高血鉀') || text.includes('休克')
                ? 'danger'
                : text.includes('BBB') || text.includes('老化') || text.includes('QT') || text.includes('去敏感') || text.includes('反彈') || text.includes('低血鉀') || text.includes('IFIS')
                  ? 'warn'
                  : 'info')
            : (b.level || 'info');
          if (level === 'danger') hasDanger = true;
          span.className = `seal-tag ${level === 'danger' ? 'seal-danger' : level === 'warn' ? 'seal-warn' : ''}`;
          span.innerHTML = fmt ? fmt.formatClinicalInline(`[${text}]`) : `[${text}]`;
          sealsEl.appendChild(span);
        });
      }
    }

    if (mobileDot) {
      mobileDot.classList.toggle('crisis', hasDanger);
    }

    // Immediate SVG path update
    const paths = buildEcgPath(v.hr, v.rhythm, WIDTH * 0.72);
    const bgPathEl = document.getElementById('ecg-path-bg');
    if (bgPathEl) bgPathEl.setAttribute('d', paths.bgD);
    if (livePath) livePath.setAttribute('d', paths.liveD);
    if (sweepDot) {
      sweepDot.setAttribute('cx', String(Math.round(WIDTH * 0.72)));
      sweepDot.setAttribute('cy', String(paths.sweepY.toFixed(1)));
    }
  }

  function tick(ts) {
    if (!currentVitals) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.08, (ts - lastTs) / 1000);
    lastTs = ts;

    phaseX += dt * 96;
    if (phaseX > WIDTH) {
      phaseX -= WIDTH;
      lastBeatCycle = -1;
    }

    const paths = buildEcgPath(currentVitals.hr, currentVitals.rhythm, phaseX);
    const bgPathEl = document.getElementById('ecg-path-bg');
    const livePathEl = document.getElementById('ecg-path-live');
    const sweepDot = document.getElementById('ecg-sweep-dot');

    if (bgPathEl) bgPathEl.setAttribute('d', paths.bgD);
    if (livePathEl) livePathEl.setAttribute('d', paths.liveD);
    if (sweepDot) {
      sweepDot.setAttribute('cx', String(phaseX.toFixed(1)));
      sweepDot.setAttribute('cy', String(paths.sweepY.toFixed(1)));
    }

    if (currentVitals.rhythm === 'asystole') {
      if (Math.floor(ts / 900) !== lastBeatCycle) {
        lastBeatCycle = Math.floor(ts / 900);
        playTone(260, 0.22, 0.04);
      }
    } else if (paths.cycleIndex !== lastBeatCycle) {
      lastBeatCycle = paths.cycleIndex;
      playTone(620, 0.045, 0.025);
    }

    rafId = global.requestAnimationFrame(tick);
  }

  function update(vitals) {
    currentVitals = Object.assign({}, global.TaixuState.DEFAULT_VITALS, vitals || {});
    renderStaticMetrics(currentVitals);
    if (!rafId && typeof global.requestAnimationFrame === 'function') {
      lastTs = 0;
      rafId = global.requestAnimationFrame(tick);
    }
  }

  function stop() {
    if (rafId) {
      global.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  global.TaixuPulseMonitor = {
    update,
    stop,
    playUiClick: function (isAlert) {
      playTone(isAlert ? 330 : 520, isAlert ? 0.14 : 0.04, 0.025);
    }
  };
})(window);
