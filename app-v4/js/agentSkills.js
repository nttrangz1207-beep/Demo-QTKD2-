// agentSkills.js — 4 Coordinated Business Skills + Audit Trail + Optional LLM Adapter

import {
  toolLookupProduct,
  toolCheckInventory,
  toolCheckLeadTime,
  toolCalculatePricingAndPolicy
} from './agentTools.js';

export class AuditLogger {
  constructor() {
    this.entries = [];
  }
  log(requestId, skill, tool, input, output, ruleApplied = '') {
    this.entries.push({
      seq: this.entries.length + 1,
      timestamp: new Date().toISOString(),
      request_id: requestId,
      skill,
      tool,
      input,
      output,
      rule_applied: ruleApplied
    });
  }
}

export function formatVND(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return 'Chưa xác định';
  return new Intl.NumberFormat('vi-VN').format(Math.round(num)) + ' VNĐ';
}

function parseVietnameseMoney(str) {
  if (!str) return null;
  const s = str.toLowerCase().trim();
  const numMatch = s.match(/([\d.,]+)/);
  if (!numMatch) return null;
  let raw = numMatch[1];
  if (s.includes('tỷ') || s.includes('ty')) {
    const val = Number(raw.replace(',', '.'));
    return Number.isNaN(val) ? null : Math.round(val * 1_000_000_000);
  }
  if (s.includes('triệu') || s.includes('trieu') || /\btr\b/.test(s)) {
    const val = Number(raw.replace(/\./g, '').replace(',', '.'));
    return Number.isNaN(val) ? null : Math.round(val * 1_000_000);
  }
  const normalized = raw.replace(/\./g, '').replace(/,/g, '');
  const val = Number(normalized);
  return Number.isNaN(val) || val <= 0 ? null : val;
}

function extractItemsHeuristic(rawText, catalog) {
  const items = [];
  const usedSegments = [];

  // Strip trailing metadata clauses (ngân sách, thời hạn, chiết khấu, người phê duyệt)
  const coreText = rawText
    .replace(/(?:ngân\s*sách|budget)[^.;\n]*/gi, '')
    .replace(/(?:thời\s*hạn|hoàn\s*thành|giao\s*(?:hàng\s*)?(?:và\s*triển\s*khai\s*)?(?:xong\s*)?trong)[^.;\n]*/gi, '')
    .replace(/(?:chiết\s*khấu|ck)[^.;\n]*/gi, '')
    .replace(/(?:người\s*phê\s*duyệt|phê\s*duyệt)[^.;\n]*/gi, '');

  // Split by common separators: " và ", ",", ";", "\n"
  const segments = coreText
    .split(/(?:\s+và\s+|[,;\n]+)/i)
    .map(s => s.trim())
    .filter(s => s.length > 3);

  for (const seg of segments) {
    // Check if segment mentions a SKU or product name or typical product keywords
    const skuMatch = seg.match(/\(([A-Z0-9-]{4,})\)/i) || seg.match(/\b([A-Z]{2,5}-[A-Z0-9-]{2,})\b/);
    const hasCatalogMatch = catalog.some(p => {
      const segLow = seg.toLowerCase();
      return segLow.includes(p.sku.toLowerCase()) ||
        segLow.includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().split(' ').slice(0, 3).every(w => segLow.includes(w));
    });
    const hasProductCue = /(?:máy chủ|server|switch|tường lửa|firewall|laptop|thinkpad|gói dịch vụ|thiết bị|nas|synology|cisco|dell|fortigate)/i.test(seg);

    if (!skuMatch && !hasCatalogMatch && !hasProductCue) continue;

    // Extract leading quantity like "2 Máy chủ..." or "mua 3 Tường lửa..." or "đúng 6 Tường lửa..."
    const qtyMatch = seg.match(/(?:mua|cần|đặt(?:\s*mua|\s*hàng)?|cung\s*cấp|báo\s*giá|đúng|gấp)?\s*(\d+)\s+(?=[a-zA-ZÀ-ỹ])/i);
    let quantity = null;
    if (qtyMatch && qtyMatch[1]) {
      // Avoid confusing model numbers like "100F" or "9200L" or "24-Port"
      const numVal = Number(qtyMatch[1]);
      if (numVal > 0 && numVal < 10000) {
        quantity = numVal;
      }
    }

    let cleanName = seg
      .replace(/^(?:chào\s+[^,]+,|gửi\s+[^,]+,|chúng\s+tôi\s+(?:cần|muốn)|bên\s+mình\s+cần|đề\s+nghị\s+(?:báo\s+giá|cung\s+cấp)|xin\s+báo\s+giá|cần|đặt\s*(?:mua|hàng)?|mua)\s*/i, '')
      .replace(/^(?:đúng|gấp)\s+/i, '')
      .replace(/^\d+\s+/, '')
      .trim();

    const skuQuery = skuMatch ? skuMatch[1] : cleanName;
    if (cleanName.length > 2) {
      usedSegments.push(seg);
      items.push({
        raw_name: cleanName,
        sku_or_query: skuQuery,
        quantity
      });
    }
  }

  return items;
}

async function extractWithLLM(rawText, catalog, llmConfig) {
  const catalogHint = catalog.map(p => `${p.sku}: ${p.name}`).join('\n');
  const prompt = `Bạn là AI Agent bóc tách yêu cầu báo giá B2B của Công ty Minh An.
Danh mục sản phẩm hiện có:
${catalogHint}

Hãy đọc văn bản yêu cầu sau và trả về DUY NHẤT một JSON object hợp lệ (không markdown) theo schema:
{
  "items": [{"raw_name": string, "sku_or_query": string, "quantity": number|null}],
  "budget_vnd": number|null,
  "deadline_days": number|null,
  "requested_discount_pct": number|null,
  "customer_approver": string|null
}
Lưu ý: Nếu yêu cầu KHÔNG ghi rõ số lượng cho một sản phẩm thì đặt quantity = null. Nếu không có ngân sách/thời hạn/người phê duyệt thì đặt null.

Văn bản yêu cầu:
"""${rawText}"""`;

  if (llmConfig.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(llmConfig.model || 'gemini-2.0-flash')}:generateContent?key=${encodeURIComponent(llmConfig.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' }
      })
    });
    if (!res.ok) throw new Error(`Gemini API HTTP ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(text);
  }

  if (llmConfig.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.apiKey}`
      },
      body: JSON.stringify({
        model: llmConfig.model || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`OpenAI API HTTP ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    return JSON.parse(text);
  }

  return null;
}

// SKILL 1: Intake & Requirement Extraction
export async function skill1ExtractRequirements(req, catalog, logger, llmConfig = null) {
  const text = req.raw_text || '';
  let extracted = null;
  let modeUsed = 'Deterministic NLP Engine';

  if (llmConfig && llmConfig.apiKey && llmConfig.provider !== 'offline') {
    try {
      extracted = await extractWithLLM(text, catalog, llmConfig);
      modeUsed = `LLM (${llmConfig.provider}:${llmConfig.model})`;
    } catch (err) {
      logger.log(req.request_id, 'Skill 1: Bóc tách yêu cầu', 'llm_fallback', { error: err.message }, { fallback: 'Deterministic NLP Engine' }, 'Fallback khi LLM lỗi');
    }
  }

  if (!extracted) {
    const budgetMatch = text.match(/(?:ngân\s*sách(?:\s*dự\s*kiến|\s*tổng|\s*khoảng|\s*đúng)?|budget)\s*[:làkhoảngđúng]*\s*([\d.,]+\s*(?:vnđ|vnd|đ|triệu|trieu|tr|tỷ|ty)?)/i);
    const deadlineMatch = text.match(/(?:thời\s*hạn(?:\s*triển\s*khai)?|hoàn\s*thành\s*trong|giao(?:\s*và\s*triển\s*khai)?(?:\s*xong)?\s*trong)\s*[:là]*\s*(\d+)\s*ngày/i);
    const discountMatch = text.match(/(?:chiết\s*khấu(?:\s*đề\s*nghị)?|đề\s*nghị\s*chiết\s*khấu|ck)\s*[:là]*\s*([\d.,]+)\s*%/i);
    const approverMatch = text.match(/(?:người\s*phê\s*duyệt|người\s*duyệt|phê\s*duyệt)\s*[:\-]\s*([^.\n]+)/i);

    extracted = {
      items: extractItemsHeuristic(text, catalog),
      budget_vnd: req.budget_hint ? parseVietnameseMoney(String(req.budget_hint)) : (budgetMatch ? parseVietnameseMoney(budgetMatch[1]) : null),
      deadline_days: req.deadline_hint ? Number(req.deadline_hint) : (deadlineMatch ? Number(deadlineMatch[1]) : null),
      requested_discount_pct: req.discount_hint !== '' ? Number(req.discount_hint) : (discountMatch ? Number(discountMatch[1].replace(',', '.')) : 0),
      customer_approver: req.approver_hint ? String(req.approver_hint) : (approverMatch ? approverMatch[1].trim() : null)
    };
  }

  const missingFields = [];
  if (!extracted.items || extracted.items.length === 0) missingFields.push('Danh sách sản phẩm/dịch vụ');
  if (extracted.items && extracted.items.some(i => i.quantity === null || i.quantity <= 0)) {
    const missingQtyNames = extracted.items.filter(i => !i.quantity || i.quantity <= 0).map(i => i.raw_name);
    missingFields.push(`Số lượng cho: ${missingQtyNames.join(', ')}`);
  }
  if (extracted.budget_vnd === null || extracted.budget_vnd <= 0) missingFields.push('Ngân sách tổng');
  if (extracted.deadline_days === null || extracted.deadline_days <= 0) missingFields.push('Thời hạn triển khai');
  if (!extracted.customer_approver) missingFields.push('Người phê duyệt phía khách hàng');

  const result = { ...extracted, missing_fields: missingFields, extraction_mode: modeUsed };
  logger.log(
    req.request_id,
    'Skill 1: Bóc tách yêu cầu',
    'extract_requirements',
    { raw_text_preview: text.slice(0, 120) + (text.length > 120 ? '...' : '') },
    { items_count: extracted.items.length, budget_vnd: extracted.budget_vnd, deadline_days: extracted.deadline_days, discount_pct: extracted.requested_discount_pct, missing_fields: missingFields },
    'Trích xuất thực thể & kiểm tra trường bắt buộc'
  );
  return result;
}

// SKILL 2: Catalog, Inventory & Lead-time Check
export function skill2CheckCatalogAndFulfillment(req, extracted, catalog, logger) {
  const matchedItems = (extracted.items || []).map(item => {
    const lookup = toolLookupProduct(item.sku_or_query || item.raw_name, catalog);
    logger.log(
      req.request_id,
      'Skill 2: Đối chiếu Danh mục & Tồn kho',
      'tool_lookup_product',
      { query: item.sku_or_query || item.raw_name },
      { found: lookup.found, match_type: lookup.match_type, sku: lookup.product?.sku || null, unit_price: lookup.product?.unit_price || null },
      'Tra cứu bảng giá hiện hành'
    );

    const inv = toolCheckInventory(lookup.product, item.quantity);
    logger.log(
      req.request_id,
      'Skill 2: Đối chiếu Danh mục & Tồn kho',
      'tool_check_inventory',
      { sku: lookup.product?.sku || 'N/A', requested_qty: item.quantity },
      inv,
      'Kiểm tra tồn khả dụng >= số lượng đặt'
    );

    return {
      raw_name: item.raw_name,
      quantity: item.quantity,
      found: lookup.found,
      product: lookup.product,
      inventory: inv
    };
  });

  const leadTimeCheck = toolCheckLeadTime(matchedItems, extracted.deadline_days);
  logger.log(
    req.request_id,
    'Skill 2: Đối chiếu Danh mục & Tồn kho',
    'tool_check_lead_time',
    { deadline_days: extracted.deadline_days, item_skus: matchedItems.map(m => m.product?.sku || 'UNKNOWN') },
    leadTimeCheck,
    'Kiểm tra max(lead_time_days) <= thời hạn yêu cầu'
  );

  return { matchedItems, leadTimeCheck };
}

// SKILL 3: Pricing, Discount Policy & Status Classification
export function skill3EvaluatePricingAndPolicy(req, extracted, fulfillment, policies, logger) {
  const { matchedItems, leadTimeCheck } = fulfillment;
  const pricing = toolCalculatePricingAndPolicy(
    matchedItems,
    extracted.requested_discount_pct,
    extracted.budget_vnd,
    policies
  );

  logger.log(
    req.request_id,
    'Skill 3: Tính giá & Kiểm tra chính sách',
    'tool_calculate_pricing_and_policy',
    {
      subtotal: pricing.subtotal,
      requested_discount_pct: pricing.discount_pct,
      budget_vnd: pricing.budget
    },
    {
      final_total: pricing.final_total,
      within_budget: pricing.within_budget,
      requires_approval: pricing.requires_approval,
      approver_required: pricing.approver_required,
      policy_id: pricing.applied_policy?.policy_id
    },
    `Ngưỡng NVKD <= ${pricing.rep_max_discount_pct}%; Vượt quyền -> chuyển duyệt`
  );

  // Determine missing product / qty / metadata
  const unknownItems = matchedItems.filter(m => !m.found);
  const missingQtyItems = matchedItems.filter(m => m.found && (!m.quantity || m.quantity <= 0));
  const insufficientStockItems = matchedItems.filter(m => m.found && m.quantity > 0 && !m.inventory.sufficient);

  const reasons = [];
  let status = 'Có thể tiếp tục';

  // Precedence:
  // 1. Hard fulfillment blockers (stock short, lead time missed, over budget) -> Chưa đáp ứng
  // 2. Missing data (unknown SKU, missing qty, missing budget/deadline/approver) -> Cần bổ sung thông tin
  // 3. Discount exceeds rep authority -> Chờ duyệt
  // 4. All clear -> Có thể tiếp tục
  if (insufficientStockItems.length > 0 || leadTimeCheck.feasible === false || pricing.within_budget === false) {
    status = 'Chưa đáp ứng';
    if (insufficientStockItems.length > 0) {
      insufficientStockItems.forEach(it => reasons.push(`Tồn kho không đủ cho ${it.product.sku}: ${it.inventory.reason}.`));
    }
    if (leadTimeCheck.feasible === false) {
      reasons.push(leadTimeCheck.reason + '.');
    }
    if (pricing.within_budget === false) {
      reasons.push(`Giá trị sau chiết khấu (${formatVND(pricing.final_total)}) vượt ngân sách khách hàng (${formatVND(pricing.budget)}).`);
    }
  } else if (unknownItems.length > 0 || missingQtyItems.length > 0 || extracted.missing_fields.length > 0) {
    status = 'Cần bổ sung thông tin';
    if (unknownItems.length > 0) {
      reasons.push(`Sản phẩm chưa có trong danh mục chuẩn: ${unknownItems.map(u => u.raw_name).join(', ')}.`);
    }
    if (extracted.missing_fields.length > 0) {
      reasons.push(`Thiếu thông tin bắt buộc: ${extracted.missing_fields.join('; ')}.`);
    }
  } else if (pricing.requires_approval) {
    status = 'Chờ duyệt';
    reasons.push(`Đề nghị chiết khấu ${pricing.discount_pct}% vượt quyền NVKD (tối đa ${pricing.rep_max_discount_pct}%). Cần ${pricing.approver_required} phê duyệt theo ${pricing.applied_policy.policy_id}.`);
  } else {
    status = 'Có thể tiếp tục';
    reasons.push(`Đủ thông tin, đủ tồn kho, kịp thời hạn (${leadTimeCheck.max_lead_time_days}/${leadTimeCheck.deadline_days} ngày), trong ngân sách và chiết khấu ${pricing.discount_pct}% nằm trong quyền NVKD (<= ${pricing.rep_max_discount_pct}%).`);
  }

  logger.log(
    req.request_id,
    'Skill 3: Tính giá & Kiểm tra chính sách',
    'classify_opportunity_status',
    { unknown_count: unknownItems.length, missing_count: extracted.missing_fields.length, stock_short_count: insufficientStockItems.length, lead_feasible: leadTimeCheck.feasible, requires_approval: pricing.requires_approval },
    { status, reasons, auto_confirmed_sale: false },
    'Guardrail: Không tự xác nhận bán hàng khi chưa đủ dữ kiện hoặc vượt quyền'
  );

  return { status, reasons, pricing, unknownItems, insufficientStockItems };
}

// SKILL 4: Opportunity Dossier, Customer Draft & Escalation Slip
export function skill4GenerateDossierAndOutputs(req, extracted, fulfillment, evaluation, logger) {
  const { status, reasons, pricing } = evaluation;
  const { leadTimeCheck, matchedItems } = fulfillment;

  let nextStep = '';
  let owner = req.sales_rep;
  let customerDraft = '';
  let approvalSlip = null;

  const itemSummaryLines = matchedItems.map(m => {
    const name = m.product ? `${m.product.name} (${m.product.sku})` : `${m.raw_name} [Chưa rõ mã]`;
    const qty = m.quantity ? `${m.quantity}` : '[Thiếu SL]';
    const price = m.product ? formatVND(m.product.unit_price) : 'N/A';
    return `- ${name} | SL: ${qty} | Đơn giá: ${price}`;
  }).join('\n');

  if (status === 'Có thể tiếp tục') {
    nextStep = `${req.sales_rep} gửi báo giá chính thức cho ${req.customer_name} và theo dõi xác nhận PO.`;
    customerDraft = `Kính gửi ${req.customer_name} (Người phụ trách: ${extracted.customer_approver}),\n\nCông ty Minh An trân trọng cảm ơn Quý công ty đã gửi yêu cầu báo giá (${req.request_id}). Chúng tôi xác nhận khả năng đáp ứng các hạng mục sau:\n${itemSummaryLines}\n\n- Tổng giá trị niêm yết: ${formatVND(pricing.subtotal)}\n- Chiết khấu áp dụng (${pricing.discount_pct}%): -${formatVND(pricing.discount_amount)}\n- Tổng giá trị đề xuất: ${formatVND(pricing.final_total)}\n- Thời gian triển khai dự kiến: ${leadTimeCheck.max_lead_time_days} ngày (đáp ứng thời hạn ${extracted.deadline_days} ngày).\n\nĐề xuất này có hiệu lực sau khi Quý công ty xác nhận đơn hàng chính thức. Rất mong được hợp tác cùng Quý công ty.\n\nTrân trọng,\n${req.sales_rep} — Công ty Minh An`;
  } else if (status === 'Chờ duyệt') {
    nextStep = `Chuyển Phiếu duyệt cho ${pricing.approver_required}; tạm giữ báo giá, KHÔNG tự xác nhận bán hàng trước khi có phê duyệt.`;
    owner = `${req.sales_rep} -> ${pricing.approver_required}`;
    approvalSlip = {
      slip_id: `DUYET-${req.request_id}`,
      request_id: req.request_id,
      customer_name: req.customer_name,
      sales_rep: req.sales_rep,
      approver: pricing.approver_required,
      policy_id: pricing.applied_policy?.policy_id,
      subtotal: pricing.subtotal,
      requested_discount_pct: pricing.discount_pct,
      rep_max_discount_pct: pricing.rep_max_discount_pct,
      final_total: pricing.final_total,
      reason: reasons.join(' '),
      decision_status: 'Đang chờ phê duyệt (Chưa xác nhận bán hàng)'
    };
    customerDraft = `Kính gửi ${req.customer_name} (Người phụ trách: ${extracted.customer_approver}),\n\nCông ty Minh An đã tiếp nhận yêu cầu ${req.request_id} và xác nhận đủ tồn kho cũng như tiến độ triển khai (${leadTimeCheck.max_lead_time_days} ngày).\nĐối với đề nghị chiết khấu ${pricing.discount_pct}%, hồ sơ đang được trình ${pricing.approver_required} xem xét phê duyệt theo chính sách công ty. Chúng tôi sẽ gửi báo giá chính thức ngay khi có quyết định.\n\nTrân trọng,\n${req.sales_rep} — Công ty Minh An`;
  } else if (status === 'Cần bổ sung thông tin') {
    nextStep = `${req.sales_rep} liên hệ ${req.customer_name} để bổ sung: ${extracted.missing_fields.join(', ')}.`;
    customerDraft = `Kính gửi ${req.customer_name},\n\nCảm ơn Quý công ty đã liên hệ Công ty Minh An cho yêu cầu ${req.request_id}. Để lập đề xuất chính xác nhất, Quý công ty vui lòng bổ sung thêm các thông tin sau:\n${extracted.missing_fields.map(f => `- ${f}`).join('\n')}\n${evaluation.unknownItems.length > 0 ? `- Làm rõ cấu hình/mã sản phẩm cho: ${evaluation.unknownItems.map(u => u.raw_name).join(', ')}\n` : ''}\nNgay khi nhận được phản hồi, chúng tôi sẽ kiểm tra tồn kho và gửi báo giá chi tiết.\n\nTrân trọng,\n${req.sales_rep} — Công ty Minh An`;
  } else {
    // Chưa đáp ứng
    nextStep = `${req.sales_rep} phối hợp Bộ phận Vận hành đề xuất phương án thay thế (chia đợt giao hàng / điều chỉnh tiến độ hoặc cấu hình) cho ${req.customer_name}.`;
    customerDraft = `Kính gửi ${req.customer_name},\n\nCảm ơn Quý công ty đã gửi yêu cầu ${req.request_id}. Sau khi kiểm tra tồn kho và lịch triển khai thực tế, Công ty Minh An xin thông báo hiện tại chưa thể đáp ứng nguyên trạng yêu cầu do:\n${reasons.map(r => `- ${r}`).join('\n')}\n\nChúng tôi đề xuất trao đổi thêm để điều chỉnh lịch giao hàng từng phần hoặc cấu hình tương đương phù hợp với kế hoạch của Quý công ty.\n\nTrân trọng,\n${req.sales_rep} — Công ty Minh An`;
  }

  logger.log(
    req.request_id,
    'Skill 4: Xuất hồ sơ & Bản nháp',
    'generate_dossier_and_drafts',
    { status, has_approval_slip: Boolean(approvalSlip) },
    { next_step: nextStep, owner, draft_length: customerDraft.length },
    'Sinh hồ sơ cơ hội, bản nháp phản hồi & phiếu chuyển duyệt'
  );

  return {
    request_id: req.request_id,
    channel: req.channel,
    sales_rep: req.sales_rep,
    customer_name: req.customer_name,
    test_category: req.test_category,
    raw_text: req.raw_text,
    extracted,
    matched_items: matchedItems,
    lead_time_check: leadTimeCheck,
    pricing,
    status,
    reasons,
    next_step: nextStep,
    owner,
    customer_draft: customerDraft,
    approval_slip: approvalSlip,
    auto_confirmed_sale: false
  };
}

export async function runAgentPipeline(dataset, llmConfig = null, onProgress = null) {
  const logger = new AuditLogger();
  const opportunities = [];

  for (let i = 0; i < dataset.requests.length; i++) {
    const req = dataset.requests[i];
    if (onProgress) onProgress(i + 1, dataset.requests.length, req.request_id);

    const extracted = await skill1ExtractRequirements(req, dataset.products, logger, llmConfig);
    const fulfillment = skill2CheckCatalogAndFulfillment(req, extracted, dataset.products, logger);
    const evaluation = skill3EvaluatePricingAndPolicy(req, extracted, fulfillment, dataset.policies, logger);
    const dossier = skill4GenerateDossierAndOutputs(req, extracted, fulfillment, evaluation, logger);
    opportunities.push(dossier);
  }

  // Compute Summary Table & Eligible Pipeline Value (Có thể tiếp tục + Chờ duyệt ONLY)
  const counts = {
    'Có thể tiếp tục': 0,
    'Cần bổ sung thông tin': 0,
    'Chưa đáp ứng': 0,
    'Chờ duyệt': 0
  };
  const values = {
    'Có thể tiếp tục': 0,
    'Cần bổ sung thông tin': 0,
    'Chưa đáp ứng': 0,
    'Chờ duyệt': 0
  };

  for (const opp of opportunities) {
    counts[opp.status] = (counts[opp.status] || 0) + 1;
    values[opp.status] = (values[opp.status] || 0) + (opp.pricing.final_total || 0);
  }

  const eligibleTotalValue = values['Có thể tiếp tục'] + values['Chờ duyệt'];
  const eligibleCount = counts['Có thể tiếp tục'] + counts['Chờ duyệt'];

  const summary = {
    total_requests: opportunities.length,
    counts,
    values,
    eligible_count: eligibleCount,
    eligible_total_value: eligibleTotalValue,
    generated_at: new Date().toISOString()
  };

  return {
    summary,
    opportunities,
    audit_logs: logger.entries
  };
}

