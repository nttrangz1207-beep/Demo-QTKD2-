// dataLoader09.js — Loader for Binh Minh (De 09) 6 data sources

function parseCSV(text) {
  const clean = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field.trim()); field = ''; }
      else if (ch === '\r' && next === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; i++; }
      else if (ch === '\n' || ch === '\r') { row.push(field.trim()); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field.trim()); rows.push(row); }
  const nonEmpty = rows.filter(r => r.some(c => c !== ''));
  if (nonEmpty.length < 2) return [];
  const headers = nonEmpty[0].map(h => normKey(h));
  return nonEmpty.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = r[idx] !== undefined ? r[idx] : ''; });
    return obj;
  });
}

function normKey(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function num(v, fallback = null) {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isNaN(n) ? fallback : n;
}

export function getDefaultRules09() {
  return {
    stage_weights: {
      'Tiếp cận': 0.10,
      'Khảo sát nhu cầu': 0.25,
      'Đề xuất giải pháp': 0.50,
      'Đàm phán': 0.75,
      'Chốt thắng (Won)': 1.00,
      'Mất khách (Lost)': 0.00
    },
    stale_days_threshold: 14,
    top_n: 5
  };
}

export function normalizeBinhMinhDataset(raw) {
  const tables = {};
  Object.entries(raw).forEach(([k, v]) => { tables[normKey(k)] = v; });

  const find = (kws) => {
    for (const [k, v] of Object.entries(tables)) {
      if (kws.some(w => k.includes(w))) return v;
    }
    return [];
  };

  const opportunities = (raw.opportunities || find(['opportunit', 'co_hoi', 'ho_so'])).map((r, i) => ({
    opp_id: String(r.opp_id || r.ma_ch || r.id || `BM-${i + 1}`).trim(),
    customer: String(r.customer || r.khach_hang || 'Khách hàng B2B').trim(),
    rep_id: String(r.rep_id || r.ma_nv || r.nhan_vien || 'NV01').trim(),
    stage: String(r.stage || r.giai_doan || r.trang_thai || 'Tiếp cận').trim(),
    value_vnd: num(r.value_vnd ?? r.gia_tri, null),
    expected_close_date: String(r.expected_close_date || r.ngay_du_kien_chot || '').trim(),
    confirmed_info: r.confirmed_info === true || String(r.confirmed_info || '').toLowerCase() === 'true' || String(r.confirmed_info || '') === '1' || String(r.xac_nhan || '').toLowerCase() === 'co',
    source_file: String(r.source_file || r.nguon || 'Upload').trim(),
    updated_at: String(r.updated_at || r.ngay_cap_nhat || '').trim()
  }));

  const status_history = (raw.status_history || find(['history', 'lich_su'])).map(r => ({
    opp_id: String(r.opp_id || r.ma_ch || '').trim(),
    changed_at: String(r.changed_at || r.ngay || '').trim(),
    stage: String(r.stage || r.trang_thai || '').trim()
  }));

  const activities = (raw.activities || find(['activit', 'hoat_dong', 'lien_he'])).map(r => ({
    opp_id: String(r.opp_id || r.ma_ch || '').trim(),
    activity_date: String(r.activity_date || r.ngay_lien_he || '').trim(),
    type: String(r.type || r.loai || 'Liên hệ').trim(),
    note: String(r.note || r.ghi_chu || '').trim()
  }));

  const orders = (raw.orders || find(['order', 'don_hang'])).map((r, i) => ({
    order_id: String(r.order_id || r.ma_dh || `ORD-${i + 1}`).trim(),
    opp_id: String(r.opp_id || r.ma_ch || '').trim(),
    rep_id: String(r.rep_id || r.ma_nv || '').trim(),
    order_date: String(r.order_date || r.ngay_don || '').trim(),
    amount_vnd: num(r.amount_vnd ?? r.doanh_so ?? r.gia_tri, 0)
  }));

  const sales_reps = (raw.sales_reps || find(['sales_rep', 'nhan_vien', 'muc_tieu'])).map(r => ({
    rep_id: String(r.rep_id || r.ma_nv || '').trim(),
    name: String(r.name || r.ten_nv || r.rep_id || '').trim(),
    target_vnd: num(r.target_vnd ?? r.muc_tieu, 400000000)
  }));

  return {
    default_report_date: raw.default_report_date || '2026-11-12',
    rules: raw.rules || getDefaultRules09(),
    opportunities,
    status_history,
    activities,
    orders,
    sales_reps
  };
}

export async function parseUploadedFiles09(fileList) {
  const raw = {};
  for (const file of fileList) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'json') {
      return normalizeBinhMinhDataset(JSON.parse(await file.text()));
    } else if (ext === 'csv') {
      raw[file.name.replace(/\.csv$/i, '')] = parseCSV(await file.text());
    } else if (ext === 'xlsx' || ext === 'xls') {
      if (typeof window.XLSX === 'undefined') throw new Error('SheetJS chưa sẵn sàng.');
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
      wb.SheetNames.forEach(s => { raw[s] = parseCSV(window.XLSX.utils.sheet_to_csv(wb.Sheets[s])); });
    }
  }
  return normalizeBinhMinhDataset(raw);
}

export async function fetchGoogleSheet09(url) {
  const resp = await fetch(`/api/fetch-gsheet?url=${encodeURIComponent(url)}`);
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try { const j = await resp.json(); if (j.error) msg = j.error; } catch (_e) {}
    throw new Error(msg);
  }
  const ctype = resp.headers.get('content-type') || '';
  if (ctype.includes('text/csv')) {
    return normalizeBinhMinhDataset({ opportunities: parseCSV(await resp.text()) });
  }
  const wb = window.XLSX.read(await resp.arrayBuffer(), { type: 'array' });
  const raw = {};
  wb.SheetNames.forEach(s => { raw[s] = parseCSV(window.XLSX.utils.sheet_to_csv(wb.Sheets[s])); });
  return normalizeBinhMinhDataset(raw);
}
