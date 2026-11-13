// main.js — MinhAn CRM (BizLink-inspired Kanban & Analytics UI)

import {
  normalizeDataset,
  parseUploadedFiles,
  fetchGoogleSheetDataset,
  exportDatasetToXLSX
} from './dataLoader.js';
import { runAgentPipeline, formatVND } from './agentSkills.js';

let currentDataset = null;
let currentResult = null;
let selectedOppId = null;

const el = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadgeClass(status) {
  switch (status) {
    case 'Có thể tiếp tục': return 'badge-green';
    case 'Chờ duyệt': return 'badge-purple';
    case 'Cần bổ sung thông tin': return 'badge-amber';
    case 'Chưa đáp ứng': return 'badge-red';
    default: return '';
  }
}

// Sidebar view switching
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    el(btn.dataset.view).classList.add('active');
  });
});

function switchView(viewId) {
  const btn = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if (btn) btn.click();
}

el('llmProvider').addEventListener('change', (e) => {
  el('llmApiKey').style.display = e.target.value === 'offline' ? 'none' : 'inline-block';
});

function setDataset(dataset, label) {
  currentDataset = dataset;
  el('btnRunAgent').disabled = !dataset || !dataset.requests || dataset.requests.length === 0;
  el('datasetSummary').innerHTML = `<strong>Đã nạp (${escapeHtml(label)}):</strong> ${dataset.requests.length} yêu cầu • ${dataset.products.length} sản phẩm • ${dataset.policies.length} chính sách chiết khấu.`;
  renderCatalogAndPolicies(dataset);
}

function renderCatalogAndPolicies(dataset) {
  el('catalogTableBody').innerHTML = (dataset.products || []).map(p => `
    <tr>
      <td><code>${escapeHtml(p.sku)}</code></td>
      <td>${escapeHtml(p.name)}</td>
      <td>${formatVND(p.unit_price)}</td>
      <td><strong>${p.available_stock}</strong></td>
      <td>${p.lead_time_days} ngày</td>
    </tr>
  `).join('');

  el('policyTableBody').innerHTML = (dataset.policies || []).map(pol => `
    <tr>
      <td><code>${escapeHtml(pol.policy_id)}</code></td>
      <td>${escapeHtml(pol.role)}</td>
      <td><strong>${pol.max_discount_pct}%</strong></td>
      <td>${escapeHtml(pol.approver)}</td>
    </tr>
  `).join('');
}

async function loadSampleData() {
  const resp = await fetch('/data/sample_minh_an_data.json');
  if (!resp.ok) throw new Error('Không tải được dữ liệu mẫu.');
  const raw = await resp.json();
  const ds = normalizeDataset({ requests: raw.requests, products: raw.products, policies: raw.policies });
  setDataset(ds, 'Dữ liệu mẫu Minh An');
  return ds;
}

el('btnLoadSample').addEventListener('click', async () => {
  try { await loadSampleData(); } catch (err) { alert(err.message); }
});

el('btnDownloadTemplate').addEventListener('click', async () => {
  try {
    const ds = currentDataset || await loadSampleData();
    exportDatasetToXLSX(ds, 'minh_an_b2b_template.xlsx');
  } catch (err) { alert(err.message); }
});

el('btnLoadGSheet').addEventListener('click', async () => {
  const url = el('gsheetUrl').value.trim();
  if (!url) return alert('Vui lòng dán link Google Sheet.');
  el('btnLoadGSheet').disabled = true;
  el('btnLoadGSheet').textContent = 'Đang tải...';
  try {
    const ds = await fetchGoogleSheetDataset(url);
    if (ds.requests.length === 0) throw new Error('Không tìm thấy dữ liệu yêu cầu.');
    setDataset(ds, 'Google Sheet');
  } catch (err) {
    alert('Lỗi tải Google Sheet: ' + err.message);
  } finally {
    el('btnLoadGSheet').disabled = false;
    el('btnLoadGSheet').textContent = 'Tải Sheet';
  }
});

el('fileInput').addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  try {
    const ds = await parseUploadedFiles(files);
    if (ds.requests.length === 0 && ds.products.length === 0) throw new Error('File không hợp lệ.');
    if (ds.products.length === 0 && currentDataset?.products?.length) ds.products = currentDataset.products;
    setDataset(ds, Array.from(files).map(f => f.name).join(', '));
  } catch (err) {
    alert('Lỗi đọc file: ' + err.message);
  }
});

el('btnRunAgent').addEventListener('click', async () => {
  if (!currentDataset) return;
  const provider = el('llmProvider').value;
  const apiKey = el('llmApiKey').value.trim();
  const llmConfig = provider === 'offline' ? null : { provider, apiKey };

  el('btnRunAgent').disabled = true;
  el('btnRunAgent').textContent = 'Đang chạy...';
  try {
    currentResult = await runAgentPipeline(currentDataset, llmConfig, (done, total, id) => {
      el('btnRunAgent').textContent = `Xử lý ${done}/${total} (${id})`;
    });
    renderBanner(currentResult.summary);
    renderKanban(currentResult.opportunities);
    renderSummary(currentResult);
    renderAuditLogs(currentResult.audit_logs);
    el('navOppCount').textContent = currentResult.opportunities.length;
    el('navLogCount').textContent = currentResult.audit_logs.length;
    el('btnExportLogs').disabled = false;
    saveLogsToServer(currentResult);
  } catch (err) {
    alert('Lỗi chạy AI Agent: ' + err.message);
  } finally {
    el('btnRunAgent').disabled = false;
    el('btnRunAgent').textContent = '+ Chạy AI Agent';
  }
});

async function saveLogsToServer(result) {
  try {
    const resp = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: result.summary, audit_logs: result.audit_logs })
    });
    if (resp.ok) {
      const d = await resp.json();
      el('logSaveStatus').textContent = `Đã lưu: logs/${d.filename}`;
    }
  } catch (_e) { /* ignore */ }
}

function renderBanner(summary) {
  const total = Math.max(summary.total_requests, 1);
  const c = summary.counts;
  const cols = [
    { label: 'Tiếp tục', count: c['Có thể tiếp tục'] },
    { label: 'Chờ duyệt', count: c['Chờ duyệt'] },
    { label: 'Bổ sung', count: c['Cần bổ sung thông tin'] },
    { label: 'Chưa ĐƯ', count: c['Chưa đáp ứng'] }
  ];
  const maxC = Math.max(...cols.map(x => x.count), 1);

  el('miniBars').innerHTML = cols.map(x => {
    const hSolid = Math.max(8, Math.round((x.count / maxC) * 58));
    const hStripe = Math.max(6, Math.round(hSolid * 0.65));
    return `
      <div class="bar-col">
        <div class="bar-pair">
          <div class="bar-striped" style="height:${hStripe}px;"></div>
          <div class="bar-solid" style="height:${hSolid}px;" title="${x.label}: ${x.count}"></div>
        </div>
        <div class="bar-lbl">${x.label} (${x.count})</div>
      </div>
    `;
  }).join('');

  const pct = Math.round((summary.eligible_count / total) * 100);
  el('gaugePct').textContent = `${pct}%`;
  // Arc length of semicircle r=64 is ~201
  const filled = Math.round((pct / 100) * 201);
  el('gaugeArc').setAttribute('stroke-dasharray', `${filled} 220`);

  el('metricEligibleCount').textContent = `${summary.eligible_count}/${summary.total_requests}`;
  el('metricEligibleValue').textContent = formatVND(summary.eligible_total_value);
}

function renderKanban(opportunities) {
  const q = el('searchOpp').value.trim().toLowerCase();
  const filtered = opportunities.filter(o => {
    if (!q) return true;
    return `${o.request_id} ${o.customer_name} ${o.sales_rep}`.toLowerCase().includes(q);
  });

  const columns = [
    { key: 'Có thể tiếp tục', title: 'Có thể tiếp tục' },
    { key: 'Chờ duyệt', title: 'Chờ duyệt' },
    { key: 'Cần bổ sung thông tin', title: 'Cần bổ sung' },
    { key: 'Chưa đáp ứng', title: 'Chưa đáp ứng' }
  ];

  el('kanbanBoard').innerHTML = columns.map(col => {
    const cards = filtered.filter(o => o.status === col.key);
    return `
      <div>
        <div class="kanban-col-head">
          <span class="kanban-col-title">${col.title}</span>
          <span class="kanban-col-badge">${cards.length}</span>
        </div>
        <div class="kanban-cards">
          ${cards.map(o => `
            <div class="k-card ${selectedOppId === o.request_id ? 'selected' : ''}" data-opp-id="${escapeHtml(o.request_id)}">
              <div class="k-top">
                <div class="k-name">${escapeHtml(o.customer_name)}</div>
                <span class="k-id">${escapeHtml(o.request_id)}</span>
              </div>
              <div class="k-desc">${escapeHtml(o.reasons[0] || o.next_step)}</div>
              <div class="k-foot">
                <span class="k-pill">${o.extracted.deadline_days ? o.extracted.deadline_days + ' ngày' : 'Thiếu hạn'}</span>
                <span class="k-meta">${formatVND(o.pricing.final_total)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  el('kanbanBoard').querySelectorAll('.k-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedOppId = card.dataset.oppId;
      renderKanban(currentResult.opportunities);
      const opp = currentResult.opportunities.find(x => x.request_id === selectedOppId);
      if (opp) openDrawer(opp);
    });
  });
}

el('searchOpp').addEventListener('input', () => currentResult && renderKanban(currentResult.opportunities));

function openDrawer(opp) {
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
    <div class="slip-box">
      <strong>PHIẾU CHUYỂN DUYỆT (${escapeHtml(opp.approval_slip.slip_id)})</strong><br>
      Người duyệt: <strong>${escapeHtml(opp.approval_slip.approver)}</strong> • Chính sách: <code>${escapeHtml(opp.approval_slip.policy_id)}</code><br>
      Chiết khấu đề nghị: <strong>${opp.approval_slip.requested_discount_pct}%</strong> (Quyền NVKD: ${opp.approval_slip.rep_max_discount_pct}%)<br>
      Giá trị sau CK: <strong>${formatVND(opp.approval_slip.final_total)}</strong>
    </div>
  ` : '';

  el('drawerContent').innerHTML = `
    <div class="row" style="justify-content:space-between; margin-bottom:14px;">
      <div>
        <div class="muted">${escapeHtml(opp.request_id)} • ${escapeHtml(opp.channel)} • NVKD: ${escapeHtml(opp.sales_rep)}</div>
        <h2 style="margin:2px 0 0; font-size:20px;">${escapeHtml(opp.customer_name)}</h2>
      </div>
      <button id="btnCloseDrawer" class="btn btn-sm">Đóng ✕</button>
    </div>

    <div style="margin-bottom:12px;">
      <span class="badge ${statusBadgeClass(opp.status)}">${opp.status}</span>
      <span class="muted" style="margin-left:8px;">Ngân sách: <strong>${formatVND(opp.extracted.budget_vnd)}</strong> • Người duyệt KH: <strong>${escapeHtml(opp.extracted.customer_approver || 'Chưa rõ')}</strong></span>
    </div>

    <table style="margin-bottom:14px;">
      <thead><tr><th>Hạng mục</th><th>SL</th><th>Đơn giá</th><th>Tồn</th><th>Lead</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div style="font-size:13px; margin-bottom:12px;">
      <strong>Căn cứ đối chiếu:</strong>
      <ul style="margin:4px 0 8px; padding-left:18px;">${opp.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
      <strong>Bước tiếp theo:</strong> ${escapeHtml(opp.next_step)}<br>
      <span class="muted">Guardrail: <code>auto_confirmed_sale = ${opp.auto_confirmed_sale}</code></span>
    </div>

    ${slipHtml}

    <div style="margin-top:14px;">
      <div class="row" style="justify-content:space-between; margin-bottom:6px;">
        <strong style="font-size:13px;">Bản nháp phản hồi khách hàng</strong>
        <button id="btnCopyDraft" class="btn btn-sm">Copy bản nháp</button>
      </div>
      <div class="draft-box">${escapeHtml(opp.customer_draft)}</div>
    </div>
  `;

  el('drawerBackdrop').classList.add('open');
  el('btnCloseDrawer').onclick = () => el('drawerBackdrop').classList.remove('open');
  el('btnCopyDraft').onclick = async () => {
    await navigator.clipboard.writeText(opp.customer_draft);
    el('btnCopyDraft').textContent = 'Đã copy!';
  };
}

el('drawerBackdrop').addEventListener('click', (e) => {
  if (e.target === el('drawerBackdrop')) el('drawerBackdrop').classList.remove('open');
});

function renderSummary(result) {
  const { summary, opportunities } = result;
  const c = summary.counts;
  const v = summary.values;
  const rows = [
    { status: 'Có thể tiếp tục', inc: 'Có (Đủ điều kiện)' },
    { status: 'Chờ duyệt', inc: 'Có (Chờ duyệt)' },
    { status: 'Cần bổ sung thông tin', inc: 'Không' },
    { status: 'Chưa đáp ứng', inc: 'Không' }
  ];
  el('summaryTableBody').innerHTML = rows.map(r => `
    <tr>
      <td><span class="badge ${statusBadgeClass(r.status)}">${r.status}</span></td>
      <td><strong>${c[r.status]}</strong></td>
      <td>${formatVND(v[r.status])}</td>
      <td class="muted">${r.inc}</td>
    </tr>
  `).join('') + `
    <tr style="background:var(--ivory); font-weight:700;">
      <td>TỔNG ĐỦ ĐIỀU KIỆN (Tiếp tục + Chờ duyệt)</td>
      <td>${summary.eligible_count}</td>
      <td>${formatVND(summary.eligible_total_value)}</td>
      <td>Chỉ tính 2 nhóm hợp lệ</td>
    </tr>
  `;

  const recs = [];
  const ready = opportunities.filter(o => o.status === 'Có thể tiếp tục');
  const pend = opportunities.filter(o => o.status === 'Chờ duyệt');
  const miss = opportunities.filter(o => o.status === 'Cần bổ sung thông tin');
  const unf = opportunities.filter(o => o.status === 'Chưa đáp ứng');
  if (ready.length) recs.push(`<li><strong>Chốt nhanh ${ready.length} cơ hội "Có thể tiếp tục"</strong> (${formatVND(v['Có thể tiếp tục'])}).</li>`);
  if (pend.length) recs.push(`<li><strong>Ưu tiên duyệt ${pend.length} phiếu chuyển duyệt:</strong> ${pend.map(x => `${x.request_id} (${x.pricing.discount_pct}%)`).join(', ')}.</li>`);
  if (miss.length) recs.push(`<li><strong>Bổ sung thông tin ${miss.length} yêu cầu</strong> bằng bản nháp email đã tạo.</li>`);
  if (unf.length) recs.push(`<li><strong>Phối hợp Vận hành xử lý ${unf.length} cơ hội "Chưa đáp ứng"</strong> (tồn kho / thời hạn / ngân sách).</li>`);
  el('businessRecommendations').innerHTML = recs.join('');
}

function renderAuditLogs(logs) {
  const reqIds = Array.from(new Set(logs.map(l => l.request_id)));
  el('filterLogReq').innerHTML = `<option value="ALL">Tất cả (${reqIds.length})</option>` +
    reqIds.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('');
  const draw = () => {
    const f = el('filterLogReq').value;
    const rows = f === 'ALL' ? logs : logs.filter(l => l.request_id === f);
    el('auditTableBody').innerHTML = rows.map(l => `
      <tr>
        <td>${l.seq}</td>
        <td><strong>${escapeHtml(l.request_id)}</strong></td>
        <td>${escapeHtml(l.skill)}</td>
        <td><code>${escapeHtml(l.tool)}</code></td>
        <td style="max-width:340px;"><div class="pre-box">IN: ${escapeHtml(JSON.stringify(l.input))}\nOUT: ${escapeHtml(JSON.stringify(l.output))}</div></td>
        <td class="muted">${escapeHtml(l.rule_applied)}</td>
      </tr>
    `).join('');
  };
  el('filterLogReq').onchange = draw;
  draw();
}

el('btnExportLogs').addEventListener('click', () => {
  if (!currentResult) return;
  const blob = new Blob([JSON.stringify(currentResult, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `minh_an_audit_log_${Date.now()}.json`;
  a.click();
});

el('btnRunSelfTest').addEventListener('click', async () => {
  switchView('view-selftest');
  const ds = await loadSampleData();
  const res = await runAgentPipeline(ds, null);
  const expected = {
    'YC-001': 'Có thể tiếp tục', 'YC-002': 'Chờ duyệt', 'YC-003': 'Chưa đáp ứng', 'YC-004': 'Chưa đáp ứng',
    'YC-005': 'Cần bổ sung thông tin', 'YC-006': 'Cần bổ sung thông tin', 'YC-007': 'Cần bổ sung thông tin', 'YC-008': 'Cần bổ sung thông tin',
    'YC-009': 'Có thể tiếp tục', 'YC-010': 'Chờ duyệt', 'YC-011': 'Có thể tiếp tục', 'YC-012': 'Chờ duyệt'
  };
  let passed = 0;
  const rowsHtml = res.opportunities.map(o => {
    const exp = expected[o.request_id];
    const ok = o.status === exp && o.auto_confirmed_sale === false;
    if (ok) passed++;
    return `<tr>
      <td><strong>${escapeHtml(o.request_id)}</strong></td>
      <td>${escapeHtml(o.test_category)}</td>
      <td><span class="badge ${statusBadgeClass(exp)}">${exp}</span></td>
      <td><span class="badge ${statusBadgeClass(o.status)}">${o.status}</span></td>
      <td>${ok ? '<span class="badge badge-green">PASS</span>' : '<span class="badge badge-red">FAIL</span>'}</td>
    </tr>`;
  }).join('');

  el('selfTestResults').innerHTML = `
    <div style="margin-bottom:12px;"><strong>Kết quả Self-Test: ${passed}/${res.opportunities.length} ĐẠT</strong> • Pipeline đủ điều kiện: <strong>${formatVND(res.summary.eligible_total_value)}</strong></div>
    <table><thead><tr><th>Mã YC</th><th>Nhóm test</th><th>Kỳ vọng</th><th>Thực tế</th><th>Kết quả</th></tr></thead><tbody>${rowsHtml}</tbody></table>
  `;
});

