const recordGrid = document.getElementById('record-grid');
const detailPanel = document.getElementById('detail-panel');
const summaryStats = document.getElementById('summary-stats');
const toast = document.getElementById('toast');
const startGameBtn = document.getElementById('start-game-btn');

const urlParams = new URLSearchParams(window.location.search);
let activeCardId = null;
let pendingRecordId = urlParams.get('record') || null;
let gameTaskTimer = null;
const startButtonDefaultLabel = startGameBtn?.dataset.defaultLabel || startGameBtn?.textContent || '开始新对局';

function showToast(message, tone = 'info') {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.add('visible');
  toast.dataset.tone = tone;
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 2600);
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || `请求失败：${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload ?? {};
}

function createStatCard(value, label, footer = '') {
  const card = document.createElement('div');
  card.className = 'stat-card';
  card.innerHTML = `
    <div class="stat-value">${value}</div>
    <div class="stat-label">${label}</div>
    ${footer ? `<div class="stat-footer">${footer}</div>` : ''}
  `;
  return card;
}

function renderSummary(summary) {
  if (!summaryStats) return;
  summaryStats.innerHTML = '';

  summaryStats.appendChild(createStatCard(summary.total_records, '总对局数', '可浏览的历史记录数量'));

  const uniquePlayers = summary.unique_players || [];
  summaryStats.appendChild(
    createStatCard(uniquePlayers.length, '参与模型', uniquePlayers.map((name) => `· ${name}`).join('<br />'))
  );

  const winnerLines = (summary.winner_breakdown || [])
    .map((item) => `${item.name} <span style="color: rgba(96,165,250,0.8)">${item.count}</span>`)
    .join('<br />');
  summaryStats.appendChild(createStatCard('胜负分布', '胜者统计', winnerLines || '暂无数据'));
}

function updateRecordParam(recordId) {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  if (recordId) {
    url.searchParams.set('record', recordId);
  }
  url.searchParams.delete('record_path');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function renderEmptyDetail(message = '未找到对局详情。') {
  if (!detailPanel) return;
  detailPanel.classList.add('empty-state');
  detailPanel.innerHTML = `
    <div class="empty-illustration">🜁</div>
    <p>${message}</p>
  `;
}

function setActiveRecord(recordId, options = {}) {
  if (!recordGrid || !recordId) return false;
  const { force = false, updateUrl = true } = options;
  const card = recordGrid.querySelector(`.record-card[data-record-id="${recordId}"]`);
  if (!card) {
    return false;
  }

  pendingRecordId = null;

  if (!force && activeCardId === recordId) {
    if (updateUrl) {
      updateRecordParam(recordId);
    }
    return true;
  }

  recordGrid.querySelectorAll('.record-card').forEach((el) => el.classList.remove('active'));
  card.classList.add('active');
  activeCardId = recordId;
  if (updateUrl) {
    updateRecordParam(recordId);
  }
  loadRecordDetail(recordId);
  return true;
}

function renderRecordList(records, options = {}) {
  if (!recordGrid) return;
  const { preferredId = null, forceDetail = false } = options;

  recordGrid.innerHTML = '';

  if (!records.length) {
    activeCardId = null;
    const placeholder = document.createElement('div');
    placeholder.className = 'record-card';
    placeholder.innerHTML = '<strong>暂无可用记录</strong><p class="record-meta">点击右上角按钮开始新对局。</p>';
    recordGrid.appendChild(placeholder);
    renderEmptyDetail('暂无对局记录，请先运行一局游戏。');
    return;
  }

  records.forEach((record) => {
    const card = document.createElement('div');
    card.className = 'record-card';
    card.dataset.recordId = record.id;

    card.innerHTML = `
      <div class="record-title">
        <span>${record.name}</span>
        <span class="badge">${record.round_count} Rounds</span>
      </div>
      <div class="record-meta">
        <span>胜者：<strong>${record.winner || '未知'}</strong></span>
        <span>玩家：${(record.players || []).join(' · ') || '未知'}</span>
        <span>更新时间：${record.updated_at}</span>
        <span>来源：${record.source}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      setActiveRecord(record.id, { force: true });
    });

    recordGrid.appendChild(card);
  });

  const targetCandidates = [];
  if (preferredId) {
    targetCandidates.push(preferredId);
    const exists = records.some((record) => record.id === preferredId);
    if (!exists) {
      showToast('未找到指定的对局记录', 'error');
      if (preferredId === pendingRecordId) {
        pendingRecordId = null;
      }
    }
  }
  if (pendingRecordId && !targetCandidates.includes(pendingRecordId)) {
    targetCandidates.push(pendingRecordId);
  }
  if (activeCardId && !targetCandidates.includes(activeCardId)) {
    targetCandidates.push(activeCardId);
  }
  if (!targetCandidates.length && records[0]) {
    targetCandidates.push(records[0].id);
  }

  let selected = false;
  for (const candidate of targetCandidates) {
    if (!candidate) continue;
    const shouldForce = forceDetail || candidate === pendingRecordId;
    if (setActiveRecord(candidate, { force: shouldForce })) {
      selected = true;
      break;
    }
  }

  if (!selected && records[0]) {
    setActiveRecord(records[0].id, { force: true });
  }
}

function renderDetail(record) {
  if (!detailPanel) return;

  if (!record) {
    renderEmptyDetail('未找到对局详情。');
    return;
  }

  detailPanel.classList.remove('empty-state');

  const roundsHTML = (record.rounds || [])
    .map((round) => {
      const history = (round.history || [])
        .map((event) => {
          const challengeState =
            event.was_challenged === true
              ? `<span class="badge warning">被质疑</span>`
              : event.was_challenged === false
              ? `<span class="badge">无人质疑</span>`
              : `<span class="badge">未记录</span>`;

          let challengeResult = '';
          if (event.was_challenged === true) {
            if (event.challenge_result === true) {
              challengeResult = '<span style="color: var(--success)">质疑成功</span>';
            } else if (event.challenge_result === false) {
              challengeResult = '<span style="color: var(--danger)">质疑失败</span>';
            } else {
              challengeResult = '<span>质疑结果未知</span>';
            }
          }

          const playedCards = (event.played_cards || []).join(' · ') || '未记录';

          return `
            <div class="history-card">
              <div class="history-topline">
                <strong>${event.player || '未知玩家'}</strong>
                ${challengeState}
              </div>
              <div class="history-body">
                <span>出牌：${playedCards}</span>
                ${event.behavior ? `<span>行为：${event.behavior}</span>` : ''}
                ${event.play_reason ? `<span>理由：${event.play_reason}</span>` : ''}
                ${event.challenge_reason ? `<span>质疑动机：${event.challenge_reason}</span>` : ''}
                ${challengeResult}
                ${event.next_player ? `<span>下一位：${event.next_player}</span>` : ''}
              </div>
            </div>
          `;
        })
        .join('');

      const result = round.round_result || {};
      const resultSummary = result.bullet_hit === true
        ? `<span style="color: var(--danger)">中弹淘汰：${result.shooter_name || '未知'}</span>`
        : result.bullet_hit === false
        ? `<span style="color: var(--success)">未命中 · 射手：${result.shooter_name || '未知'}</span>`
        : '无射击记录';

      return `
        <article class="round-card">
          <div class="round-header">
            <h3>第 ${round.round_id || '?'} 回合</h3>
            <div class="round-meta">
              <span>目标牌：${round.target_card || '-'}</span>
              <span>先手：${round.starting_player || '-'}</span>
              <span>${resultSummary}</span>
            </div>
          </div>
          <div class="history-grid">
            ${history || '<span style="color: var(--text-secondary)">暂无出牌信息</span>'}
          </div>
        </article>
      `;
    })
    .join('');

  detailPanel.innerHTML = `
    <div class="detail-header">
      <div class="badge winner">胜者：${record.winner || '未知'}</div>
      <div>Game ID：${record.game_id || '未记录'}</div>
      <div class="player-list">
        ${(record.players || []).map((name) => `<span class="player-chip">${name}</span>`).join('') || '暂无玩家信息'}
      </div>
    </div>
    <div class="rounds-wrapper">
      ${roundsHTML || '<p style="color: var(--text-secondary)">未查询到回合详情</p>'}
    </div>
  `;
}

async function loadRecordDetail(recordId) {
  if (!detailPanel) return;
  detailPanel.classList.remove('empty-state');
  detailPanel.innerHTML = '<p>加载中…</p>';
  try {
    const data = await fetchJSON(`/api/records/${recordId}`);
    renderDetail(data);
  } catch (error) {
    console.error(error);
    showToast('加载对局详情失败，请稍后再试', 'error');
    renderEmptyDetail('加载失败，请稍后重试。');
  }
}

async function refreshDashboard(preferredId = null, options = {}) {
  if (!recordGrid || !detailPanel || !summaryStats) {
    return;
  }
  try {
    const payload = await fetchJSON('/api/records');
    renderSummary(payload.summary || { total_records: 0, unique_players: [], winner_breakdown: [] });
    const targetId = preferredId || pendingRecordId || null;
    renderRecordList(payload.records || [], { preferredId: targetId, forceDetail: options.forceDetail });
  } catch (error) {
    console.error(error);
    showToast('获取对局列表失败，请检查服务端日志', 'error');
  }
}

function setStartButtonState({ label = startButtonDefaultLabel, disabled = false } = {}) {
  if (!startGameBtn) return;
  startGameBtn.textContent = label;
  startGameBtn.disabled = disabled;
}

function clearGameTaskTimer() {
  if (gameTaskTimer) {
    clearTimeout(gameTaskTimer);
    gameTaskTimer = null;
  }
}

function monitorGameTask(taskId) {
  if (!taskId) {
    setStartButtonState({ label: startButtonDefaultLabel, disabled: false });
    return;
  }

  const poll = async () => {
    try {
      const payload = await fetchJSON(`/api/games/${taskId}`);
      if (payload.status === 'running') {
        gameTaskTimer = window.setTimeout(poll, 3500);
        return;
      }

      clearGameTaskTimer();
      setStartButtonState({ label: startButtonDefaultLabel, disabled: false });

      if (payload.status === 'finished') {
        const recordId = payload.record_id || null;
        pendingRecordId = recordId;
        showToast('新对局完成，已更新记录列表');
        await refreshDashboard(recordId, { forceDetail: true });
      } else if (payload.status === 'failed') {
        showToast(`对局运行失败：${payload.error || '未知错误'}`, 'error');
      }
    } catch (error) {
      console.error(error);
      clearGameTaskTimer();
      setStartButtonState({ label: startButtonDefaultLabel, disabled: false });
      showToast('轮询对局状态失败，请查看日志', 'error');
    }
  };

  poll();
}

async function handleStartGame() {
  if (!startGameBtn) return;
  try {
    setStartButtonState({ label: '正在启动…', disabled: true });
    const payload = await fetchJSON('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    showToast('已发起新对局，生成记录后将自动刷新');
    setStartButtonState({ label: '对局运行中…', disabled: true });
    clearGameTaskTimer();
    monitorGameTask(payload.task_id);
  } catch (error) {
    console.error(error);
    setStartButtonState({ label: startButtonDefaultLabel, disabled: false });
    showToast(error.message || '启动对局失败', 'error');
  }
}

async function bootstrap() {
  await refreshDashboard(pendingRecordId);
  if (startGameBtn) {
    startGameBtn.addEventListener('click', handleStartGame);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
