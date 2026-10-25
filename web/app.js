import { mountPhysicalScenes } from './three-scenes.js';
import {
  animateNumber,
  attachSpotlight,
  attachTilt,
  observeAnimatedContent,
} from './react-bits-lite.js';

const state = { meals: [], factors: {}, current: null };
let currentImpact = null;
let assemblyTimer = 0;
const $ = (id) => document.getElementById(id);
const fmt = (number, digits = 1) => Number(number).toLocaleString('zh-CN', { maximumFractionDigits: digits });
const factor = (id) => state.factors[id];
// Keep exact unit boundaries stable when binary floating-point leaves a tiny tail.
const unitCount = (value, unit) => Math.max(1, Math.ceil(Number((Number(value) / unit).toFixed(9))));

const METRIC_METHODS = {
  water: {
    kicker: 'WATER / 用水算法',
    title: '用水是怎么换算出来的？',
    lede: '把每种原料的质量乘以对应的水足迹因子，再加上纸制包装的用水估算。结果是筛选级水足迹，不是餐厅水表读数。',
    formula: 'W = Σ (mᵢ × wᵢ) + mₚ × wₚ',
    unit: 'mᵢ：原料质量（kg）；wᵢ：原料水足迹（L/kg）。页面把 100 L 设为 1 片，家庭日用水参照为 110 L/人/天。',
    source: '因子来源：data/factors.json · OWID / Poore–Nemecek 2018 与项目包装筛选因子。',
  },
  land: {
    kicker: 'LAND / 土地算法',
    title: '土地占用为什么是 m²·yr？',
    lede: '土地不是一次性消失的面积，而是“占用面积 × 时间”的年度占用量。原料和包装分别贡献一部分 m²·yr。',
    formula: 'A = Σ (mᵢ × aᵢ) + mₚ × aₚ',
    unit: 'aᵢ：土地因子（m²·yr/kg）。页面把 0.5 m²·yr 设为 1 块；天安门广场约 440,000 m² 只作为比例参照。',
    source: '因子来源：data/factors.json · OWID / Poore–Nemecek 2018 与项目包装筛选因子。',
  },
  labor: {
    kicker: 'LABOR / 人力算法',
    title: '人力数字代表多少人？',
    lede: '当前版本把人力作为生产、门店和物流环节的模型工时情景，避免把估算工时误读成实际员工数量。',
    formula: 'H = Σ(tₛₜₐgₑ) ÷ 60',
    unit: 'tₛₜₐgₑ 是每个供应链环节投入的人力分钟：养殖/种植、中央厨房、仓储干线、门店、制作包装和配送。结果是累计 person-hours，不是一个人的连续等待时间。',
    source: '来源：项目 delivery-default 情景；MCP 不提供员工排班或供应商工时，所有阶段均标注为估算。',
  },
  cost: {
    kicker: 'COST / 资金算法',
    title: '资金成本和售价有什么区别？',
    lede: '资金是从农场到送达的投入情景：原料、饲料灌溉、加工、冷链、运输、设备装修、煤气电力、人工与外包装分别计入，不等于菜单售价。',
    formula: 'C = Σ(原料 + 农场 + 加工 + 冷链 + 运输 + 设施 + 能源 + 人工 + 包装 + 配送)',
    unit: '每一项都是人民币成本池情景；¥100 = 1 张，10 张 = 1 捆。页面把灶台、装修、煤气、工资和上游投入都单独列出，再合计为全链路资金。',
    source: '来源：项目 full-chain-screening-v1 情景；MCP 未提供供应商发票、工资、租金或折旧，不构成财务审计。',
  },
};

const DEFAULT_LABOR_CHAIN = [
  { id: 'farm', label: '养殖 / 种植分摊', minutes: 4 },
  { id: 'central-kitchen', label: '中央厨房与加工', minutes: 7 },
  { id: 'logistics', label: '仓储与干线运输', minutes: 2 },
  { id: 'store-receiving', label: '门店收货', minutes: 1.5 },
  { id: 'cashier', label: '收银与接单', minutes: 1 },
  { id: 'cooking', label: '汉堡与薯条制作', minutes: 4 },
  { id: 'packing', label: '组装与包装', minutes: 2 },
  { id: 'delivery', label: '司机与末端配送', minutes: 7 },
];

function laborChainFor(meal) {
  if (Array.isArray(meal.labor_chain) && meal.labor_chain.length) return meal.labor_chain;
  const servings = meal.tier === '双人餐' || /双人|分享|亲子/.test(meal.name) ? 2 : 1;
  return DEFAULT_LABOR_CHAIN.map((stage) => ({ ...stage, minutes: stage.minutes * (stage.id === 'cashier' || stage.id === 'delivery' ? 1 : servings) }));
}

function laborHoursFor(meal) {
  return laborChainFor(meal).reduce((sum, stage) => sum + Number(stage.minutes || 0), 0) / 60;
}

// MCP exposes menu structure and price, but not supplier invoices, wages,
// rent, utilities or capital depreciation. This explicit scenario keeps each
// hidden cash pool visible and replaceable instead of treating menu price as
// production cost.
const RAW_COST_RMB_PER_KG = { beef: 42, chicken: 24, bun: 8, cheese: 28, lettuce: 4, sauce: 10, potato: 5.5, cola: 2, chicken_patty: 24 };
function fullChainCostFor(meal) {
  if (meal.cost_model?.lines?.length) return meal.cost_model;
  const raw = (meal.components || []).reduce((sum, part) => sum + Number(part.quantity_kg || 0) * (RAW_COST_RMB_PER_KG[part.factor_id] ?? 8), 0);
  const servings = Number(meal.transport_mass_kg || 0) > 1 ? 2 : 1;
  const mass = Number(meal.transport_mass_kg || 0);
  const tonneKm = mass * Number(meal.transport_distance_km || 0) / 1000;
  const chain = laborChainFor(meal);
  const byId = Object.fromEntries(chain.map((stage) => [stage.id, Number(stage.minutes || 0)]));
  const storeMinutes = ['store-receiving', 'cashier', 'cooking', 'packing'].reduce((sum, id) => sum + (byId[id] || 0), 0);
  const lines = [
    ['raw-materials', '原料采购与初级产品', raw, '各原料 kg × 原料采购价'],
    ['farm-inputs', '农场 / 饲料 / 灌溉投入', raw * .9, '原料采购价 × 90% 上游投入情景'],
    ['processing', '中央厨房 / 加工', raw * .45 + 2.5 * servings, '原料价 × 45% + 每份加工固定投入'],
    ['cold-chain', '仓储 / 冷链', mass * 1.4, '运输质量 kg × ¥1.40'],
    ['transport', '干线运输', tonneKm * 6.5 + 1.2, 't·km × ¥6.50 + 车辆调度分摊'],
    ['store-facility', '门店装修 / 灶台设备折旧', 8 + 4 * servings, '农场、加工线、门店设备与装修分摊'],
    ['utilities', '煤气 / 电力 / 用水', Number(meal.store_kwh || 0) * 2.3 + .75 * servings, '门店 kWh × ¥2.30 + 燃气与用水情景'],
    ['store-labor', '门店收货 / 收银 / 制作 / 包装人工', storeMinutes / 60 * 32, '门店 person-minutes × ¥32/h'],
    ['packaging', '外包装纸 / 印刷', Number(meal.packaging_kg || 0) * 32 + 1, '包装 kg × ¥32 + 印刷与耗材'],
    ['delivery', '司机 / 末端配送', (byId.delivery || 0) / 60 * 35 + 1.5, '配送 person-minutes × ¥35/h + 车辆末端分摊'],
  ].map(([id, label, amount, basis]) => ({ id, label, amount: Math.round(Math.max(0, amount) * 100) / 100, basis }));
  return { scenario: 'full-chain-screening-v1', currency: 'CNY', total_rmb: Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100, lines, note: '非麦当劳财务数据；MCP 未提供供应商发票、工资、租金或折旧，金额为可替换的项目情景。' };
}

function renderLaborChain(chain) {
  const target = $('labor-chain');
  if (!target) return;
  target.innerHTML = chain.map((stage) => `<span class="labor-chip"><b>${stage.label}</b><em>${fmt(stage.minutes, 1)} min</em></span>`).join('');
}

function renderCostChain(costModel) {
  const target = $('cost-chain');
  if (!target || !costModel?.lines) return;
  const max = Math.max(...costModel.lines.map((line) => Number(line.amount || 0)), 1);
  target.innerHTML = costModel.lines.map((line) => `<div class="cost-chain-row" title="${line.basis}"><span>${line.label}</span><i style="--cost-width:${Math.max(4, Number(line.amount || 0) / max * 100)}%"></i><b>¥${fmt(line.amount, 0)}</b></div>`).join('');
}

function range(low, mid, high) { return { p10: low, p50: mid, p90: high }; }

function metricResult(metric, impact) {
  if (metric === 'water') return `${fmt(impact.water.p50, 0)} L（p10 ${fmt(impact.water.p10, 0)} · p90 ${fmt(impact.water.p90, 0)}）`;
  if (metric === 'land') return `${fmt(impact.land.p50, 2)} m²·yr（年度占用）`;
  if (metric === 'labor') return `${fmt(impact.labor, 2)} h（约 ${unitCount(impact.labor, 8)} 枚工时标记）`;
  return `¥${fmt(impact.cost, 0)}（约 ${fmt(impact.cost / 1000, 2)} 捆百元钞票）`;
}

function openMetricDialog(metric) {
  const method = METRIC_METHODS[metric];
  const dialog = $('metric-dialog');
  if (!method || !dialog || !currentImpact) return;
  $('metric-dialog-kicker').textContent = method.kicker;
  $('metric-dialog-title').textContent = method.title;
  $('metric-dialog-lede').textContent = method.lede;
  $('metric-dialog-formula').textContent = method.formula;
  $('metric-dialog-unit').textContent = method.unit;
  $('metric-dialog-result').textContent = metricResult(metric, currentImpact);
  $('metric-dialog-source').textContent = method.source;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function renderAssemblyOverview(impact) {
  const overview = $('assembly-object-grid');
  if (!overview) return;
  const objects = [
    { key: 'acrylic', label: 'WATER', value: `${fmt(impact.water.p50, 0)} L`, rule: '1 片 = 100 L', count: unitCount(impact.water.p50, 100), unit: '片' },
    { key: 'wood', label: 'LAND', value: `${fmt(impact.land.p50, 2)} m²·yr`, rule: '1 块 = 0.5 m²·yr', count: unitCount(impact.land.p50, 0.5), unit: '块' },
    { key: 'brass', label: 'LABOR', value: `${fmt(impact.labor, 2)} h`, rule: '1 枚 = 8 h', count: unitCount(impact.labor, 8), unit: '枚' },
    { key: 'paper', label: 'COST', value: `¥${fmt(impact.cost, 0)}`, rule: '1 捆 = ¥1,000（10 张）', count: unitCount(impact.cost, 1000), unit: '捆' },
  ];
  overview.innerHTML = objects.map((item, objectIndex) => {
    const visible = Math.min(item.count, 12);
    const pieces = Array.from({ length: visible }, (_, index) => `<i class="assembly-piece" style="--assembly-index:${index};--assembly-left:${18 + (index % 5) * 22}px;--assembly-bottom:${10 + Math.floor(index / 5) * 22}px"></i>`).join('');
    const overflow = item.count > visible ? `<span class="assembly-overflow">+${item.count - visible}</span>` : '';
    return `<article class="assembly-object assembly-${item.key}" style="--assembly-delay:${objectIndex * 110}ms"><div class="assembly-object-head"><span>${item.label}</span><b>${item.value}</b></div><div class="assembly-stack">${pieces}${overflow}</div><div class="assembly-object-foot"><span>${item.rule}</span><span>${item.count} ${item.unit}</span></div></article>`;
  }).join('');
}

function playPhysicalAssembly(mode = 'cards') {
  const grid = $('physical-grid');
  if (!grid) return;
  grid.classList.remove('is-assembling');
  void grid.offsetWidth;
  grid.classList.add('is-assembling');
  clearTimeout(assemblyTimer);
  $('assembly-status').textContent = mode === 'pullback' ? '总览装配中 · 4 类物件' : '逐件装配中 · 数量绑定读数';
  assemblyTimer = window.setTimeout(() => {
    $('assembly-status').textContent = mode === 'pullback' ? '装置已就位' : '装配完成 · 可点击指标查看算法';
  }, mode === 'pullback' ? 1450 : 1050);
}

function calculate(meal) {
  let carbon = 0; let carbonLow = 0; let carbonHigh = 0;
  let water = 0; let waterLow = 0; let waterHigh = 0;
  let land = 0; let landLow = 0; let landHigh = 0;
  for (const part of meal.components) {
    const current = factor(part.factor_id);
    if (!current) continue;
    const quantity = part.quantity_kg;
    carbon += quantity * current.carbon;
    carbonLow += quantity * current.carbon_low;
    carbonHigh += quantity * current.carbon_high;
    water += quantity * current.water_l_per_unit;
    waterLow += quantity * current.water_low;
    waterHigh += quantity * current.water_high;
    land += quantity * current.land_m2_year_per_unit;
    landLow += quantity * current.land_low;
    landHigh += quantity * current.land_high;
  }
  const transport = factor('transport-road');
  const grid = factor('store-electricity');
  const packaging = factor('paper-packaging');
  const tonneKm = meal.transport_mass_kg * meal.transport_distance_km / 1000;
  carbon += tonneKm * transport.carbon + meal.store_kwh * grid.carbon + meal.packaging_kg * packaging.carbon;
  carbonLow += tonneKm * transport.carbon_low + meal.store_kwh * grid.carbon_low + meal.packaging_kg * packaging.carbon_low;
  carbonHigh += tonneKm * transport.carbon_high + meal.store_kwh * grid.carbon_high + meal.packaging_kg * packaging.carbon_high;
  water += meal.packaging_kg * packaging.water_l_per_unit;
  waterLow += meal.packaging_kg * packaging.water_low;
  waterHigh += meal.packaging_kg * packaging.water_high;
  land += meal.packaging_kg * packaging.land_m2_year_per_unit;
  landLow += meal.packaging_kg * packaging.land_low;
  landHigh += meal.packaging_kg * packaging.land_high;
  const costModel = fullChainCostFor(meal);
  return {
    carbon: range(carbonLow, carbon, carbonHigh),
    water: range(waterLow, water, waterHigh),
    land: range(landLow, land, landHigh),
    labor: laborHoursFor(meal),
    cost: costModel.total_rmb,
    costBreakdown: costModel,
  };
}

function renderMeals() {
  const list = $('meal-list');
  list.innerHTML = '';
  state.meals.forEach((meal, index) => {
    const button = document.createElement('button');
    button.className = 'meal-card spotlight-card tilt-card';
    button.dataset.id = meal.id;
    button.dataset.index = String(index);
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', `查看${meal.name}的环境账本`);
    button.innerHTML = `<span class="meal-tier">${meal.tier} · ${meal.protein}</span><div><h3>${meal.name}</h3><p>${meal.description}</p></div><span class="meal-tag">${meal.tags.join(' / ')}</span><span class="meal-arrow" aria-hidden="true">↗</span>`;
    button.addEventListener('click', () => selectMeal(meal.id));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : state.meals.length - 1)) % state.meals.length;
      selectMeal(state.meals[nextIndex].id, { focus: true });
    });
    list.appendChild(button);
    attachSpotlight(button);
    attachTilt(button, 2.4);
  });
}

function makePieces(container, count, className, { limit = 36, rulerEvery = 10 } = {}) {
  if (!container) return;
  container.innerHTML = '';
  const visible = Math.min(count, limit);
  for (let index = 0; index < visible; index += 1) {
    const piece = document.createElement('i');
    piece.className = `${className}${(index + 1) % rulerEvery === 0 ? ' ruler-piece' : ''}`;
    piece.style.setProperty('--piece-index', index);
    piece.style.setProperty('--piece-tilt', `${((index * 17) % 7) - 3}deg`);
    piece.style.setProperty('--piece-left', `${10 + (index % 4) * 22}px`);
    piece.setAttribute('aria-hidden', 'true');
    container.appendChild(piece);
  }
  if (count > limit) {
    const overflow = document.createElement('span');
    overflow.className = 'piece-overflow';
    overflow.textContent = `+${count - limit}`;
    container.appendChild(overflow);
  }
}

function renderPhysical(impact, meal) {
  currentImpact = impact;
  const waterUnits = unitCount(impact.water.p50, 100);
  const landUnits = unitCount(impact.land.p50, 0.5);
  const laborUnits = unitCount(impact.labor, 8);
  const moneyUnits = unitCount(impact.cost, 1000);
  makePieces($('water-pieces'), waterUnits, 'water-piece', { limit: 30 });
  makePieces($('land-pieces'), landUnits, 'land-piece', { limit: 30 });
  makePieces($('people-grid'), laborUnits, 'labor-piece', { limit: 48 });
  makePieces($('money-stack'), moneyUnits, 'money-piece', { limit: 24 });
  animateNumber($('water-reading'), impact.water.p50, { format: (value) => fmt(value, 0) });
  animateNumber($('land-reading'), impact.land.p50, { format: (value) => fmt(value, 2) });
  animateNumber($('labor-reading'), impact.labor, { format: (value) => fmt(value, 2) });
  animateNumber($('money-reading'), impact.cost, { format: (value) => `¥${fmt(value, 0)}` });
  animateNumber($('water-households'), impact.water.p50 / 110, { format: (value) => fmt(value, 1) });
  animateNumber($('money-burgers'), impact.cost / 1000, { format: (value) => fmt(value, 2) });
  $('land-dot').style.transform = `scale(${Math.max(.8, Math.min(24, Math.sqrt(impact.land.p50 / 7200) * 22))})`;
  const laborChain = laborChainFor(meal);
  renderLaborChain(laborChain);
  renderCostChain(impact.costBreakdown);
  renderAssemblyOverview(impact);
  playPhysicalAssembly($('physical-pullback-stage').classList.contains('is-open') ? 'pullback' : 'cards');
  mountPhysicalScenes({ water: $('water-canvas'), land: $('land-canvas'), labor: $('labor-canvas'), money: $('money-canvas') }, {
    waterLitres: impact.water.p50,
    landM2Year: impact.land.p50,
    laborHours: impact.labor,
    laborChain,
    costRmb: impact.cost,
  });
}

function renderImpact() {
  const meal = state.current;
  const impact = calculate(meal);
  const source = meal.source || 'offline fixture';
  $('meal-title').textContent = meal.name;
  $('meal-description').textContent = meal.description;
  $('source-chip').textContent = source === 'offline fixture' ? 'OFFLINE FIXTURE' : 'MCP LIVE MENU';
  $('data-status').textContent = source === 'offline fixture' ? '离线示例数据 · 可替换为 MCP 实时菜单' : 'MCP 实时菜单 · 估算因子仍可替换';
  animateNumber($('carbon-p50'), impact.carbon.p50, { format: (value) => fmt(value, 1) });
  $('carbon-range').textContent = `p10 ${fmt(impact.carbon.p10, 1)} · p90 ${fmt(impact.carbon.p90, 1)}`;
  $('metrics').innerHTML = [
    ['water', 'WATER / 用水', `${fmt(impact.water.p50, 0)} L`, `p10 ${fmt(impact.water.p10, 0)} · p90 ${fmt(impact.water.p90, 0)}`],
    ['land', 'LAND / 土地', `${fmt(impact.land.p50, 2)} m²·yr`, '按年度占用估算'],
    ['labor', 'LABOR / 人力', `${fmt(impact.labor, 2)} h`, '全链路累计投入，不是单一岗位'],
    ['cost', 'COST / 资金', `¥${fmt(impact.cost, 0)}`, '资金情景，不等于售价'],
  ].map(([metric, label, value, note]) => `<button type="button" class="metric-card spotlight-card" data-metric="${metric}" aria-haspopup="dialog"><span class="metric-label">${label}</span><span class="metric-value">${value}</span><span class="metric-note">${note}</span><span class="metric-more">查看算法 ↗</span></button>`).join('');
  document.querySelectorAll('#metrics .spotlight-card').forEach((card) => {
    attachSpotlight(card);
    card.addEventListener('click', () => openMetricDialog(card.dataset.metric));
  });
  const max = Math.max(...meal.components.map((part) => part.quantity_kg * factor(part.factor_id).carbon), .01);
  const componentRows = meal.components.map((part) => {
    const value = part.quantity_kg * factor(part.factor_id).carbon;
    return `<div class="breakdown-row"><span>${part.display || part.name}</span><div class="breakdown-bar"><i style="--w:${Math.max(4, value / max * 100)}%"></i></div><b>${fmt(value, 2)}</b></div>`;
  }).join('');
  const logisticsValue = impact.carbon.p50 - meal.components.reduce((sum, part) => sum + part.quantity_kg * factor(part.factor_id).carbon, 0);
  $('breakdown').innerHTML = `${componentRows}<div class="breakdown-row"><span>包装 + 门店 + 运输</span><div class="breakdown-bar"><i class="bar-cyan" style="--w:18%"></i></div><b>${fmt(logisticsValue, 2)}</b></div>`;
  const usedFactors = [...new Set(meal.components.map((part) => part.factor_id).concat(['paper-packaging', 'store-electricity', 'transport-road']))];
  $('provenance').innerHTML = usedFactors.map((id) => {
    const current = factor(id);
    return `<details><summary>${current.name} · ${current.unit}</summary><p>${current.source} · ${current.geography} · ${current.scope}<br>区间 ${current.carbon_low}–${current.carbon_high} kgCO₂e / ${current.unit}<br>${current.note || '因子可替换，结果仅供筛选级比较。'}</p></details>`;
  }).join('');
  $('land-title').textContent = `${fmt(impact.land.p50, 2)} m²·yr`;
  $('labor-title').textContent = `${fmt(impact.labor, 2)} 小时`;
  $('money-title').textContent = `¥${fmt(impact.cost, 0)}`;
  $('water-title').textContent = `${fmt(impact.water.p50, 0)} L`;
  renderPhysical(impact, meal);
}

function selectMeal(id, { focus = false } = {}) {
  state.current = state.meals.find((meal) => meal.id === id) || state.meals[0];
  document.querySelectorAll('.meal-card').forEach((button) => {
    const active = button.dataset.id === state.current.id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    if (active && focus) button.focus();
  });
  renderImpact();
}

function bootPhysicalInteractions() {
  document.querySelectorAll('.spotlight-card').forEach(attachSpotlight);
  const pullback = $('pullback-button');
  const grid = $('physical-grid');
  const pullbackStage = $('physical-pullback-stage');
  const dialog = $('metric-dialog');
  $('metric-dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  pullback.addEventListener('click', () => {
    const isPulledBack = pullbackStage.classList.toggle('is-open');
    grid.classList.toggle('is-pullback', isPulledBack);
    pullbackStage.setAttribute('aria-hidden', String(!isPulledBack));
    pullback.setAttribute('aria-pressed', String(isPulledBack));
    pullback.innerHTML = isPulledBack ? '回到读数 <span>↙</span>' : '展开装置 <span>↗</span>';
    $('assembly-verdict').textContent = isPulledBack
      ? '四类物件已拉回同一张工作台；点击“回到读数”重新播放。'
      : '选择“展开装置”查看整套餐的物件总览。';
    playPhysicalAssembly(isPulledBack ? 'pullback' : 'cards');
  });
  observeAnimatedContent();
}

async function boot() {
  try {
    const menu = await fetch('data/mcp_meals.json').then((response) => {
      if (!response.ok) throw new Error('no live MCP meal snapshot');
      return response.json();
    }).catch(() => fetch('data/menu.json').then((response) => response.json()));
    const factors = await fetch('data/factors.json').then((response) => response.json());
    state.meals = menu.meals;
    state.factors = Object.fromEntries(factors.factors.map((item) => [item.id, item]));
    renderMeals();
    bootPhysicalInteractions();
    selectMeal(state.meals[0].id);
  } catch (error) {
    $('data-status').textContent = '数据加载失败 · 请用本地静态服务器打开';
    console.error(error);
  }
}

boot();

