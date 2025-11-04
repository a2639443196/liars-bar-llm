const recordGrid = document.getElementById('record-grid');
const detailPanel = document.getElementById('detail-panel');
const summaryStats = document.getElementById('summary-stats');
const toast = document.getElementById('toast');

let activeCardId = null;

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

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`请求失败：${response.status}`);
  }
  return response.json();
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

  const winnerLines = summary.winner_breakdown
    .map((item) => `${item.name} <span style="color: rgba(96,165,250,0.8)">${item.count}</span>`)
    .join('<br />');
  summaryStats.appendChild(createStatCard('胜负分布', '胜者统计', winnerLines || '暂无数据'));
}

function renderRecordList(records) {
  if (!recordGrid) return;
  recordGrid.innerHTML = '';

  if (!records.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'record-card';
    placeholder.innerHTML = '<strong>暂无可用记录</strong><p class="record-meta">请先运行游戏以生成记录。</p>';
    recordGrid.appendChild(placeholder);
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
      document.querySelectorAll('.record-card').forEach((el) => el.classList.remove('active'));
      card.classList.add('active');
      activeCardId = record.id;
      loadRecordDetail(record.id);
    });

    recordGrid.appendChild(card);
  });
}

function renderDetail(record) {
  if (!detailPanel) return;

  if (!record) {
    detailPanel.classList.add('empty-state');
    detailPanel.innerHTML = `
      <div class="empty-illustration">🜁</div>
      <p>未找到对局详情。</p>
    `;
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
  detailPanel.classList.remove('empty-state');
  detailPanel.innerHTML = '<p>加载中…</p>';
  try {
    const data = await fetchJSON(`/api/records/${recordId}`);
    renderDetail(data);
  } catch (error) {
    console.error(error);
    showToast('加载对局详情失败，请稍后再试', 'error');
    detailPanel.innerHTML = '<p>加载失败。</p>';
  }
}

async function bootstrap() {
  if (!recordGrid || !detailPanel || !summaryStats) {
    return;
  }
  try {
    const payload = await fetchJSON('/api/records');
    renderSummary(payload.summary || { total_records: 0, unique_players: [], winner_breakdown: [] });
    renderRecordList(payload.records || []);
    if (payload.records && payload.records.length) {
      const firstRecord = payload.records[0];
      const firstCard = recordGrid.querySelector(`.record-card[data-record-id="${firstRecord.id}"]`);
      if (firstCard) {
        firstCard.classList.add('active');
      }
      activeCardId = firstRecord.id;
      loadRecordDetail(firstRecord.id);
    }
  } catch (error) {
    console.error(error);
    showToast('获取对局列表失败，请检查服务端日志', 'error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
