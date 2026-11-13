// dataLoader.js — CSV, XLSX, Google Sheets & sales_data.csv auto-adapter

export function parseCSV(text) {
  const clean = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  const nonEmpty = rows.filter(r => r.some(cell => cell !== ''));
  if (nonEmpty.length < 2) return [];

  const headers = nonEmpty[0].map(h => normalizeKey(h));
  return nonEmpty.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = r[idx] !== undefined ? r[idx] : '';
    });
    return obj;
  });
}

function normalizeKey(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function pickField(obj, aliases, fallback = '') {
  for (const key of aliases) {
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
      return obj[key];
    }
  }
  return fallback;
}

function parseNumber(val, fallback = 0) {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (val === undefined || val === null || String(val).trim() === '') return fallback;
  const cleaned = String(val).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const num = Number(cleaned);
  return Number.isNaN(num) ? fallback : num;
}

export function getDefaultPolicies() {
  return [
    { policy_id: 'POL-DISC-REP', role: 'Nhân viên Kinh doanh', max_discount_pct: 10, approver: 'Tự duyệt (NVKD)', description: 'Chiết khấu tối đa 10%' },
    { policy_id: 'POL-DISC-MGR', role: 'Trưởng phòng Kinh doanh', max_discount_pct: 20, approver: 'Trưởng phòng Kinh doanh', description: 'Chiết khấu >10% đến 20%' },
    { policy_id: 'POL-DISC-DIR', role: 'Ban Giám đốc', max_discount_pct: 35, approver: 'Ban Giám đốc', description: 'Chiết khấu >20%' }
  ];
}

function convertSalesRowsToDataset(rows) {
  // Filter B2B rows first if segment exists; fallback to all rows, cap at 40 for snappy UI
  const b2b = rows.filter(r => String(r.segment || '').toLowerCase().includes('b2b'));
  const selected = (b2b.length > 0 ? b2b : rows).slice(0, 40);

  const prodMap = new Map();
  rows.slice(0, 500).forEach(r => {
    const sku = String(r.product_id || '').trim();
    if (!sku || prodMap.has(sku)) return;
    prodMap.set(sku, {
      sku,
      name: String(r.product_name || sku).trim(),
      category: String(r.category || 'Thiết bị công nghệ').trim(),
      unit_price: parseNumber(r.unit_price_vnd, 0),
      available_stock: 10,
      lead_time_days: Math.max(2, parseNumber(r.shipping_days, 3) + 1)
    });
  });

  const requests = selected.map((r, idx) => {
    const qty = parseNumber(r.quantity, 1);
    const price = parseNumber(r.unit_price_vnd, 0);
    const discPct = Math.round(parseNumber(r.discount, 0) * 100 * 10) / 10;
    const netSales = parseNumber(r.net_sales_vnd, qty * price);
    const budget = Math.round(netSales * 1.05);
    const shipDays = Math.max(2, parseNumber(r.shipping_days, 3) + 2);
    const sku = String(r.product_id || '').trim();
    const pname = String(r.product_name || sku).trim();

    return {
      request_id: String(r.order_id || `ORD-${idx + 1}`),
      channel: String(r.channel || 'Sales CSV'),
      sales_rep: String(r.region || 'Kinh doanh B2B'),
      customer_name: `${r.customer_id || 'KH'} (${r.city || 'VN'})`,
      raw_text: `Cần ${qty} ${pname} (${sku}). Ngân sách ${budget.toLocaleString('vi-VN')} VNĐ, thời hạn triển khai trong ${shipDays} ngày, đề nghị chiết khấu ${discPct}%. Người phê duyệt: Đại diện ${r.customer_id || 'Khách hàng'}.`,
      budget_hint: budget,
      deadline_hint: shipDays,
      discount_hint: discPct,
      approver_hint: `Đại diện ${r.customer_id || 'Khách hàng'}`,
      test_category: String(r.segment || 'Sales CSV')
    };
  });

  return {
    requests,
    products: Array.from(prodMap.values()),
    policies: getDefaultPolicies()
  };
}

export function normalizeDataset(rawTables) {
  const tableEntries = Object.entries(rawTables).map(([k, rows]) => [normalizeKey(k), rows]);

  // Detect sales_data.csv format
  for (const [, rows] of tableEntries) {
    if (rows && rows.length > 0 && rows[0].order_id !== undefined && rows[0].product_id !== undefined && rows[0].unit_price_vnd !== undefined) {
      return convertSalesRowsToDataset(rows);
    }
  }

  const findTable = (keywords) => {
    for (const [name, rows] of tableEntries) {
      if (keywords.some(kw => name.includes(kw))) return rows;
    }
    return null;
  };

  let rawRequests = findTable(['request', 'yeu_cau', 'co_hoi', 'opportunity']);
  let rawProducts = findTable(['product', 'san_pham', 'catalog', 'danh_muc', 'gia']);
  let rawInventory = findTable(['inventory', 'ton_kho', 'ton_kha_dung', 'stock']);
  let rawLeadTimes = findTable(['lead_time', 'thoi_gian_trien_khai', 'trien_khai']);
  let rawPolicies = findTable(['polic', 'chinh_sach', 'chiet_khau', 'duyet']);

  for (const [, rows] of tableEntries) {
    if (!rows || rows.length === 0) continue;
    const cols = Object.keys(rows[0]);
    if (!rawRequests && cols.some(c => ['raw_text', 'noi_dung', 'yeu_cau', 'content', 'mo_ta'].includes(c))) {
      rawRequests = rows;
    } else if (!rawProducts && cols.some(c => ['unit_price', 'don_gia', 'gia', 'price'].includes(c))) {
      rawProducts = rows;
    } else if (!rawPolicies && cols.some(c => ['max_discount_pct', 'chiet_khau_toi_da', 'approver', 'nguoi_duyet'].includes(c))) {
      rawPolicies = rows;
    }
  }

  const productsMap = new Map();
  (rawProducts || []).forEach((row, idx) => {
    const sku = String(pickField(row, ['sku', 'ma_sp', 'ma_san_pham', 'product_id', 'code'], `SP-${idx + 1}`)).trim();
    productsMap.set(sku.toUpperCase(), {
      sku,
      name: String(pickField(row, ['name', 'ten_sp', 'ten_san_pham', 'product_name', 'san_pham'], sku)).trim(),
      category: String(pickField(row, ['category', 'danh_muc', 'loai', 'nhom'], 'Thiết bị/Dịch vụ')).trim(),
      unit_price: parseNumber(pickField(row, ['unit_price', 'don_gia', 'gia_niem_yet', 'gia', 'price'], 0), 0),
      available_stock: parseNumber(pickField(row, ['available_stock', 'ton_kha_dung', 'ton_kho', 'stock', 'so_luong_ton'], 0), 0),
      lead_time_days: parseNumber(pickField(row, ['lead_time_days', 'thoi_gian_trien_khai', 'lead_time', 'so_ngay_trien_khai'], 5), 5)
    });
  });

  (rawInventory || []).forEach(row => {
    const sku = String(pickField(row, ['sku', 'ma_sp', 'ma_san_pham', 'product_id'], '')).trim().toUpperCase();
    if (sku && productsMap.has(sku)) {
      const p = productsMap.get(sku);
      p.available_stock = parseNumber(pickField(row, ['available_stock', 'ton_kha_dung', 'ton_kho', 'stock', 'so_luong'], p.available_stock), p.available_stock);
    }
  });

  (rawLeadTimes || []).forEach(row => {
    const sku = String(pickField(row, ['sku', 'ma_sp', 'ma_san_pham', 'product_id'], '')).trim().toUpperCase();
    if (sku && productsMap.has(sku)) {
      const p = productsMap.get(sku);
      p.lead_time_days = parseNumber(pickField(row, ['lead_time_days', 'thoi_gian_trien_khai', 'lead_time', 'so_ngay'], p.lead_time_days), p.lead_time_days);
    }
  });

  const requests = (rawRequests || []).map((row, idx) => ({
    request_id: String(pickField(row, ['request_id', 'ma_yc', 'ma_yeu_cau', 'id', 'stt'], `YC-${String(idx + 1).padStart(3, '0')}`)).trim(),
    channel: String(pickField(row, ['channel', 'kenh', 'nguon'], 'Email')).trim(),
    sales_rep: String(pickField(row, ['sales_rep', 'nhan_vien', 'nvkd', 'nguoi_phu_trach'], 'Chưa phân công')).trim(),
    customer_name: String(pickField(row, ['customer_name', 'khach_hang', 'ten_khach_hang', 'cong_ty'], 'Khách hàng B2B')).trim(),
    raw_text: String(pickField(row, ['raw_text', 'noi_dung', 'noi_dung_yeu_cau', 'yeu_cau', 'content', 'mo_ta'], '')).trim(),
    budget_hint: pickField(row, ['budget', 'ngan_sach', 'ngan_sach_tong'], ''),
    deadline_hint: pickField(row, ['deadline_days', 'thoi_han', 'thoi_han_ngay'], ''),
    discount_hint: pickField(row, ['requested_discount_pct', 'chiet_khau', 'de_nghi_chiet_khau'], ''),
    approver_hint: pickField(row, ['customer_approver', 'nguoi_phe_duyet', 'nguoi_duyet'], ''),
    test_category: String(pickField(row, ['test_category', 'phan_loai_test', 'ghi_chu'], '')).trim()
  })).filter(r => r.raw_text.length > 0 || r.customer_name !== 'Khách hàng B2B');

  const policies = (rawPolicies || []).map((row, idx) => ({
    policy_id: String(pickField(row, ['policy_id', 'ma_chinh_sach', 'id'], `POL-${idx + 1}`)).trim(),
    role: String(pickField(row, ['role', 'vai_tro', 'cap_duyet'], 'Nhân viên Kinh doanh')).trim(),
    max_discount_pct: parseNumber(pickField(row, ['max_discount_pct', 'chiet_khau_toi_da', 'nguong_chiet_khau', 'muc_toi_da'], 10), 10),
    approver: String(pickField(row, ['approver', 'nguoi_duyet', 'bo_phan_duyet'], 'Trưởng phòng Kinh doanh')).trim(),
    description: String(pickField(row, ['description', 'mo_ta', 'quy_tac'], '')).trim()
  })).sort((a, b) => a.max_discount_pct - b.max_discount_pct);

  return {
    requests,
    products: Array.from(productsMap.values()),
    policies: policies.length > 0 ? policies : getDefaultPolicies()
  };
}

export async function parseUploadedFiles(fileList) {
  const rawTables = {};
  for (const file of fileList) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      const text = await file.text();
      rawTables[file.name.replace(/\.csv$/i, '')] = parseCSV(text);
    } else if (ext === 'xlsx' || ext === 'xls') {
      if (typeof window.XLSX === 'undefined') {
        throw new Error('Thư viện đọc Excel (SheetJS) chưa sẵn sàng.');
      }
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: 'array' });
      wb.SheetNames.forEach(sheetName => {
        rawTables[sheetName] = parseCSV(window.XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]));
      });
    } else if (ext === 'json') {
      const json = JSON.parse(await file.text());
      if (json.requests) rawTables.requests = json.requests;
      if (json.products) rawTables.products = json.products;
      if (json.policies) rawTables.policies = json.policies;
    }
  }
  return normalizeDataset(rawTables);
}

export async function fetchGoogleSheetDataset(url) {
  const match = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('Link Google Sheet không hợp lệ.');

  const resp = await fetch(`/api/fetch-gsheet?url=${encodeURIComponent(url)}`);
  if (!resp.ok) {
    let errMsg = `HTTP ${resp.status}`;
    try { const j = await resp.json(); if (j.error) errMsg = j.error; } catch (_e) {}
    throw new Error(errMsg);
  }
  const ctype = resp.headers.get('content-type') || '';
  if (ctype.includes('text/csv')) {
    return normalizeDataset({ requests: parseCSV(await resp.text()) });
  }
  const buf = await resp.arrayBuffer();
  const wb = window.XLSX.read(buf, { type: 'array' });
  const rawTables = {};
  wb.SheetNames.forEach(s => { rawTables[s] = parseCSV(window.XLSX.utils.sheet_to_csv(wb.Sheets[s])); });
  return normalizeDataset(rawTables);
}

export function exportDatasetToXLSX(dataset, filename = 'minh_an_template.xlsx') {
  if (typeof window.XLSX === 'undefined') return alert('SheetJS chưa tải xong.');
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataset.requests || []), 'requests');
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataset.products || []), 'products');
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataset.policies || []), 'policies');
  window.XLSX.writeFile(wb, filename);
}
