// agentTools.js — Deterministic business tools invoked by the AI Agent

function normText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function toolLookupProduct(query, catalog) {
  const qNorm = normText(query);
  if (!qNorm) {
    return { found: false, match_type: 'empty_query', product: null };
  }

  // 1. Exact SKU match
  for (const p of catalog) {
    if (normText(p.sku) === qNorm) {
      return { found: true, match_type: 'exact_sku', product: p };
    }
  }

  // 2. SKU contained in query
  for (const p of catalog) {
    if (qNorm.includes(normText(p.sku))) {
      return { found: true, match_type: 'sku_in_text', product: p };
    }
  }

  // 3. Name match (exact or substring)
  for (const p of catalog) {
    const pName = normText(p.name);
    if (pName === qNorm || pName.includes(qNorm) || qNorm.includes(pName)) {
      return { found: true, match_type: 'name_match', product: p };
    }
  }

  // 4. Token overlap (>= 60% of product name tokens)
  let best = null;
  let bestScore = 0;
  const qTokens = new Set(qNorm.split(/[^a-z0-9]+/).filter(t => t.length >= 2));
  for (const p of catalog) {
    const pTokens = normText(p.name).split(/[^a-z0-9]+/).filter(t => t.length >= 2);
    if (pTokens.length === 0) continue;
    const hits = pTokens.filter(t => qTokens.has(t)).length;
    const score = hits / pTokens.length;
    if (score >= 0.6 && score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (best) {
    return { found: true, match_type: 'token_similarity', product: best, score: Number(bestScore.toFixed(2)) };
  }

  return { found: false, match_type: 'not_found', product: null };
}

export function toolCheckInventory(product, requestedQty) {
  if (!product) {
    return { sufficient: false, available_stock: 0, requested_qty: requestedQty || 0, shortfall: requestedQty || 0, reason: 'Sản phẩm không có trong danh mục' };
  }
  if (requestedQty === null || requestedQty === undefined || requestedQty <= 0) {
    return { sufficient: false, available_stock: product.available_stock, requested_qty: null, shortfall: null, reason: 'Thiếu số lượng hợp lệ' };
  }
  const sufficient = product.available_stock >= requestedQty;
  return {
    sufficient,
    available_stock: product.available_stock,
    requested_qty: requestedQty,
    shortfall: sufficient ? 0 : requestedQty - product.available_stock,
    reason: sufficient
      ? `Đủ tồn kho (${product.available_stock} >= ${requestedQty})`
      : `Thiếu ${requestedQty - product.available_stock} đơn vị (tồn: ${product.available_stock}, cần: ${requestedQty})`
  };
}

export function toolCheckLeadTime(matchedItems, deadlineDays) {
  const validLeadTimes = matchedItems
    .filter(it => it.product)
    .map(it => Number(it.product.lead_time_days || 0));

  const maxLeadTime = validLeadTimes.length > 0 ? Math.max(...validLeadTimes) : 0;

  if (deadlineDays === null || deadlineDays === undefined || deadlineDays <= 0) {
    return {
      feasible: null,
      max_lead_time_days: maxLeadTime,
      deadline_days: null,
      gap_days: null,
      reason: 'Chưa xác định thời hạn triển khai từ khách hàng'
    };
  }

  const feasible = maxLeadTime <= deadlineDays;
  return {
    feasible,
    max_lead_time_days: maxLeadTime,
    deadline_days: deadlineDays,
    gap_days: feasible ? deadlineDays - maxLeadTime : maxLeadTime - deadlineDays,
    reason: feasible
      ? `Đáp ứng kịp thời hạn (triển khai ${maxLeadTime} ngày <= yêu cầu ${deadlineDays} ngày)`
      : `Không kịp thời hạn (cần ${maxLeadTime} ngày > yêu cầu ${deadlineDays} ngày)`
  };
}

export function toolCalculatePricingAndPolicy(matchedItems, requestedDiscountPct, budget, policies) {
  const discountPct = (requestedDiscountPct !== null && requestedDiscountPct !== undefined && !Number.isNaN(requestedDiscountPct))
    ? Number(requestedDiscountPct)
    : 0;

  let subtotal = 0;
  const lineItems = matchedItems.map(it => {
    const unitPrice = it.product ? Number(it.product.unit_price || 0) : 0;
    const qty = it.quantity || 0;
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;
    return {
      ...it,
      unit_price: unitPrice,
      line_total: lineTotal
    };
  });

  const discountAmount = Math.round(subtotal * (discountPct / 100));
  const finalTotal = subtotal - discountAmount;

  const sortedPolicies = [...(policies || [])].sort((a, b) => a.max_discount_pct - b.max_discount_pct);
  const repPolicy = sortedPolicies[0] || { policy_id: 'POL-DEFAULT', role: 'Nhân viên Kinh doanh', max_discount_pct: 10, approver: 'Tự duyệt (NVKD)' };

  let matchedPolicy = sortedPolicies.find(p => discountPct <= p.max_discount_pct);
  let exceedsMaxPolicy = false;
  if (!matchedPolicy) {
    matchedPolicy = sortedPolicies[sortedPolicies.length - 1] || repPolicy;
    exceedsMaxPolicy = true;
  }

  const requiresApproval = discountPct > repPolicy.max_discount_pct;
  const withinBudget = (budget !== null && budget !== undefined && budget > 0)
    ? finalTotal <= budget
    : null;

  return {
    line_items: lineItems,
    subtotal,
    discount_pct: discountPct,
    discount_amount: discountAmount,
    final_total: finalTotal,
    budget: budget || null,
    within_budget: withinBudget,
    budget_diff: withinBudget !== null ? budget - finalTotal : null,
    rep_max_discount_pct: repPolicy.max_discount_pct,
    requires_approval: requiresApproval,
    exceeds_max_policy: exceedsMaxPolicy,
    applied_policy: matchedPolicy,
    approver_required: requiresApproval ? matchedPolicy.approver : null
  };
}

export const TOOL_DEFINITIONS = [
  {
    name: 'extract_requirements',
    description: 'Bóc tách hạng mục, số lượng, ngân sách, thời hạn, chiết khấu và người phê duyệt từ văn bản yêu cầu.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              raw_name: { type: 'string' },
              sku_or_query: { type: 'string' },
              quantity: { type: ['number', 'null'] }
            }
          }
        },
        budget_vnd: { type: ['number', 'null'] },
        deadline_days: { type: ['number', 'null'] },
        requested_discount_pct: { type: ['number', 'null'] },
        customer_approver: { type: ['string', 'null'] }
      },
      required: ['items']
    }
  }
];

