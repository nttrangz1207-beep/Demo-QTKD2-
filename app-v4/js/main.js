// main.js — AI301 Minh An Pastel Dashboard + Pink Welcome Screen

import {
  parseCSV,
  normalizeDataset,
  parseUploadedFiles,
  fetchGoogleSheetDataset
} from './dataLoader.js';
import { runAgentPipeline, formatVND } from './agentSkills.js';

let currentDataset = null;
let currentResult = null;

const el = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusChip(status) {
  switch (status) {
    case 'Có thể tiếp tục': return '<span class="chip chip-green">✓ Tiếp tục</span>';
    case 'Chờ duyệt': return '<span class="chip chip-purple">⏳ Chờ duyệt</span>';
    case 'Cần bổ sung thông tin': return '<span class="chip chip-amber">⚠ Bổ sung</span>';
    case 'Chưa đáp ứng': return '<span class="chip chip-red">✕ Chưa ĐƯ</span>';
    default: return `<span class="chip">${escapeHtml(status)}</span>`;
  }
}

// Session ID pill
const now = new Date();
el('sessionIdPill').textContent = `MA-${now.toISOString().slice(0,10).replace(/-/g,'')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;

// Screen 1 -> Screen 2 transition
el('btnStartProcess').addEventListener('click', async () => {
  el('welcomeScreen').classList.add('hidden');
  el('dashboardScreen').classList.remove('hidden');
  if (!currentDataset) {
    try { await loadSample1(); } catch (_e) {}
  }
});

el('btnBackWelcome').addEventListener('click', () => {
  el('dashboardScreen').classList.add('hidden');
  el('welcomeScreen').classList.remove('hidden');
});

el('btnToggleSettings').addEventListener('click', () => {
  const bar = el('settingsBar');
  bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
});

el('llmProvider').addEventListener('change', (e) => {
  const v = e.target.value;
  el('llmApiKey').style.display = v === 'offline' ? 'none' : 'inline-block';
  el('modeBadge').textContent = v === 'offline' ? 'offline_rule_engine' : `${v}_tool_agent`;
});

// Tabs
document.querySelectorAll('.tab-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-pill').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    el(btn.dataset.tab).classList.add('active');
  });
});

// File / Sheet mode switch
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

function setSampleActive(btnId) {
  ['btnSample1', 'btnSample2', 'btnSample3'].forEach(id => el(id).classList.remove('active'));
  if (btnId) el(btnId).classList.add('active');
}

function setDataset(ds, label) {
  currentDataset = ds;
  el('btnRunAgent').disabled = !ds || !ds.requests || ds.requests.length === 0;
  el('loadedSummary').innerHTML = `<strong>${escapeHtml(label)}:</strong> ${ds.requests.length} yêu cầu • ${ds.products.length} sản phẩm • ${ds.policies.length} chính sách.`;
  el('agentCallout').innerHTML = `Đã sẵn sàng <strong>${ds.requests.length} yêu cầu</strong> từ <em>${escapeHtml(label)}</em>. Bấm <strong>CHẠY AGENT</strong> để bắt đầu.`;
  resetSteps();
}

function resetSteps() {
  [1, 2, 3, 4].forEach(n => {
    const node = el(`step${n}`);
    node.classList.remove('done', 'active');
    node.textContent = String(n);
  });
  el('flowStatusPill').textContent = 'Sẵn sàng';
}

async function loadSample1() {
  setSampleActive('btnSample1');
  const resp = await fetch('/data/sample_minh_an_data.json');
  const raw = await resp.json();
  const ds = normalizeDataset({ requests: raw.requests, products: raw.products, policies: raw.policies });
  setDataset(ds, 'Mẫu 1 (Chuẩn Đề 01)');
  return ds;
}

async function loadSample2Missing() {
  setSampleActive('btnSample2');
  const resp = await fetch('/data/sample_minh_an_data.json');
  const raw = await resp.json();
  const subset = raw.requests.filter(r => ['YC-005', 'YC-006', 'YC-007', 'YC-008', 'YC-009', 'YC-010'].includes(r.request_id));
  const ds = normalizeDataset({ requests: subset, products: raw.products, policies: raw.policies });
  setDataset(ds, 'Mẫu 2 (Thiếu DL & Ranh giới)');
}

async function loadSample3SalesCSV() {
  setSampleActive('btnSample3');
  el('loadedSummary').textContent = 'Đang tải sales_data.csv (lọc đơn B2B)...';
  const resp = await fetch('/sales_data.csv');
  if (!resp.ok) throw new Error('Không tải được /sales_data.csv');
  const text = await resp.text();
  const rows = parseCSV(text);
  const ds = normalizeDataset({ sales_data: rows });
  setDataset(ds, 'Mẫu 3 (sales_data.csv — Lọc B2B)');
}

el('btnSample1').addEventListener('click', loadSample1);
el('btnSample2').addEventListener('click', loadSample2Missing);
el('btnSample3').addEventListener('click', () => loadSample3SalesCSV().catch(err => alert(err.message)));

el('btnResetData').addEventListener('click', () => {
  currentDataset = null;
  currentResult = null;
  setSampleActive(null);
  el('btnRunAgent').disabled = true;
  el('btnExportAll').disabled = true;
  el('loadedSummary').textContent = 'Đã reset dữ liệu.';
  el('resultsTableBody').innerHTML = '<tr><td colspan="6" class="muted">Chưa có dữ liệu.</td></tr>';
  resetSteps();
});

el('fileInput').addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || !files.length) return;
  setSampleActive(null);
  try {
    const ds = await parseUploadedFiles(files);
    if (ds.products.length === 0 && currentDataset?.products?.length) ds.products = currentDataset.products;
    setDataset(ds, Array.from(files).map(f => f.name).join(', '));
  } catch (err) {
    alert('Lỗi đọc file: ' + err.message);
  }
});

el('btnLoadGSheet').addEventListener('click', async () => {
  const url = el('gsheetUrl').value.trim();
  if (!url) return alert('Vui lòng dán link Google Sheet.');
  setSampleActive(null);
  el('btnLoadGSheet').disabled = true;
  el('btnLoadGSheet').textContent = 'Đang tải...';
  try {
    const ds = await fetchGoogleSheetDataset(url);
    setDataset(ds, 'Google Sheet');
  } catch (err) {
    alert('Lỗi Google Sheet: ' + err.message);
  } finally {
    el('btnLoadGSheet').disabled = false;
    el('btnLoadGSheet').textContent = 'Tải dữ liệu Google Sheet';
  }
});

// Run Agent with smooth step animation
el('btnRunAgent').addEventListener('click', async () => {
  if (!currentDataset) return;
  const provider = el('llmProvider').value;
  const apiKey = el('llmApiKey').value.trim();
  const llmConfig = provider === 'offline' ? null : { provider, apiKey };

  el('btnRunAgent').disabled = true;
  el('flowStatusPill').textContent = 'Đang chạy...';
  resetSteps();

  const animateStep = (n) => new Promise(r => {
    el(`step${n}`).classList.add('active');
    setTimeout(() => {
      el(`step${n}`).classList.remove('active');
      el(`step${n}`).classList.add('done');
      el(`step${n}`).textContent = '✓';
      r();
    }, 150);
  });

  try {
    await animateStep(1);
    await animateStep(2);
    currentResult = await runAgentPipeline(currentDataset, llmConfig);
    await animateStep(3);
    await animateStep(4);

    el('flowStatusPill').textContent = 'Hoàn thành';
    el('agentCallout').innerHTML = `Hoàn tất phân tích <strong>${currentResult.summary.total_requests} cơ hội</strong> với <strong>${currentResult.audit_logs.length} bước Tool Call</strong> được ghi log.`;
    el('btnExportAll').disabled = false;

    renderDashboard(currentResult);
    saveLogsToServer(currentResult);
  } catch (err) {
    alert('Lỗi chạy Agent: ' + err.message);
    el('flowStatusPill').textContent = 'Lỗi';
  } finally {
    el('btnRunAgent').disabled = false;
  }
});

async function saveLogsToServer(result) {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: result.summary, audit_logs: result.audit_logs })
    });
  } catch (_e) {}
}

function renderDashboard(res) {
  const { summary, opportunities, audit_logs } = res;
  const c = summary.counts;
  const v = summary.values;

  el('hlEligibleCount').textContent = `${summary.eligible_count} YC`;
  el('hlEligibleValue').textContent = formatVND(summary.eligible_total_value);
  el('hlApprovalCount').textContent = `${c['Chờ duyệt']} YC`;
  el('hlApprovalValue').textContent = formatVND(v['Chờ duyệt']);
  el('hlAuditCount').textContent = `${audit_logs.length} Log`;
  el('hlCompleteness').textContent = `${summary.total_requests}/${summary.total_requests} cơ hội`;

  el('hlChips').innerHTML = `
    <span class="chip chip-green">✓ Tiếp tục: ${c['Có thể tiếp tục']}</span>
    <span class="chip chip-purple">⏳ Chờ duyệt: ${c['Chờ duyệt']}</span>
    <span class="chip chip-amber">⚠ Bổ sung: ${c['Cần bổ sung thông tin']}</span>
    <span class="chip chip-red">✕ Chưa ĐƯ: ${c['Chưa đáp ứng']}</span>
  `;

  drawResultsTable();
  renderProposals(res);
  renderErrors(opportunities);
  renderLogs(audit_logs);
}

function drawResultsTable() {
  if (!currentResult) return;
  const f = el('filterStatus').value;
  const rows = f === 'ALL' ? currentResult.opportunities : currentResult.opportunities.filter(o => o.status === f);

  el('resultsTableBody').innerHTML = rows.map(o => `
    <tr class="clickable" data-opp-id="${escapeHtml(o.request_id)}">
      <td><strong>${escapeHtml(o.request_id)}</strong><br><span class="muted">${escapeHtml(o.channel)}</span></td>
      <td><strong>${escapeHtml(o.customer_name)}</strong><br><span class="muted">NVKD: ${escapeHtml(o.sales_rep)}</span></td>
      <td>${formatVND(o.extracted.budget_vnd)}</td>
      <td><strong>${o.pricing.discount_pct}%</strong></td>
      <td><strong>${formatVND(o.pricing.final_total)}</strong></td>
      <td>${statusChip(o.status)}</td>
    </tr>
  `).join('');

  el('resultsTableBody').querySelectorAll('tr.clickable').forEach(tr => {
    tr.addEventListener('click', () => {
      const opp = currentResult.opportunities.find(x => x.request_id === tr.dataset.oppId);
      if (opp) openModal(opp);
    });
  });
}

el('filterStatus').addEventListener('change', drawResultsTable);

function renderProposals(res) {
  const { summary, opportunities } = res;
  const c = summary.counts;
  const v = summary.values;
  const items = [];
  if (c['Có thể tiếp tục'] > 0) items.push(`<li><strong>Chốt nhanh ${c['Có thể tiếp tục']} cơ hội "Có thể tiếp tục"</strong> (tổng ${formatVND(v['Có thể tiếp tục'])}): Gửi ngay bản nháp báo giá đã đối chiếu giá & tồn kho.</li>`);
  if (c['Chờ duyệt'] > 0) {
    const list = opportunities.filter(o => o.status === 'Chờ duyệt').map(o => `${o.request_id} (${o.pricing.discount_pct}% → ${o.pricing.approver_required})`).join(', ');
    items.push(`<li><strong>Trình duyệt ${c['Chờ duyệt']} phiếu vượt quyền:</strong> ${escapeHtml(list)}.</li>`);
  }
  if (c['Cần bổ sung thông tin'] > 0) items.push(`<li><strong>Theo dõi bổ sung ${c['Cần bổ sung thông tin']} yêu cầu thiếu dữ kiện:</strong> Giao đích danh NVKD gửi email hỏi thêm ngân sách/thời hạn/số lượng.</li>`);
  if (c['Chưa đáp ứng'] > 0) items.push(`<li><strong>Phối hợp Vận hành (${c['Chưa đáp ứng']} cơ hội "Chưa đáp ứng"):</strong> Đề xuất chia đợt giao hàng hoặc cấu hình tương đương.</li>`);
  el('proposalsList').innerHTML = items.join('');
}

function renderErrors(opportunities) {
  const bad = opportunities.filter(o => o.status === 'Cần bổ sung thông tin' || o.status === 'Chưa đáp ứng');
  if (bad.length === 0) {
    el('errorsTableBody').innerHTML = '<tr><td colspan="5" class="muted">Không có cơ hội thiếu dữ kiện hoặc chưa đáp ứng.</td></tr>';
    return;
  }
  el('errorsTableBody').innerHTML = bad.map(o => `
    <tr class="clickable" data-err-id="${escapeHtml(o.request_id)}">
      <td><strong>${escapeHtml(o.request_id)}</strong></td>
      <td>${escapeHtml(o.customer_name)}</td>
      <td>${statusChip(o.status)}</td>
      <td>${escapeHtml(o.reasons.join(' '))}</td>
      <td class="muted">${escapeHtml(o.next_step)}</td>
    </tr>
  `).join('');
  el('errorsTableBody').querySelectorAll('tr.clickable').forEach(tr => {
    tr.addEventListener('click', () => {
      const opp = currentResult.opportunities.find(x => x.request_id === tr.dataset.errId);
      if (opp) openModal(opp);
    });
  });
}

function renderLogs(logs) {
  const ids = Array.from(new Set(logs.map(l => l.request_id)));
  el('filterLogReq').innerHTML = `<option value="ALL">Tất cả (${ids.length})</option>` + ids.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('');
  const draw = () => {
    const f = el('filterLogReq').value;
    const rows = f === 'ALL' ? logs : logs.filter(l => l.request_id === f);
    el('auditTableBody').innerHTML = rows.slice(0, 200).map(l => `
      <tr>
        <td>${l.seq}</td>
        <td><strong>${escapeHtml(l.request_id)}</strong></td>
        <td>${escapeHtml(l.skill)}</td>
        <td><code>${escapeHtml(l.tool)}</code></td>
        <td style="max-width:300px;"><div class="pre-box">IN: ${escapeHtml(JSON.stringify(l.input))}\nOUT: ${escapeHtml(JSON.stringify(l.output))}</div></td>
        <td class="muted">${escapeHtml(l.rule_applied)}</td>
      </tr>
    `).join('');
  };
  el('filterLogReq').onchange = draw;
  draw();
}

function openModal(opp) {
  const itemsHtml = opp.matched_items.map(m => `
    <tr>
      <td>${escapeHtml(m.raw_name)}<br><span class="muted">${m.product ? escapeHtml(m.product.sku) : 'Ngoài danh mục'}</span></td>
      <td>${m.quantity ?? 'Thiếu'}</td>
      <td>${m.product ? formatVND(m.product.unit_price) : 'N/A'}</td>
      <td>${m.product ? m.inventory.available_stock : 'N/A'}</td>
      <td>${m.product ? m.product.lead_time_days + 'd' : 'N/A'}</td>
    </tr>
  `).join('');

  const slipHtml = opp.approval_slip ? `
    <div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:12px; padding:12px; margin:12px 0; font-size:13px;">
      <strong>PHIẾU CHUYỂN DUYỆT (${escapeHtml(opp.approval_slip.slip_id)})</strong><br>
      Người duyệt: <strong>${escapeHtml(opp.approval_slip.approver)}</strong> • Chính sách: <code>${escapeHtml(opp.approval_slip.policy_id)}</code><br>
      Chiết khấu đề nghị: <strong>${opp.approval_slip.requested_discount_pct}%</strong> (Quyền NVKD: ${opp.approval_slip.rep_max_discount_pct}%)
    </div>
  ` : '';

  el('dossierModalBody').innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div>
        <div class="muted">${escapeHtml(opp.request_id)} • NVKD: ${escapeHtml(opp.sales_rep)}</div>
        <h2 style="margin:2px 0 0; font-size:20px;">${escapeHtml(opp.customer_name)}</h2>
      </div>
      <button id="btnCloseModal" class="top-btn">Đóng ✕</button>
    </div>
    <div style="margin-bottom:12px;">${statusChip(opp.status)} <span class="muted" style="margin-left:8px;">Ngân sách: <strong>${formatVND(opp.extracted.budget_vnd)}</strong> • Thời hạn: <strong>${opp.extracted.deadline_days ? opp.extracted.deadline_days + ' ngày' : 'Chưa rõ'}</strong></span></div>
    <table style="margin-bottom:12px;">
      <thead><tr><th>Hạng mục</th><th>SL</th><th>Đơn giá</th><th>Tồn</th><th>Lead</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div style="font-size:13px; margin-bottom:10px;">
      <strong>Căn cứ đối chiếu:</strong>
      <ul style="margin:4px 0 8px; padding-left:18px;">${opp.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
      <strong>Bước tiếp theo:</strong> ${escapeHtml(opp.next_step)}
    </div>
    ${slipHtml}
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <strong style="font-size:13px;">Bản nháp phản hồi khách hàng</strong>
        <button id="btnCopyDraft" class="top-btn">Copy bản nháp</button>
      </div>
      <div class="draft-box">${escapeHtml(opp.customer_draft)}</div>
    </div>
  `;
  el('dossierModal').classList.add('open');
  el('btnCloseModal').onclick = () => el('dossierModal').classList.remove('open');
  el('btnCopyDraft').onclick = async () => {
    await navigator.clipboard.writeText(opp.customer_draft);
    el('btnCopyDraft').textContent = 'Đã copy!';
  };
}

el('dossierModal').addEventListener('click', (e) => {
  if (e.target === el('dossierModal')) el('dossierModal').classList.remove('open');
});

el('btnExportAll').addEventListener('click', () => {
  if (!currentResult) return;
  const blob = new Blob([JSON.stringify(currentResult, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `minh_an_result_${Date.now()}.json`;
  a.click();
});

el('btnRunSelfTest').addEventListener('click', async () => {
  const ds = await loadSample1();
  const res = await runAgentPipeline(ds, null);
  const expected = {
    'YC-001': 'Có thể tiếp tục', 'YC-002': 'Chờ duyệt', 'YC-003': 'Chưa đáp ứng', 'YC-004': 'Chưa đáp ứng',
    'YC-005': 'Cần bổ sung thông tin', 'YC-006': 'Cần bổ sung thông tin', 'YC-007': 'Cần bổ sung thông tin', 'YC-008': 'Cần bổ sung thông tin',
    'YC-009': 'Có thể tiếp tục', 'YC-010': 'Chờ duyệt', 'YC-011': 'Có thể tiếp tục', 'YC-012': 'Chờ duyệt'
  };
  let passed = 0;
  const rows = res.opportunities.map(o => {
    const exp = expected[o.request_id];
    const ok = o.status === exp && o.auto_confirmed_sale === false;
    if (ok) passed++;
    return `<tr><td><strong>${o.request_id}</strong></td><td>${escapeHtml(o.test_category)}</td><td>${statusChip(exp)}</td><td>${statusChip(o.status)}</td><td>${ok ? '<span class="chip chip-green">PASS</span>' : '<span class="chip chip-red">FAIL</span>'}</td></tr>`;
  }).join('');
  el('selfTestResults').innerHTML = `<p><strong>Kết quả: ${passed}/${res.opportunities.length} ĐẠT</strong> • Tổng đủ điều kiện: <strong>${formatVND(res.summary.eligible_total_value)}</strong></p><table><thead><tr><th>Mã YC</th><th>Nhóm test</th><th>Kỳ vọng</th><th>Thực tế</th><th>KQ</th></tr></thead><tbody>${rows}</tbody></table>`;
});

