// dataLoader.js — CSV, XLSX & Google Sheets loader with flexible schema normalization

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

export function normalizeDataset(rawTables) {
  // rawTables is a map: { sheetName: [rowObj, ...] }
  const tableEntries = Object.entries(rawTables).map(([k, rows]) => [normalizeKey(k), rows]);

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

  // Fallback by column signature if sheet names are generic (Sheet1, Sheet2...)
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

  // Merge separate inventory sheet if provided
  (rawInventory || []).forEach(row => {
    const sku = String(pickField(row, ['sku', 'ma_sp', 'ma_san_pham', 'product_id'], '')).trim().toUpperCase();
    if (sku && productsMap.has(sku)) {
      const p = productsMap.get(sku);
      p.available_stock = parseNumber(pickField(row, ['available_stock', 'ton_kha_dung', 'ton_kho', 'stock', 'so_luong'], p.available_stock), p.available_stock);
    }
  });

  // Merge separate lead_times sheet if provided
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
    // Optional structured hints if dataset already has columns
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

export function getDefaultPolicies() {
  return [
    { policy_id: 'POL-DISC-REP', role: 'Nhân viên Kinh doanh', max_discount_pct: 10, approver: 'Tự duyệt (NVKD)', description: 'Chiết khấu tối đa 10%' },
    { policy_id: 'POL-DISC-MGR', role: 'Trưởng phòng Kinh doanh', max_discount_pct: 20, approver: 'Trưởng phòng Kinh doanh', description: 'Chiết khấu >10% đến 20%' },
    { policy_id: 'POL-DISC-DIR', role: 'Ban Giám đốc', max_discount_pct: 35, approver: 'Ban Giám đốc', description: 'Chiết khấu >20%' }
  ];
}

export async function parseUploadedFiles(fileList) {
  const rawTables = {};

  for (const file of fileList) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      const text = await file.text();
      const baseName = file.name.replace(/\.csv$/i, '');
      rawTables[baseName] = parseCSV(text);
    } else if (ext === 'xlsx' || ext === 'xls') {
      if (typeof window.XLSX === 'undefined') {
        throw new Error('Thư viện đọc Excel (SheetJS) chưa tải xong. Vui lòng kiểm tra kết nối mạng hoặc dùng file CSV.');
      }
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: 'array' });
      wb.SheetNames.forEach(sheetName => {
        const csv = window.XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
        rawTables[sheetName] = parseCSV(csv);
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
  if (!match) {
    throw new Error('Link Google Sheet không hợp lệ. Ví dụ đúng: https://docs.google.com/spreadsheets/d/...');
  }

  // Try local proxy first (avoids CORS & supports multi-sheet XLSX)
  const proxyUrl = `/api/fetch-gsheet?url=${encodeURIComponent(url)}`;
  let resp;
  try {
    resp = await fetch(proxyUrl);
  } catch (_e) {
    throw new Error('Không kết nối được server proxy (/api/fetch-gsheet). Hãy chạy ứng dụng qua `ruby --disable-gems server.rb`.');
  }

  if (!resp.ok) {
    let errMsg = `HTTP ${resp.status}`;
    try {
      const errJson = await resp.json();
      if (errJson.error) errMsg = errJson.error;
    } catch (_e) { /* ignore */ }
    throw new Error(errMsg);
  }

  const ctype = resp.headers.get('content-type') || '';
  if (ctype.includes('text/csv')) {
    const text = await resp.text();
    return normalizeDataset({ requests: parseCSV(text) });
  }

  if (typeof window.XLSX === 'undefined') {
    throw new Error('Thư viện SheetJS chưa sẵn sàng để đọc workbook Google Sheet.');
  }
  const buf = await resp.arrayBuffer();
  const wb = window.XLSX.read(buf, { type: 'array' });
  const rawTables = {};
  wb.SheetNames.forEach(sheetName => {
    const csv = window.XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
    rawTables[sheetName] = parseCSV(csv);
  });
  return normalizeDataset(rawTables);
}

export function exportDatasetToXLSX(dataset, filename = 'minh_an_template.xlsx') {
  if (typeof window.XLSX === 'undefined') {
    alert('Thư viện SheetJS chưa sẵn sàng. Bạn có thể dùng các file CSV mẫu trong thư mục data/csv/.');
    return;
  }
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataset.requests || []), 'requests');
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataset.products || []), 'products');
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataset.policies || []), 'policies');
  window.XLSX.writeFile(wb, filename);
}

