(function (global) {
  'use strict';

  let codexData = { entries: [], referenceTables: [] };
  let endingsData = [];
  let activeTab = 'cards';
  let activeScroll = 'all';
  let searchQuery = '';
  let previewAllTables = false;

  const SCROLL_LABELS = {
    scroll_1: '總論與受體',
    scroll_2: '突觸與阻斷',
    scroll_3: '膽鹼酯與生物鹼',
    scroll_4: '臨床症候與 AChEI',
    scroll_5: '有機磷毒理'
  };

  function init(data, endings) {
    codexData = data || { entries: [], referenceTables: [] };
    endingsData = endings || [];
    bindEvents();
    refreshCounters();
  }

  function bindEvents() {
    const drawer = document.getElementById('codex-drawer');
    const backdrop = document.getElementById('codex-backdrop');
    const closeBtn = document.getElementById('btn-close-codex');
    const searchEl = document.getElementById('codex-search');

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);

    document.querySelectorAll('.codex-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab') || 'cards';
        document.querySelectorAll('.codex-tab').forEach((t) => {
          const isAct = t === btn;
          t.classList.toggle('active', isAct);
          t.setAttribute('aria-selected', String(isAct));
        });
        render();
      });
    });

    document.querySelectorAll('#scroll-filters .filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        activeScroll = chip.getAttribute('data-scroll') || 'all';
        document.querySelectorAll('#scroll-filters .filter-chip').forEach((c) => {
          c.classList.toggle('active', c === chip);
        });
        render();
      });
    });

    if (searchEl) {
      searchEl.addEventListener('input', () => {
        searchQuery = searchEl.value.trim().toLowerCase();
        render();
      });
    }

    if (drawer) {
      drawer.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
      });
    }
  }

  function refreshCounters() {
    const meta = global.TaixuState.getMeta();
    const total = codexData.entries ? codexData.entries.length : 36;
    const unlocked = meta.unlockedCodex.length;

    const badge = document.getElementById('codex-progress-badge');
    if (badge) badge.textContent = `${unlocked}/${total}`;

    const summary = document.getElementById('codex-unlock-summary');
    if (summary) summary.textContent = `已解鎖 ${unlocked} / ${total} 項核心考點（隨劇情自動拓印保存）`;

    const wrongCount = document.getElementById('tab-wrong-count');
    if (wrongCount) wrongCount.textContent = `(${meta.wrongNotes.length})`;

    const statCodex = document.getElementById('stat-codex-count');
    if (statCodex) statCodex.textContent = `${unlocked} / ${total}`;

    const statEndings = document.getElementById('stat-endings-count');
    if (statEndings) statEndings.textContent = `${meta.unlockedEndings.length} / ${endingsData.length || 7}`;

    const statWrong = document.getElementById('stat-wrong-count');
    if (statWrong) statWrong.textContent = String(meta.wrongNotes.length);
  }

  function open(tabName) {
    if (tabName) {
      activeTab = tabName;
      document.querySelectorAll('.codex-tab').forEach((t) => {
        const isAct = t.getAttribute('data-tab') === activeTab;
        t.classList.toggle('active', isAct);
        t.setAttribute('aria-selected', String(isAct));
      });
    }
    refreshCounters();
    render();
    document.getElementById('codex-backdrop').hidden = false;
    document.getElementById('codex-drawer').hidden = false;
  }

  function close() {
    document.getElementById('codex-backdrop').hidden = true;
    document.getElementById('codex-drawer').hidden = true;
  }

  function render() {
    const toolbar = document.getElementById('codex-toolbar');
    const content = document.getElementById('codex-content');
    if (!content) return;

    if (toolbar) toolbar.hidden = activeTab !== 'cards';

    if (activeTab === 'cards') {
      renderCards(content);
    } else if (activeTab === 'tables') {
      renderTables(content);
    } else if (activeTab === 'wrong') {
      renderWrongNotes(content);
    } else if (activeTab === 'endings') {
      renderEndings(content);
    }
  }

  function renderCards(container) {
    const meta = global.TaixuState.getMeta();
    const unlockedSet = new Set(meta.unlockedCodex);
    const entries = codexData.entries || [];

    const filtered = entries.filter((entry) => {
      if (activeScroll !== 'all' && entry.scroll !== activeScroll) return false;
      if (!searchQuery) return true;
      const hay = [
        entry.title,
        entry.subtitle,
        entry.summary,
        ...(entry.keyPoints || []),
        ...(entry.drugs || []),
        entry.trapAlert || ''
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(searchQuery);
    });

    if (filtered.length === 0) {
      container.innerHTML = '<p style="color:var(--ink-muted)">查無符合條件的丹譜條目，請嘗試更換關鍵字或卷宗分類。</p>';
      return;
    }

    container.innerHTML = '';
    filtered.forEach((entry) => {
      const isUnlocked = unlockedSet.has(entry.num);
      const card = document.createElement('article');
      card.className = `codex-card ${isUnlocked ? 'unlocked' : 'locked'}`;

      const scrollName = SCROLL_LABELS[entry.scroll] || entry.scroll;
      if (!isUnlocked) {
        card.innerHTML = `
          <div class="codex-card-head">
            <span class="codex-num">#${String(entry.num).padStart(2, '0')}・${scrollName}</span>
            <span class="codex-num">尚未解鎖</span>
          </div>
          <h3>${escapeHtml(entry.title)}</h3>
          <p style="margin:0;font-size:0.84rem;color:var(--ink-muted)">於試煉中遭遇此卷考點後自動拓印全文與記憶口訣。</p>
        `;
      } else {
        const pointsHtml = (entry.keyPoints || []).map((pt) => `<li>${escapeHtml(pt)}</li>`).join('');
        const drugsHtml = (entry.drugs || [])
          .map((d) => `<span class="drug-badge">${escapeHtml(d)}</span>`)
          .join('');
        const trapHtml = entry.trapAlert
          ? `<div class="trap-box"><strong>國考與臨床地雷：</strong>${escapeHtml(entry.trapAlert)}</div>`
          : '';
        card.innerHTML = `
          <div class="codex-card-head">
            <span class="codex-num">#${String(entry.num).padStart(2, '0')}・第${entry.vol}卷・${scrollName}</span>
            <span class="unlock-tag">已拓印</span>
          </div>
          <h3>${escapeHtml(entry.title)}</h3>
          <p style="margin:0 0 6px;font-size:0.88rem;color:var(--ink-secondary)">${escapeHtml(entry.summary)}</p>
          <ul class="codex-points">${pointsHtml}</ul>
          ${drugsHtml ? `<div class="codex-drugs">${drugsHtml}</div>` : ''}
          ${trapHtml}
        `;
      }
      container.appendChild(card);
    });
  }

  function renderTables(container) {
    const meta = global.TaixuState.getMeta();
    const tables = codexData.referenceTables || [];
    container.innerHTML = '';

    const ctrlBar = document.createElement('div');
    ctrlBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;flex-wrap:wrap;';
    ctrlBar.innerHTML = `
      <span style="font-size:0.85rem;color:var(--ink-muted)">完整總表收錄於此，避免對話中堆砌長表。</span>
      <label style="font-size:0.84rem;cursor:pointer;display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="chk-preview-all-tables" ${previewAllTables ? 'checked' : ''}>
        <span>考前速查（預覽全部總表）</span>
      </label>
    `;
    container.appendChild(ctrlBar);

    const chk = ctrlBar.querySelector('#chk-preview-all-tables');
    if (chk) {
      chk.addEventListener('change', () => {
        previewAllTables = chk.checked;
        renderTables(container);
      });
    }

    tables.forEach((tbl) => {
      const unlocked = previewAllTables || meta.unlockedTables.indexOf(tbl.id) !== -1;
      const wrap = document.createElement('section');
      wrap.className = 'ref-table-wrap';

      if (!unlocked) {
        wrap.innerHTML = `
          <h3 class="ref-table-title">${escapeHtml(tbl.title)}（尚未解鎖）</h3>
          <p style="margin:12px 14px;font-size:0.84rem;color:var(--ink-muted)">推展對應章節劇情即可解鎖，或勾選上方「考前速查」直接查閱。</p>
        `;
      } else {
        const ths = (tbl.headers || []).map((h) => `<th>${escapeHtml(h)}</th>`).join('');
        const trs = (tbl.rows || [])
          .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
          .join('');
        wrap.innerHTML = `
          <h3 class="ref-table-title">${escapeHtml(tbl.title)}</h3>
          <table class="ref-table">
            <thead><tr>${ths}</tr></thead>
            <tbody>${trs}</tbody>
          </table>
        `;
      }
      container.appendChild(wrap);
    });
  }

  function renderWrongNotes(container) {
    const meta = global.TaixuState.getMeta();
    const notes = meta.wrongNotes || [];
    container.innerHTML = '';

    if (notes.length === 0) {
      container.innerHTML = '<p style="color:var(--ink-muted)">目前尚無錯題紀錄。若於試煉中觸發藥理危機或誤選誘答，系統將自動記載真實病理演繹與正統機轉於此。</p>';
      return;
    }

    notes.forEach((n) => {
      const card = document.createElement('article');
      card.className = 'wrong-card';
      card.innerHTML = `
        <h4>${escapeHtml(n.title)} ${n.count > 1 ? `<span class="codex-num">累計 ${n.count} 次</span>` : ''}</h4>
        <p><strong>誤選方案：</strong>${escapeHtml(n.picked)}</p>
        <p><strong>病理演繹與校正：</strong>${escapeHtml(n.explanation)}</p>
      `;
      container.appendChild(card);
    });
  }

  function renderEndings(container) {
    const meta = global.TaixuState.getMeta();
    const unlockedSet = new Set(meta.unlockedEndings || []);
    container.innerHTML = '';

    endingsData.forEach((ed) => {
      const unlocked = unlockedSet.has(ed.id);
      const card = document.createElement('article');
      card.className = `codex-card ${unlocked ? '' : 'locked'}`;
      card.innerHTML = `
        <div class="codex-card-head">
          <span class="codex-num">${escapeHtml(ed.seal || '結局')}</span>
          <span class="${unlocked ? 'unlock-tag' : 'codex-num'}">${unlocked ? '已達成' : '未達成'}</span>
        </div>
        <h3>${escapeHtml(ed.title)}</h3>
        <p style="margin:0 0 6px;font-size:0.86rem;color:var(--ink-secondary)">${escapeHtml(unlocked ? ed.summary : ed.unlockHint)}</p>
      `;
      container.appendChild(card);
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  global.TaixuCodex = {
    init,
    open,
    close,
    refreshCounters
  };
})(window);
