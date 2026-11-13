// main09.js — UI Controller for Binh Minh (De 09) 7-Step AI Agent

import {
  normalizeBinhMinhDataset,
  parseUploadedFiles09,
  fetchGoogleSheet09
} from './dataLoader09.js';
import { runBinhMinhAgent, formatVND } from './agent09.js';

let currentDataset = null;
let currentResult = null;
const el = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Screen 1 -> Screen 2 (auto-load & auto-run so dashboard is never empty)
el('btnStartProcess').addEventListener('click', async () => {
  el('welcomeScreen').classList.add('hidden');
  el('dashboardScreen').classList.remove('hidden');
  if (!currentDataset) {
    try { await loadSample1(); } catch (_e) {}
  }
  if (currentDataset && !currentResult) {
    await executeAgent();
  }
});

el('btnJumpTop5').addEventListener('click', () => {
  const btn = document.querySelector('.tab-pill[data-tab="tab-top5"]');
  if (btn) btn.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

el('btnBackWelcome').addEventListener('click', () => {
  el('dashboardScreen').classList.add('hidden');
  el('welcomeScreen').classList.remove('hidden');
});

document.querySelectorAll('.tab-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-pill').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    el(btn.dataset.tab).classList.add('active');
  });
});

el('tabFileMode').addEventListener('click', () => {
  el('tabFileMode').classList.add('active');
  el('tabSheetMode').classList.remove('active');
  el('fileModeBox').style.display = 'block';
  el('sheetModeBox').style.display = 'none';
});
el('tabSheetMode').addEventListener('click', () => {
  el('tabSheetMode').classList.add('active');
  el('tabFileMode').classList.remove('active');
  el('sheetModeBox').style.display = 'block';
  el('fileModeBox').style.display = 'none';
});

function resetSteps() {
  [1, 2, 3, 4, 5, 6, 7].forEach(n => {
    const node = el(`step${n}`);
    node.classList.remove('done', 'active');
    node.textContent = String(n);
  });
  el('flowStatusPill').textContent = 'Sẵn sàng';
}

function setDataset(ds, label) {
  currentDataset = ds;
  el('reportDate').value = ds.default_report_date || '2026-11-12';
  el('btnRunAgent').disabled = !ds || !ds.opportunities || ds.opportunities.length === 0;
  el('loadedSummary').innerHTML = `<strong>${esc(label)}:</strong> ${ds.opportunities.length} bản ghi cơ hội • ${ds.orders.length} đơn hàng • ${ds.sales_reps.length} NVKD.`;
  el('agentCallout').innerHTML = `Đã nạp dữ liệu <em>${esc(label)}</em>. Chọn ngày đối chiếu và bấm <strong>CHẠY AGENT</strong>.`;
  resetSteps();
}

async function loadSample1() {
  el('btnSample1').classList.add('active');
  el('btnSample2').classList.remove('active');
  const resp = await fetch('/data/sample_binh_minh_data.json');
  const raw = await resp.json();
  const ds = normalizeBinhMinhDataset(raw);
  setDataset(ds, 'Mẫu 1 (10 NVKD Chuẩn)');
  return ds;
}

async function loadSample2LessThan5() {
  el('btnSample2').classList.add('active');
  el('btnSample1').classList.remove('active');
  const resp = await fetch('/data/sample_binh_minh_data.json');
  const raw = await resp.json();
  // Keep only 3 valid open opportunities + anomalies to test "<5 valid opportunities" rule
  const subset = raw.opportunities.filter(o => !['BM-003', 'BM-004', 'BM-005'].includes(o.opp_id));
  const ds = normalizeBinhMinhDataset({ ...raw, opportunities: subset });
  setDataset(ds, 'Mẫu 2 (<5 cơ hội hợp lệ)');
  return ds;
}

el('btnSample1').addEventListener('click', async () => { await loadSample1(); await executeAgent(); });
el('btnSample2').addEventListener('click', async () => { await loadSample2LessThan5(); await executeAgent(); });
el('btnResetData').addEventListener('click', () => {
  currentDataset = null;
  currentResult = null;
  el('btnRunAgent').disabled = true;
  el('btnExportAll').disabled = true;
  el('loadedSummary').textContent = 'Đã reset dữ liệu.';
  resetSteps();
});

el('fileInput').addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || !files.length) return;
  try {
    const ds = await parseUploadedFiles09(files);
    setDataset(ds, Array.from(files).map(f => f.name).join(', '));
  } catch (err) {
    alert('Lỗi đọc file: ' + err.message);
  }
});

el('btnLoadGSheet').addEventListener('click', async () => {
  const url = el('gsheetUrl').value.trim();
  if (!url) return alert('Vui lòng dán link Google Sheet.');
  el('btnLoadGSheet').disabled = true;
  el('btnLoadGSheet').textContent = 'Đang tải...';
  try {
    const ds = await fetchGoogleSheet09(url);
    setDataset(ds, 'Google Sheet');
  } catch (err) {
    alert('Lỗi Google Sheet: ' + err.message);
  } finally {
    el('btnLoadGSheet').disabled = false;
    el('btnLoadGSheet').textContent = 'Tải dữ liệu Google Sheet';
  }
});

async function executeAgent() {
  if (!currentDataset) return;
  const reportDate = el('reportDate').value || '2026-11-12';
  el('btnRunAgent').disabled = true;
  el('flowStatusPill').textContent = 'Đang chạy...';
  resetSteps();

  for (let n = 1; n <= 7; n++) {
    el(`step${n}`).classList.add('active');
    await new Promise(r => setTimeout(r, 65));
    el(`step${n}`).classList.remove('active');
    el(`step${n}`).classList.add('done');
    el(`step${n}`).textContent = '✓';
  }

  currentResult = runBinhMinhAgent(currentDataset, reportDate);
  el('flowStatusPill').textContent = 'Hoàn thành';
  el('agentCallout').innerHTML = `Hoàn tất đối chiếu tại ngày <strong>${esc(reportDate)}</strong> • Đã ghi <strong>${currentResult.audit_logs.length}</strong> bước Audit Log.`;
  el('btnExportAll').disabled = false;
  el('btnRunAgent').disabled = false;

  renderResults(currentResult);
  saveLogsToServer(currentResult);
}

el('btnRunAgent').addEventListener('click', executeAgent);

async function saveLogsToServer(res) {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_date: res.report_date, summary: res.summary, audit_logs: res.audit_logs })
    });
  } catch (_e) {}
}

function renderResults(res) {
  const s = res.summary;
  el('hlRecognizedSales').textContent = formatVND(s.total_recognized_sales_vnd);
  el('hlCompletionPct').textContent = `${s.overall_completion_pct}% Mục tiêu`;
  el('hlWeightedForecast').textContent = formatVND(s.total_weighted_forecast_vnd);
  el('hlOpenRaw').textContent = formatVND(s.total_open_raw_vnd);
  el('hlAnomalyBadge').textContent = `${s.anomaly_count} Cảnh báo`;
  el('hlTopNote').textContent = s.top_note;

  el('repTableBody').innerHTML = res.rep_kpis.map(r => `
    <tr>
      <td><strong>${esc(r.name)}</strong><br><span class="muted">${esc(r.rep_id)}</span></td>
      <td>${formatVND(r.target_vnd)}</td>
      <td><strong>${formatVND(r.recognized_sales_vnd)}</strong></td>
      <td><span class="chip ${r.completion_pct >= 80 ? 'chip-green' : r.completion_pct >= 40 ? 'chip-amber' : 'chip-red'}">${r.completion_pct}%</span></td>
      <td>${formatVND(r.open_value_vnd)} (${r.open_count})</td>
      <td><strong>${formatVND(r.weighted_forecast_vnd)}</strong></td>
      <td>${r.anomaly_count > 0 ? `<span class="chip chip-amber">${r.anomaly_count} cảnh báo</span>` : '<span class="muted">0</span>'}</td>
    </tr>
  `).join('');

  el('top5CountBadge').textContent = `${res.top_priorities.length}/5 cơ hội`;
  el('top5ReasonBanner').textContent = s.top_note;
  el('top5TableBody').innerHTML = res.top_priorities.length === 0
    ? '<tr><td colspan="5" class="muted">Không có cơ hội hợp lệ nào đạt tiêu chí ưu tiên.</td></tr>'
    : res.top_priorities.map((t, i) => `
      <tr>
        <td><strong>#${i + 1}</strong></td>
        <td><strong>${esc(t.opp_id)} — ${esc(t.customer)}</strong><br><span class="muted">NVKD: ${esc(t.rep_id)} • Dự kiến chốt: ${esc(t.expected_close_date)}</span></td>
        <td><strong>${formatVND(t.value_vnd)}</strong><br><span class="muted">Trọng số: ${Math.round(t.weight * 100)}%</span></td>
        <td><span class="chip chip-purple">${t.priority_score} đ</span></td>
        <td>${esc(t.rationale)}<br><strong>Việc cần làm:</strong> ${esc(t.next_week_action)}</td>
      </tr>
    `).join('');

  el('anomaliesTableBody').innerHTML = res.anomalies.map(a => `
    <tr>
      <td><strong>${esc(a.opp_id)}</strong></td>
      <td>${esc(a.customer)}</td>
      <td><span class="chip ${a.anomaly_type.includes('Mâu thuẫn') ? 'chip-red' : 'chip-amber'}">${esc(a.anomaly_type)}</span></td>
      <td>${esc(a.reason)}</td>
      <td class="muted">${esc(a.action)}</td>
    </tr>
  `).join('');

  el('cleanOppsTableBody').innerHTML = res.opportunities.map(o => `
    <tr>
      <td><strong>${esc(o.opp_id)}</strong>${o.was_duplicated ? ' <span class="chip chip-purple">Đã gộp trùng</span>' : ''}</td>
      <td>${esc(o.customer)}</td>
      <td>${esc(o.effective_stage)}</td>
      <td>${formatVND(o.value_vnd)}</td>
      <td>${Math.round(o.weight * 100)}%</td>
      <td><strong>${formatVND(o.weighted_value)}</strong></td>
      <td><span class="chip ${o.include_in_open_pipeline ? 'chip-green' : 'chip-amber'}">${esc(o.final_category)}</span></td>
    </tr>
  `).join('');

  el('auditTableBody').innerHTML = res.audit_logs.map(l => `
    <tr>
      <td>${l.seq}</td>
      <td>${esc(l.step)}</td>
      <td><strong>${esc(l.entity_id)}</strong></td>
      <td><code>${esc(l.tool)}</code></td>
      <td style="max-width:300px;"><div class="pre-box">IN: ${esc(JSON.stringify(l.input))}\nOUT: ${esc(JSON.stringify(l.output))}</div></td>
      <td class="muted">${esc(l.rule_applied)}</td>
    </tr>
  `).join('');
}

el('btnExportAll').addEventListener('click', () => {
  if (!currentResult) return;
  const blob = new Blob([JSON.stringify(currentResult, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `binh_minh_de09_${currentResult.report_date}.json`;
  a.click();
});

el('btnRunSelfTest').addEventListener('click', async () => {
  const ds1 = await loadSample1();
  const res1 = runBinhMinhAgent(ds1, '2026-11-12');
  const ds2 = await loadSample2LessThan5();
  const res2 = runBinhMinhAgent(ds2, '2026-11-12');

  const checks = [
    { name: 'Hợp nhất bản ghi trùng BM-001', ok: res1.opportunities.filter(o => o.opp_id === 'BM-001').length === 1 },
    { name: 'Tách doanh số đã bán (BM-009, BM-011 không nằm trong mở)', ok: !res1.opportunities.find(o => o.opp_id === 'BM-009').include_in_open_pipeline && !res1.opportunities.find(o => o.opp_id === 'BM-011').include_in_open_pipeline },
    { name: 'Phát hiện mất khách chưa đổi trạng thái (BM-008)', ok: res1.opportunities.find(o => o.opp_id === 'BM-008').anomaly_type === 'Mâu thuẫn trạng thái' },
    { name: 'Phát hiện quá hạn không hoạt động (BM-007)', ok: res1.opportunities.find(o => o.opp_id === 'BM-007').anomaly_type === 'Quá hạn không hoạt động' },
    { name: 'Loại cơ hội giá trị lớn thiếu xác nhận (BM-006 = 950tr) khỏi Top 5', ok: !res1.top_priorities.some(t => t.opp_id === 'BM-006') },
    { name: 'Mẫu 1 chọn đủ 5 cơ hội hợp lệ', ok: res1.top_priorities.length === 5 },
    { name: 'Mẫu 2 chưa đủ 5 cơ hội hợp lệ -> nêu đúng số thực tế (<5)', ok: res2.top_priorities.length < 5 && res2.summary.top_note.includes('/') }
  ];

  el('selfTestResults').innerHTML = `
    <p><strong>Kết quả Self-Test Đề 09: ${checks.filter(c => c.ok).length}/${checks.length} ĐẠT</strong></p>
    <table>
      <thead><tr><th>Kiểm thử quy tắc</th><th>Kết quả</th></tr></thead>
      <tbody>${checks.map(c => `<tr><td>${esc(c.name)}</td><td>${c.ok ? '<span class="chip chip-green">PASS</span>' : '<span class="chip chip-red">FAIL</span>'}</td></tr>`).join('')}</tbody>
    </table>
  `;
});

