// agent09.js — 7-Step Multi-Skill AI Agent for Binh Minh (De 09)

export function formatVND(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return 'Chưa xác định';
  return new Intl.NumberFormat('vi-VN').format(Math.round(num)) + ' VNĐ';
}

function daysBetween(d1Str, d2Str) {
  if (!d1Str || !d2Str) return null;
  const d1 = new Date(d1Str + 'T00:00:00');
  const d2 = new Date(d2Str + 'T00:00:00');
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return null;
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

export class AuditLogger09 {
  constructor() { this.entries = []; }
  log(step, entityId, tool, input, output, rule) {
    this.entries.push({
      seq: this.entries.length + 1,
      timestamp: new Date().toISOString(),
      step,
      entity_id: entityId,
      tool,
      input,
      output,
      rule_applied: rule
    });
  }
}

export function runBinhMinhAgent(dataset, reportDate) {
  const logger = new AuditLogger09();
  const rules = dataset.rules;
  const weights = rules.stage_weights || {};
  const staleThreshold = rules.stale_days_threshold || 14;

  // BƯỚC 1 & 2: Hợp nhất bản ghi trùng theo opp_id
  const grouped = new Map();
  for (const row of dataset.opportunities) {
    if (!grouped.has(row.opp_id)) grouped.set(row.opp_id, []);
    grouped.get(row.opp_id).push(row);
  }

  const cleanedOpps = [];
  for (const [oppId, rows] of grouped.entries()) {
    rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    const latest = { ...rows[0] };
    latest.merged_from = rows.map(r => r.source_file);
    latest.was_duplicated = rows.length > 1;
    if (latest.was_duplicated) {
      logger.log('Bước 2: Làm sạch', oppId, 'tool_merge_duplicates', { count: rows.length, sources: latest.merged_from }, { kept_stage: latest.stage, updated_at: latest.updated_at }, 'Giữ bản ghi cập nhật mới nhất');
    }
    cleanedOpps.push(latest);
  }

  // BƯỚC 3 & 4: Xác định trạng thái tại reportDate, tách doanh số đã bán, tính giá trị dự kiến
  const validOrders = dataset.orders.filter(o => !o.order_date || o.order_date <= reportDate);
  const orderByOpp = new Map();
  validOrders.forEach(o => orderByOpp.set(o.opp_id, o));

  const anomalies = [];
  const analyzedOpps = cleanedOpps.map(opp => {
    const acts = dataset.activities
      .filter(a => a.opp_id === opp.opp_id && (!a.activity_date || a.activity_date <= reportDate))
      .sort((a, b) => String(b.activity_date).localeCompare(String(a.activity_date)));
    const lastAct = acts[0] || null;
    const hist = dataset.status_history
      .filter(h => h.opp_id === opp.opp_id && (!h.changed_at || h.changed_at <= reportDate))
      .sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at)));

    const effectiveStage = (hist[0]?.stage && String(hist[0].changed_at) >= String(opp.updated_at)) ? hist[0].stage : opp.stage;
    const matchedOrder = orderByOpp.get(opp.opp_id) || null;
    const weight = weights[effectiveStage] ?? 0;

    const missingFields = [];
    if (opp.value_vnd === null || opp.value_vnd <= 0) missingFields.push('Thiếu giá trị cơ hội');
    if (!opp.expected_close_date) missingFields.push('Thiếu ngày dự kiến chốt');
    if (!opp.confirmed_info) missingFields.push('Thiếu thông tin xác nhận khách hàng');

    const lossSignal = lastAct && /(mất khách|chọn nhà cung cấp khác|từ chối|hủy)/i.test(lastAct.note);
    const daysPastClose = opp.expected_close_date ? daysBetween(opp.expected_close_date, reportDate) : null;
    const daysSinceAct = lastAct ? daysBetween(lastAct.activity_date, reportDate) : null;
    const isOverdueNoAct = daysPastClose !== null && daysPastClose > 0 && (daysSinceAct === null || daysSinceAct >= staleThreshold);

    let finalCategory = 'Cơ hội mở hợp lệ';
    let includeInOpenPipeline = true;
    let anomalyType = null;
    let anomalyReason = '';

    if (effectiveStage === 'Chốt thắng (Won)' || matchedOrder) {
      includeInOpenPipeline = false;
      if (matchedOrder && effectiveStage !== 'Chốt thắng (Won)') {
        finalCategory = 'Mâu thuẫn (Đã có đơn hàng)';
        anomalyType = 'Mâu thuẫn dữ liệu';
        anomalyReason = `Đã ghi nhận đơn ${matchedOrder.order_id} (${formatVND(matchedOrder.amount_vnd)}) nhưng hồ sơ vẫn ở giai đoạn "${effectiveStage}".`;
      } else {
        finalCategory = 'Đã chốt (Won)';
      }
    } else if (effectiveStage === 'Mất khách (Lost)' || lossSignal) {
      includeInOpenPipeline = false;
      if (lossSignal && effectiveStage !== 'Mất khách (Lost)') {
        finalCategory = 'Mâu thuẫn (Mất khách chưa cập nhật)';
        anomalyType = 'Mâu thuẫn trạng thái';
        anomalyReason = `Hoạt động ngày ${lastAct.activity_date} ghi "${lastAct.note}" nhưng chưa đổi trạng thái sang Lost.`;
      } else {
        finalCategory = 'Mất khách (Lost)';
      }
    } else if (isOverdueNoAct) {
      finalCategory = 'Quá hạn / Treo';
      anomalyType = 'Quá hạn không hoạt động';
      anomalyReason = `Quá ngày dự kiến chốt (${opp.expected_close_date}) ${daysPastClose} ngày và không có hoạt động mới trong ${staleThreshold} ngày.`;
    } else if (missingFields.length > 0) {
      finalCategory = 'Thiếu thông tin';
      anomalyType = 'Thiếu thông tin';
      anomalyReason = missingFields.join('; ');
    }

    const weightedValue = includeInOpenPipeline && opp.value_vnd ? Math.round(opp.value_vnd * weight) : 0;

    if (anomalyType) {
      anomalies.push({
        opp_id: opp.opp_id,
        customer: opp.customer,
        rep_id: opp.rep_id,
        anomaly_type: anomalyType,
        reason: anomalyReason,
        action: anomalyType.includes('Mâu thuẫn') ? 'NVKD & Trưởng phòng xác minh để đóng Won/Lost chuẩn' : 'NVKD cập nhật thông tin xác nhận hoặc đóng cơ hội'
      });
    }

    logger.log(
      'Bước 3-4: Trạng thái & Doanh số',
      opp.opp_id,
      'tool_evaluate_opportunity',
      { stage: effectiveStage, report_date: reportDate, has_order: Boolean(matchedOrder) },
      { category: finalCategory, include_open: includeInOpenPipeline, weight, weighted_value: weightedValue },
      'Tách đơn hàng đã ghi nhận khỏi cơ hội mở; nhân trọng số giai đoạn'
    );

    return {
      ...opp,
      effective_stage: effectiveStage,
      weight,
      weighted_value: weightedValue,
      include_in_open_pipeline: includeInOpenPipeline,
      final_category: finalCategory,
      anomaly_type: anomalyType,
      anomaly_reason: anomalyReason,
      last_activity: lastAct,
      days_to_close: daysPastClose !== null ? -daysPastClose : null
    };
  });

  // BƯỚC 5: Báo cáo KPI theo 10 Nhân viên Kinh doanh
  const repMap = new Map();
  dataset.sales_reps.forEach(r => {
    repMap.set(r.rep_id, {
      rep_id: r.rep_id,
      name: r.name,
      target_vnd: r.target_vnd,
      recognized_sales_vnd: 0,
      open_value_vnd: 0,
      weighted_forecast_vnd: 0,
      open_count: 0,
      anomaly_count: 0
    });
  });

  validOrders.forEach(o => {
    const rep = repMap.get(o.rep_id);
    if (rep) rep.recognized_sales_vnd += (o.amount_vnd || 0);
  });

  analyzedOpps.forEach(opp => {
    const rep = repMap.get(opp.rep_id);
    if (!rep) return;
    if (opp.include_in_open_pipeline) {
      rep.open_count += 1;
      rep.open_value_vnd += (opp.value_vnd || 0);
      rep.weighted_forecast_vnd += opp.weighted_value;
    }
    if (opp.anomaly_type) rep.anomaly_count += 1;
  });

  const repKPIs = Array.from(repMap.values()).map(r => ({
    ...r,
    completion_pct: r.target_vnd > 0 ? Math.round((r.recognized_sales_vnd / r.target_vnd) * 1000) / 10 : 0
  }));

  logger.log('Bước 5: KPI Nhân viên', 'ALL_REPS', 'tool_compute_rep_kpis', { rep_count: repKPIs.length }, { total_recognized: repKPIs.reduce((s, r) => s + r.recognized_sales_vnd, 0) }, 'Tách biệt doanh số từ bảng orders');

  // BƯỚC 6: Top 5 cơ hội ưu tiên tuần tiếp theo (chỉ chọn cơ hội mở hợp lệ & đủ thông tin xác nhận)
  const eligibleForTop5 = analyzedOpps.filter(o =>
    o.include_in_open_pipeline &&
    o.confirmed_info &&
    !o.anomaly_type &&
    o.value_vnd > 0
  );

  const maxVal = Math.max(...eligibleForTop5.map(o => o.value_vnd), 1);
  const scoredTop = eligibleForTop5.map(o => {
    const daysLeft = o.days_to_close !== null ? Math.max(0, o.days_to_close) : 30;
    const urgencyScore = daysLeft <= 7 ? 25 : (daysLeft <= 14 ? 15 : 5);
    const score = Math.round((o.weight * 45 + (o.value_vnd / maxVal) * 30 + urgencyScore) * 10) / 10;
    return {
      ...o,
      priority_score: score,
      rationale: `Giai đoạn ${o.effective_stage} (trọng số ${Math.round(o.weight * 100)}%), giá trị ${formatVND(o.value_vnd)}, dự kiến chốt ${o.expected_close_date} (đã xác nhận đủ thông tin).`,
      next_week_action: o.weight >= 0.75
        ? 'Trưởng phòng hỗ trợ chốt điều khoản cuối & ký hợp đồng trong tuần tới.'
        : 'NVKD tổ chức họp chốt giải pháp kỹ thuật & báo giá chính thức.'
    };
  }).sort((a, b) => b.priority_score - a.priority_score);

  const topN = rules.top_n || 5;
  const topPriorities = scoredTop.slice(0, topN);
  const topNote = topPriorities.length < topN
    ? `Chỉ có ${topPriorities.length}/${topN} cơ hội mở hợp lệ đủ thông tin xác nhận (các cơ hội còn lại bị loại do thiếu xác nhận, quá hạn hoặc mâu thuẫn).`
    : `Đã chọn đủ ${topN} cơ hội hợp lệ có điểm ưu tiên cao nhất.`;

  logger.log('Bước 6: Top 5 Ưu tiên', 'TOP_5', 'tool_select_top_priorities', { eligible_count: eligibleForTop5.length }, { selected_ids: topPriorities.map(t => t.opp_id), note: topNote }, 'Loại bỏ cơ hội thiếu thông tin xác nhận / mâu thuẫn / quá hạn');

  const totalRecognized = repKPIs.reduce((s, r) => s + r.recognized_sales_vnd, 0);
  const totalTarget = repKPIs.reduce((s, r) => s + r.target_vnd, 0);
  const totalOpenRaw = repKPIs.reduce((s, r) => s + r.open_value_vnd, 0);
  const totalWeightedForecast = repKPIs.reduce((s, r) => s + r.weighted_forecast_vnd, 0);

  return {
    report_date: reportDate,
    summary: {
      total_opportunities: analyzedOpps.length,
      total_target_vnd: totalTarget,
      total_recognized_sales_vnd: totalRecognized,
      overall_completion_pct: totalTarget > 0 ? Math.round((totalRecognized / totalTarget) * 1000) / 10 : 0,
      total_open_raw_vnd: totalOpenRaw,
      total_weighted_forecast_vnd: totalWeightedForecast,
      anomaly_count: anomalies.length,
      top_note: topNote
    },
    opportunities: analyzedOpps,
    rep_kpis: repKPIs,
    anomalies,
    top_priorities: topPriorities,
    audit_logs: logger.entries
  };
}

