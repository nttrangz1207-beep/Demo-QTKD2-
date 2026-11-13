// main.js — Forest Sage Edition UI controller for Minh An B2B Sales AI Agent

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
    default: return 'badge-blue';
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    el(btn.dataset.tab).classList.add('active');
  });
});

function switchTab(tabId) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.click();
}

el('llmProvider').addEventListener('change', (e) => {
  el('llmApiKey').style.display = e.target.value === 'offline' ? 'none' : 'inline-block';
});

function setDataset(dataset, sourceLabel) {
  currentDataset = dataset;
  el('btnRunAgent').disabled = !dataset || !dataset.requests || dataset.requests.length === 0;
  el('datasetSummary').innerHTML = `<strong>Đã nạp (${escapeHtml(sourceLabel)}):</strong> ${dataset.requests.length} yêu cầu • ${dataset.products.length} sản phẩm • ${dataset.policies.length} chính sách chiết khấu.`;
  renderSourceTables(dataset);
}

function renderSourceTables(dataset) {
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
  if (!resp.ok) throw new Error('Không tải được file dữ liệu mẫu /data/sample_minh_an_data.json');
  const raw = await resp.json();
  const ds = normalizeDataset({ requests: raw.requests, products: raw.products, policies: raw.policies });
  setDataset(ds, 'Dữ liệu mẫu Minh An');
  return ds;
}

el('btnLoadSample').addEventListener('click', async () => {
  try {
    await loadSampleData();
  } catch (err) {
    alert('Lỗi nạp dữ liệu mẫu: ' + err.message);
  }
});

el('btnDownloadTemplate').addEventListener('click', async () => {
  try {
    const ds = currentDataset || await loadSampleData();
    exportDatasetToXLSX(ds, 'minh_an_b2b_template.xlsx');
  } catch (err) {
    alert('Lỗi xuất template: ' + err.message);
  }
});

el('btnLoadGSheet').addEventListener('click', async () => {
  const url = el('gsheetUrl').value.trim();
  if (!url) return alert('Vui lòng dán link Google Sheet.');
  el('btnLoadGSheet').disabled = true;
  el('btnLoadGSheet').textContent = 'Đang tải...';
  try {
    const ds = await fetchGoogleSheetDataset(url);
    if (ds.requests.length === 0) throw new Error('Không tìm thấy dữ liệu yêu cầu trong Google Sheet.');
    setDataset(ds, 'Google Sheet');
  } catch (err) {
    alert('Không tải được Google Sheet: ' + err.message);
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
    if (ds.requests.length === 0 && ds.products.length === 0) {
      throw new Error('File không có dữ liệu hợp lệ hoặc sai tên cột.');
    }
    if (ds.products.length === 0 && currentDataset?.products?.length) {
      ds.products = currentDataset.products;
    }
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
  el('btnRunAgent').textContent = 'Agent đang xử lý...';

  try {
    currentResult = await runAgentPipeline(currentDataset, llmConfig, (done, total, reqId) => {
      el('btnRunAgent').textContent = `Đang xử lý ${done}/${total} (${reqId})...`;
    });

    renderOverview(currentResult);
    renderOpportunityList(currentResult.opportunities);
    renderAuditLogs(currentResult.audit_logs);
    el('btnExportLogs').disabled = false;
    saveLogsToServer(currentResult);
  } catch (err) {
    alert('Lỗi chạy AI Agent: ' + err.message);
  } finally {
    el('btnRunAgent').disabled = false;
    el('btnRunAgent').textContent = 'Chạy AI Agent (4 Kỹ năng)';
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
      const data = await resp.json();
      el('logSaveStatus').textContent = `Đã lưu nhật ký tại: logs/${data.filename}`;
    }
  } catch (_e) {
    el('logSaveStatus').textContent = 'Nhật ký đang lưu trên trình duyệt.';
  }
}

function renderOverview(result) {
  const { summary, opportunities } = result;
  el('overviewEmpty').style.display = 'none';
  el('overviewContent').style.display = 'block';

  const c = summary.counts;
  const v = summary.values;

  el('kpiGrid').innerHTML = `
    <div class="session-card hero">
      <div class="session-label">Pipeline Đủ Điều Kiện</div>
      <div class="session-num">${formatVND(summary.eligible_total_value)}</div>
      <div class="session-sub">${summary.eligible_count}/${summary.total_requests} cơ hội (Tiếp tục + Chờ duyệt)</div>
    </div>
    <div class="session-card sage">
      <div class="session-label">Có thể tiếp tục</div>
      <div class="session-num">${c['Có thể tiếp tục']}</div>
      <div class="session-sub">${formatVND(v['Có thể tiếp tục'])}</div>
    </div>
    <div class="session-card teal">
      <div class="session-label">Chờ duyệt</div>
      <div class="session-num">${c['Chờ duyệt']}</div>
      <div class="session-sub">${formatVND(v['Chờ duyệt'])}</div>
    </div>
    <div class="session-card amber-card">
      <div class="session-label">Cần bổ sung thông tin</div>
      <div class="session-num">${c['Cần bổ sung thông tin']}</div>
      <div class="session-sub">Không cộng vào Pipeline</div>
    </div>
    <div class="session-card rose-card">
      <div class="session-label">Chưa đáp ứng</div>
      <div class="session-num">${c['Chưa đáp ứng']}</div>
      <div class="session-sub">Vướng tồn / hạn / ngân sách</div>
    </div>
  `;

  const total = Math.max(summary.total_requests, 1);
  const barMeta = [
    { status: 'Có thể tiếp tục', color: '#88be76', include: 'Có' },
    { status: 'Chờ duyệt', color: '#a99ce6', include: 'Có' },
    { status: 'Cần bổ sung thông tin', color: '#e2b86b', include: 'Không' },
    { status: 'Chưa đáp ứng', color: '#e07c7c', include: 'Không' }
  ];

  el('pipelineBars').innerHTML = barMeta.map(b => {
    const pct = Math.round((c[b.status] / total) * 100);
    return `
      <div class="bar-row">
        <div class="bar-label">${b.status}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${b.color};"></div></div>
        <div class="bar-val">${c[b.status]} YC (${pct}%)</div>
      </div>
    `;
  }).join('');

  el('summaryTableBody').innerHTML = barMeta.map(r => `
    <tr>
      <td><span class="badge ${statusBadgeClass(r.status)}">${r.status}</span></td>
      <td><strong>${c[r.status]}</strong></td>
      <td>${formatVND(v[r.status])}</td>
      <td class="muted">${r.include}</td>
    </tr>
  `).join('') + `
    <tr style="background:rgba(140,194,171,0.14); font-weight:700;">
      <td>TỔNG ĐỦ ĐIỀU KIỆN</td>
      <td>${summary.eligible_count}</td>
      <td style="color:var(--sage-bright);">${formatVND(summary.eligible_total_value)}</td>
      <td>Tiếp tục + Chờ duyệt</td>
    </tr>
  `;

  const recs = [];
  const pendingApprovals = opportunities.filter(o => o.status === 'Chờ duyệt');
  const readyOpps = opportunities.filter(o => o.status === 'Có thể tiếp tục');
  const missingOpps = opportunities.filter(o => o.status === 'Cần bổ sung thông tin');
  const unfeasibleOpps = opportunities.filter(o => o.status === 'Chưa đáp ứng');

  if (readyOpps.length > 0) {
    recs.push(`<li><strong>Chốt nhanh ${readyOpps.length} cơ hội "Có thể tiếp tục"</strong> (${formatVND(v['Có thể tiếp tục'])}): Gửi bản nháp báo giá đã kiểm tra giá & tồn kho mới nhất.</li>`);
  }
  if (pendingApprovals.length > 0) {
    const ids = pendingApprovals.map(o => `${o.request_id} (${o.pricing.discount_pct}% → ${o.pricing.approver_required})`).join(', ');
    recs.push(`<li><strong>Xử lý ${pendingApprovals.length} Phiếu chuyển duyệt:</strong> ${escapeHtml(ids)}.</li>`);
  }
  if (missingOpps.length > 0) {
    recs.push(`<li><strong>Theo dõi ${missingOpps.length} yêu cầu thiếu dữ kiện:</strong> NVKD gửi ngay email hỏi lại ngân sách, thời hạn, số lượng hoặc người duyệt.</li>`);
  }
  if (unfeasibleOpps.length > 0) {
    recs.push(`<li><strong>Phối hợp Vận hành (${unfeasibleOpps.length} cơ hội "Chưa đáp ứng"):</strong> Đề xuất chia đợt giao hàng hoặc cấu hình tương đương.</li>`);
  }
  el('businessRecommendations').innerHTML = recs.join('');
}

function renderOpportunityList(opportunities) {
  const statusFilter = el('filterStatus').value;
  const query = el('searchOpp').value.trim().toLowerCase();

  const filtered = opportunities.filter(o => {
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    if (query) {
      const hay = `${o.request_id} ${o.customer_name} ${o.sales_rep}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  el('oppTableBody').innerHTML = filtered.map(o => `
    <tr style="${selectedOppId === o.request_id ? 'background:rgba(140,194,171,0.12);' : ''}">
      <td><strong>${escapeHtml(o.request_id)}</strong><br><span class="muted">${escapeHtml(o.channel)}</span></td>
      <td><strong>${escapeHtml(o.customer_name)}</strong><br><span class="muted">NVKD: ${escapeHtml(o.sales_rep)}</span></td>
      <td><span class="badge ${statusBadgeClass(o.status)}">${o.status}</span></td>
      <td><strong>${formatVND(o.pricing.final_total)}</strong><br><span class="muted">CK: ${o.pricing.discount_pct}%</span></td>
      <td><button class="btn btn-ghost btn-sm" data-view-id="${escapeHtml(o.request_id)}">Xem</button></td>
    </tr>
  `).join('');

  el('oppTableBody').querySelectorAll('button[data-view-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedOppId = btn.dataset.viewId;
      renderOpportunityList(currentResult.opportunities);
      const opp = currentResult.opportunities.find(x => x.request_id === selectedOppId);
      if (opp) renderDossierDetail(opp);
    });
  });

  if (!selectedOppId && filtered.length > 0) {
    selectedOppId = filtered[0].request_id;
    renderDossierDetail(filtered[0]);
  }
}

el('filterStatus').addEventListener('change', () => currentResult && renderOpportunityList(currentResult.opportunities));
el('searchOpp').addEventListener('input', () => currentResult && renderOpportunityList(currentResult.opportunities));

function renderDossierDetail(opp) {
  const itemsHtml = opp.matched_items.map(m => {
    const sku = m.product ? `<code>${escapeHtml(m.product.sku)}</code>` : '<span class="badge badge-red">Ngoài danh mục</span>';
    const stockInfo = m.product ? `${m.inventory.available_stock} (Cần: ${m.quantity ?? '?'})` : 'N/A';
    const priceInfo = m.product ? formatVND(m.product.unit_price) : 'N/A';
    return `<tr>
      <td>${escapeHtml(m.raw_name)}<br>${sku}</td>
      <td>${m.quantity ?? '<span style="color:var(--rose);">Thiếu</span>'}</td>
      <td>${priceInfo}</td>
      <td>${stockInfo}</td>
      <td>${m.product ? m.product.lead_time_days + ' ngày' : 'N/A'}</td>
    </tr>`;
  }).join('');

  const slipHtml = opp.approval_slip ? `
    <div class="slip-box">
      <strong>PHIẾU CHUYỂN DUYỆT (${escapeHtml(opp.approval_slip.slip_id)})</strong>
      <div class="muted" style="margin-top:4px; color:#ddd6fe;">
        Người duyệt: <strong>${escapeHtml(opp.approval_slip.approver)}</strong> • Chính sách: <code>${escapeHtml(opp.approval_slip.policy_id)}</code><br>
        Chiết khấu đề nghị: <strong>${opp.approval_slip.requested_discount_pct}%</strong> (Quyền NVKD: ${opp.approval_slip.rep_max_discount_pct}%)<br>
        Giá trị sau CK: <strong>${formatVND(opp.approval_slip.final_total)}</strong> • ${escapeHtml(opp.approval_slip.decision_status)}
      </div>
    </div>
  ` : '';

  el('dossierDetail').innerHTML = `
    <div class="row" style="justify-content:space-between; margin-bottom:8px;">
      <h3 style="margin:0;">Hồ sơ: ${escapeHtml(opp.request_id)}</h3>
      <span class="badge ${statusBadgeClass(opp.status)}">${opp.status}</span>
    </div>
    <p class="muted" style="margin:0 0 10px;">
      <strong>Khách hàng:</strong> ${escapeHtml(opp.customer_name)} | <strong>NVKD:</strong> ${escapeHtml(opp.sales_rep)}<br>
      <strong>Ngân sách:</strong> ${formatVND(opp.extracted.budget_vnd)} | <strong>Thời hạn:</strong> ${opp.extracted.deadline_days ? opp.extracted.deadline_days + ' ngày' : 'Chưa rõ'} | <strong>Người duyệt KH:</strong> ${escapeHtml(opp.extracted.customer_approver || 'Chưa rõ')}
    </p>
    <div style="overflow-x:auto; margin-bottom:10px;">
      <table>
        <thead><tr><th>Hạng mục</th><th>SL</th><th>Đơn giá</th><th>Tồn kho</th><th>Lead-time</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>
    <div style="font-size:13px; margin-bottom:10px;">
      <strong>Căn cứ & Đối chiếu:</strong>
      <ul style="margin:4px 0 8px; padding-left:18px;">
        ${opp.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
      </ul>
      <strong>Bước tiếp theo:</strong> ${escapeHtml(opp.next_step)}<br>
      <span class="muted">Guardrail: <code>auto_confirmed_sale = ${opp.auto_confirmed_sale}</code></span>
    </div>
    ${slipHtml}
    <div style="margin-top:12px;">
      <div class="row" style="justify-content:space-between; margin-bottom:6px;">
        <strong style="font-size:13px;">Bản nháp phản hồi khách hàng</strong>
        <button id="btnCopyDraft" class="btn btn-ghost btn-sm">Copy bản nháp</button>
      </div>
      <div class="draft-box">${escapeHtml(opp.customer_draft)}</div>
    </div>
  `;

  el('btnCopyDraft').addEventListener('click', async () => {
    await navigator.clipboard.writeText(opp.customer_draft);
    el('btnCopyDraft').textContent = 'Đã copy!';
    setTimeout(() => { el('btnCopyDraft').textContent = 'Copy bản nháp'; }, 1500);
  });
}

function renderAuditLogs(logs) {
  const reqIds = Array.from(new Set(logs.map(l => l.request_id)));
  el('filterLogReq').innerHTML = `<option value="ALL">Tất cả Mã Yêu cầu (${reqIds.length})</option>` +
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
  switchTab('tab-selftest');
  const ds = await loadSampleData();
  const res = await runAgentPipeline(ds, null);

  const expected = {
    'YC-001': 'Có thể tiếp tục',
    'YC-002': 'Chờ duyệt',
    'YC-003': 'Chưa đáp ứng',
    'YC-004': 'Chưa đáp ứng',
    'YC-005': 'Cần bổ sung thông tin',
    'YC-006': 'Cần bổ sung thông tin',
    'YC-007': 'Cần bổ sung thông tin',
    'YC-008': 'Cần bổ sung thông tin',
    'YC-009': 'Có thể tiếp tục',
    'YC-010': 'Chờ duyệt',
    'YC-011': 'Có thể tiếp tục',
    'YC-012': 'Chờ duyệt'
  };

  let passed = 0;
  const rowsHtml = res.opportunities.map(o => {
    const exp = expected[o.request_id];
    const ok = o.status === exp && o.auto_confirmed_sale === false;
    if (ok) passed++;
    return `
      <tr>
        <td><strong>${escapeHtml(o.request_id)}</strong></td>
        <td>${escapeHtml(o.test_category)}</td>
        <td><span class="badge ${statusBadgeClass(exp)}">${exp}</span></td>
        <td><span class="badge ${statusBadgeClass(o.status)}">${o.status}</span></td>
        <td>${ok ? '<span class="badge badge-green">PASS</span>' : '<span class="badge badge-red">FAIL</span>'}</td>
      </tr>
    `;
  }).join('');

  el('selfTestResults').innerHTML = `
    <div class="status-ribbon" style="margin-top:0; margin-bottom:14px;">
      <strong>Kết quả Self-Test: ${passed} / ${res.opportunities.length} ca kiểm thử ĐẠT</strong>
      <span>Tổng giá trị đủ điều kiện: <strong>${formatVND(res.summary.eligible_total_value)}</strong></span>
    </div>
    <table>
      <thead><tr><th>Mã YC</th><th>Nhóm kiểm thử</th><th>Kỳ vọng</th><th>Thực tế Agent</th><th>Kết quả</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
});

