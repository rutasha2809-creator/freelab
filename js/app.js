// Фрилаб — трекер клиентов. Данные хранятся в облаке (Supabase), доступ — по e-mail/паролю.

const SUPABASE_URL = 'https://wwljbdfbrbzfyceqgqhe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3bGpiZGZicmJ6ZnljZXFncWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MTc3MTgsImV4cCI6MjEwNjA5MzcxOH0.R_51onVZkX157qNvnz_fQuASK0Z7KGOywGHiqqWZN7A';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** @typedef {{
 *   id:string, name:string, type:'recurring'|'oneoff', tasksDesc:string,
 *   planAmount:number|null, planDay:number|null, planDate:string|null,
 *   contract:{enabled:boolean, payerType:'individual'|'company'},
 *   createdAt:string
 * }} Client */
/** @typedef {{id:string, clientId:string, task:string, amount:number, planDate:string, factDate:string|null, createdAt:string}} Payment */

function normalizeClient(c) {
  return {
    id: c.id,
    name: c.name,
    type: c.type === 'oneoff' ? 'oneoff' : 'recurring',
    tasksDesc: c.tasksDesc ?? c.note ?? '',
    planAmount: c.planAmount != null ? Number(c.planAmount) : null,
    planDay: c.planDay != null ? Number(c.planDay) : null,
    planDate: c.planDate || null,
    contract: c.contract && typeof c.contract === 'object'
      ? { enabled: !!c.contract.enabled, payerType: c.contract.payerType === 'company' ? 'company' : 'individual' }
      : { enabled: false, payerType: 'individual' },
    createdAt: c.createdAt || todayISO(),
  };
}

// ---------- Supabase: соответствие строк БД и объектов приложения ----------

function rowToClient(row) {
  return normalizeClient({
    id: row.id,
    name: row.name,
    type: row.type,
    tasksDesc: row.tasks_desc,
    planAmount: row.plan_amount,
    planDay: row.plan_day,
    planDate: row.plan_date,
    contract: { enabled: row.contract_enabled, payerType: row.payer_type },
    createdAt: row.created_at,
  });
}

function clientToRow(c) {
  return {
    name: c.name,
    type: c.type,
    tasks_desc: c.tasksDesc || '',
    plan_amount: c.planAmount,
    plan_day: c.planDay,
    plan_date: c.planDate,
    contract_enabled: !!(c.contract && c.contract.enabled),
    payer_type: (c.contract && c.contract.payerType) || 'individual',
  };
}

function rowToPayment(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    task: row.task,
    amount: Number(row.amount) || 0,
    planDate: row.plan_date,
    factDate: row.fact_date,
    createdAt: row.created_at,
  };
}

function paymentToRow(p) {
  return {
    client_id: p.clientId,
    task: p.task,
    amount: p.amount,
    plan_date: p.planDate,
    fact_date: p.factDate,
  };
}

let state = { clients: [], payments: [] };

async function fetchState() {
  const [{ data: clientRows, error: cErr }, { data: paymentRows, error: pErr }] = await Promise.all([
    sb.from('clients').select('*'),
    sb.from('payments').select('*'),
  ]);
  if (cErr || pErr) {
    console.error(cErr || pErr);
    showToast('Не удалось загрузить данные из облака');
    return;
  }
  state = {
    clients: (clientRows || []).map(rowToClient),
    payments: (paymentRows || []).map(rowToPayment),
  };
  setReportPreset('month');
  renderAll();
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Форматирование ----------

const moneyFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
function formatMoney(n) {
  return moneyFmt.format(Math.round(Number(n) || 0)) + ' ₽';
}

function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function todayISO() {
  const d = new Date();
  return toISO(d);
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const WEEKDAYS = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

function todayLabel() {
  const d = new Date();
  return `${capitalize(WEEKDAYS[d.getDay()])}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---------- Производные данные: клиенты и налог ----------

function getClient(id) { return state.clients.find(c => c.id === id); }

function clientTaxRatePercent(client) {
  if (!client || !client.contract || !client.contract.enabled) return 0;
  return client.contract.payerType === 'company' ? 6 : 4;
}
function paymentTax(payment) {
  const c = getClient(payment.clientId);
  const rate = clientTaxRatePercent(c);
  return (Number(payment.amount) || 0) * rate / 100;
}
function paymentNet(payment) {
  return (Number(payment.amount) || 0) - paymentTax(payment);
}

// ---------- Производные данные: статусы и месяц ----------

function deriveStatus(payment) {
  if (payment.factDate) return 'paid';
  if (payment.planDate < todayISO()) return 'overdue';
  return 'pending';
}

function isInCurrentMonth(iso) {
  if (!iso) return false;
  const d = new Date(iso + 'T00:00:00');
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function computeStats() {
  let expected = 0, received = 0, pending = 0, overdue = 0;
  for (const p of state.payments) {
    const status = deriveStatus(p);
    if (isInCurrentMonth(p.planDate)) expected += Number(p.amount) || 0;
    if (status === 'paid' && isInCurrentMonth(p.factDate)) received += Number(p.amount) || 0;
    if (status === 'pending' && isInCurrentMonth(p.planDate)) pending += Number(p.amount) || 0;
    if (status === 'overdue') overdue += Number(p.amount) || 0;
  }
  return { expected, received, pending, overdue };
}

function computeTaxForecast() {
  let gross = 0, tax = 0;
  for (const p of state.payments) {
    if (!isInCurrentMonth(p.planDate)) continue;
    const c = getClient(p.clientId);
    const rate = clientTaxRatePercent(c);
    if (!rate) continue;
    gross += Number(p.amount) || 0;
    tax += paymentTax(p);
  }
  return { gross, tax, net: gross - tax };
}

// ---------- Рендер: статистика ----------

function renderStats() {
  const s = computeStats();
  const el = document.getElementById('stats');
  el.innerHTML = `
    <div class="stat stat--dark">
      <div class="stat__blob"></div>
      <div class="stat__icon" style="background:#FF7A50;">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5.5c0-1.9-2.2-3.5-5-3.5s-5 1.6-5 3.5 2.2 3 5 3 5 1.1 5 3-2.2 3.5-5 3.5-5-1.6-5-3.5" stroke="#1B1626" stroke-width="2.1" stroke-linecap="round"/></svg>
      </div>
      <div class="stat__label">Ожидается в этом месяце</div>
      <div class="stat__value">${formatMoney(s.expected)}</div>
    </div>
    <div class="stat">
      <div class="stat__icon" style="background:#E4F8EE;">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#1FAB6B" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="stat__label">Уже получено</div>
      <div class="stat__value">${formatMoney(s.received)}</div>
    </div>
    <div class="stat">
      <div class="stat__icon" style="background:#FFF3DC;">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#F0A020" stroke-width="2.1"/><path d="M12 7.5V12l3 2" stroke="#F0A020" stroke-width="2.1" stroke-linecap="round"/></svg>
      </div>
      <div class="stat__label">В ожидании оплаты</div>
      <div class="stat__value">${formatMoney(s.pending)}</div>
    </div>
    <div class="stat stat--danger">
      <div class="stat__icon" style="background:#FCE4E0;">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M12 8v5" stroke="#E8493C" stroke-width="2.3" stroke-linecap="round"/><circle cx="12" cy="16.3" r="1.1" fill="#E8493C"/><circle cx="12" cy="12" r="9" stroke="#E8493C" stroke-width="2.1"/></svg>
      </div>
      <div class="stat__label">Просрочено</div>
      <div class="stat__value">${formatMoney(s.overdue)}</div>
    </div>
  `;
}

function renderTaxForecast() {
  const el = document.getElementById('taxForecast');
  const hasContractClients = state.clients.some(c => c.contract && c.contract.enabled);
  if (!hasContractClients) {
    el.innerHTML = `<div class="forecastBand--empty">
      <span>Отметьте клиента «по договору», чтобы видеть здесь прогноз дохода и налога НПД за месяц</span>
    </div>`;
    return;
  }
  const f = computeTaxForecast();
  el.innerHTML = `
    <div class="forecastBand">
      <div class="forecastBand__item">
        <div class="forecastBand__label">Доход по договору за ${MONTHS[new Date().getMonth()]}</div>
        <div class="forecastBand__value">${formatMoney(f.gross)}</div>
      </div>
      <div class="forecastBand__item">
        <div class="forecastBand__label">Налог НПД</div>
        <div class="forecastBand__value" style="color:#FF9E7A;">${formatMoney(f.tax)}</div>
      </div>
      <div class="forecastBand__item">
        <div class="forecastBand__label">На руки</div>
        <div class="forecastBand__value" style="color:#7CE0AE;">${formatMoney(f.net)}</div>
      </div>
    </div>
  `;
}

// ---------- Рендер: списки платежей ----------

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const AVATAR_PALETTE = [
  { bg: '#EFE6FF', fg: '#6C3CE9' },
  { bg: '#FFE8DE', fg: '#FF7A50' },
  { bg: '#E4F8EE', fg: '#1FAB6B' },
  { bg: '#FFF3DC', fg: '#B87700' },
];
function avatarColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function statusPill(status) {
  if (status === 'paid') return '<span class="pill pill--paid">Оплачено</span>';
  if (status === 'overdue') return '<span class="pill pill--overdue">Просрочено</span>';
  return '<span class="pill pill--pending">Ожидается</span>';
}

function paymentRowHTML(payment, opts = {}) {
  const client = getClient(payment.clientId);
  if (!client) return '';
  const status = deriveStatus(payment);
  const color = avatarColor(client.id);
  const rate = clientTaxRatePercent(client);

  const leftHTML = opts.compact
    ? `<div>
        <div class="row__title">${escapeHTML(payment.task)}</div>
      </div>`
    : `<div class="row__avatar" style="background:${color.bg}; color:${color.fg};">${initials(client.name)}</div>
      <div>
        <div class="row__title">${escapeHTML(client.name)}</div>
        <div class="row__sub">${escapeHTML(payment.task)}</div>
      </div>
      ${client.type === 'recurring' ? `<span class="badge badge--violet">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M17 2.1l4 4-4 4M7 21.9l-4-4 4-4M21 6.1H8a4 4 0 0 0-4 4v2M3 17.9h13a4 4 0 0 0 4-4v-2" stroke="#6C3CE9" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Ежемесячно</span>` : ''}`;

  return `
    <div class="row ${status === 'overdue' ? 'row--overdue' : ''}" data-payment-id="${payment.id}">
      <div class="row__left">${leftHTML}</div>
      <div class="row__right">
        <div class="row__dates">
          <div class="row__dates-label">План / Факт</div>
          <div class="row__dates-value" style="${status === 'overdue' ? 'color:#E8493C;' : ''}">${formatDateShort(payment.planDate)} / ${formatDateShort(payment.factDate)}</div>
        </div>
        <div class="row__amount">
          <div>${formatMoney(payment.amount)}</div>
          ${rate > 0 ? `<div class="row__amount-sub">на руки ${formatMoney(paymentNet(payment))}</div>` : ''}
        </div>
        ${statusPill(status)}
        <div class="row__actions">
          ${status !== 'paid' ? `<button class="iconbtn" title="Отметить оплаченным" data-action="mark-paid" data-id="${payment.id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>` : ''}
          <button class="iconbtn" title="Редактировать" data-action="edit-payment" data-id="${payment.id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 20l.8-3.6L16 5.2a1.6 1.6 0 0 1 2.3 0l.5.5a1.6 1.6 0 0 1 0 2.3L7.6 19.2 4 20Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
          </button>
          <button class="iconbtn iconbtn--danger" title="Удалить" data-action="delete-payment" data-id="${payment.id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-9 0 1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function emptyStateHTML(title, sub, btnLabel, action) {
  return `
    <div class="empty">
      <div class="empty__title">${title}</div>
      <div class="empty__sub">${sub}</div>
      ${btnLabel ? `<button class="btn btn--dark" data-action="${action}">${btnLabel}</button>` : ''}
    </div>
  `;
}

function renderLists() {
  const recurringClients = new Set(state.clients.filter(c => c.type === 'recurring').map(c => c.id));
  const oneoffClients = new Set(state.clients.filter(c => c.type === 'oneoff').map(c => c.id));

  const recurringPayments = state.payments
    .filter(p => recurringClients.has(p.clientId))
    .sort(sortByRelevance);
  const oneoffPayments = state.payments
    .filter(p => oneoffClients.has(p.clientId))
    .sort(sortByRelevance);

  const listRecurring = document.getElementById('listRecurring');
  const listOneoff = document.getElementById('listOneoff');

  listRecurring.innerHTML = recurringPayments.length
    ? recurringPayments.map(p => paymentRowHTML(p)).join('')
    : emptyStateHTML('Пока нет постоянных клиентов', 'Добавьте клиента с ежемесячной оплатой и первую запись о платеже', '+ Добавить клиента', 'empty-add-client');

  listOneoff.innerHTML = oneoffPayments.length
    ? oneoffPayments.map(p => paymentRowHTML(p)).join('')
    : emptyStateHTML('Пока нет разовых задач', 'Добавьте разовую задачу с суммой и датой оплаты', '+ Добавить запись', 'empty-add-payment');
}

function sortByRelevance(a, b) {
  // Сначала просроченные, потом ожидающие (по дате), потом оплаченные (по дате оплаты, недавние сверху)
  const rank = s => (s === 'overdue' ? 0 : s === 'pending' ? 1 : 2);
  const ra = rank(deriveStatus(a)), rb = rank(deriveStatus(b));
  if (ra !== rb) return ra - rb;
  if (ra === 2) return (b.factDate || '').localeCompare(a.factDate || '');
  return (a.planDate || '').localeCompare(b.planDate || '');
}

// ---------- Рендер: клиенты ----------

function clientPlanLineText(client) {
  if (!client.planAmount) return '';
  if (client.type === 'recurring') {
    return `${formatMoney(client.planAmount)}${client.planDay ? ` · до ${client.planDay} числа` : ' · ежемесячно'}`;
  }
  return `${formatMoney(client.planAmount)}${client.planDate ? ` · до ${formatDateShort(client.planDate)}` : ''}`;
}

function renderClientsTable() {
  const el = document.getElementById('clientsTable');
  if (!state.clients.length) {
    el.innerHTML = emptyStateHTML('Пока нет клиентов', 'Добавьте первого клиента, чтобы начать вести учёт', '+ Добавить клиента', 'empty-add-client');
    return;
  }
  const rows = state.clients
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .map(client => {
      const payments = state.payments.filter(p => p.clientId === client.id);
      const total = payments.filter(p => deriveStatus(p) === 'paid').reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const openCount = payments.filter(p => deriveStatus(p) !== 'paid').length;
      const color = avatarColor(client.id);
      const planLine = clientPlanLineText(client);
      const subLine = planLine || client.tasksDesc || '';
      return `
        <div class="ctRow" data-client-id="${client.id}">
          <div class="ctRow__left">
            <div class="row__avatar" style="background:${color.bg}; color:${color.fg};">${initials(client.name)}</div>
            <div>
              <div class="row__title">${escapeHTML(client.name)}</div>
              ${subLine ? `<div class="row__sub">${escapeHTML(subLine)}</div>` : ''}
            </div>
            ${client.type === 'recurring' ? '<span class="badge badge--violet">Постоянный</span>' : '<span class="badge badge--violet" style="background:#FFE8DE;color:#FF7A50;">Разовый</span>'}
            ${client.contract && client.contract.enabled
              ? `<span class="badge badge--contract">Договор · ${client.contract.payerType === 'company' ? '6%' : '4%'}</span>`
              : '<span class="badge badge--nocontract">Без договора</span>'}
          </div>
          <div class="ctRow__stats">
            <div>
              <div class="ctRow__stat-label">Получено всего</div>
              <div class="ctRow__stat-value">${formatMoney(total)}</div>
            </div>
            <div>
              <div class="ctRow__stat-label">Открытых записей</div>
              <div class="ctRow__stat-value">${openCount}</div>
            </div>
          </div>
          <div class="row__actions">
            <button class="iconbtn" title="Добавить задачу" data-action="add-payment-for" data-id="${client.id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
            </button>
            <button class="iconbtn" title="Редактировать" data-action="edit-client" data-id="${client.id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 20l.8-3.6L16 5.2a1.6 1.6 0 0 1 2.3 0l.5.5a1.6 1.6 0 0 1 0 2.3L7.6 19.2 4 20Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
            </button>
            <button class="iconbtn iconbtn--danger" title="Удалить клиента" data-action="delete-client" data-id="${client.id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-9 0 1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  el.innerHTML = rows;
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Рендер: карточка клиента (детали) ----------

let detailClientId = null;
const clientDetailModal = document.getElementById('clientDetailModal');

function openClientDetail(clientId) {
  const c = getClient(clientId);
  if (!c) return;
  detailClientId = clientId;
  document.getElementById('detailClientName').textContent = c.name;

  const typeBadge = c.type === 'recurring'
    ? '<span class="badge badge--violet">Постоянный</span>'
    : '<span class="badge badge--violet" style="background:#FFE8DE;color:#FF7A50;">Разовый</span>';
  const contractBadge = (c.contract && c.contract.enabled)
    ? `<span class="badge badge--contract">Договор · ${c.contract.payerType === 'company' ? '6%' : '4%'}</span>`
    : '<span class="badge badge--nocontract">Без договора</span>';
  document.getElementById('detailClientMeta').innerHTML = typeBadge + contractBadge;

  const planEl = document.getElementById('detailClientPlan');
  const planText = clientPlanLineText(c);
  planEl.hidden = !planText;
  planEl.textContent = planText ? `По договорённости: ${planText}` : '';

  const tasksEl = document.getElementById('detailClientTasks');
  tasksEl.hidden = !c.tasksDesc;
  tasksEl.textContent = c.tasksDesc || '';

  renderDetailPayments();
  clientDetailModal.classList.add('is-open');
}

function renderDetailPayments() {
  if (!detailClientId) return;
  const payments = state.payments.filter(p => p.clientId === detailClientId).sort(sortByRelevance);
  const el = document.getElementById('detailPayments');
  el.innerHTML = payments.length
    ? payments.map(p => paymentRowHTML(p, { compact: true })).join('')
    : '<div class="empty"><div class="empty__title">Пока нет задач</div><div class="empty__sub">Добавьте первую запись о платеже для этого клиента</div></div>';
}

// ---------- Рендер: отчёты ----------

function firstDayOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastDayOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

function setReportPreset(preset) {
  const now = new Date();
  let from, to;
  if (preset === 'month') {
    from = firstDayOfMonth(now); to = lastDayOfMonth(now);
  } else if (preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    from = new Date(now.getFullYear(), q * 3, 1);
    to = new Date(now.getFullYear(), q * 3 + 3, 0);
  } else if (preset === 'year') {
    from = new Date(now.getFullYear(), 0, 1);
    to = new Date(now.getFullYear(), 11, 31);
  } else {
    const dates = state.payments.map(p => p.factDate).filter(Boolean).sort();
    from = dates.length ? new Date(dates[0] + 'T00:00:00') : firstDayOfMonth(now);
    to = now;
  }
  document.getElementById('reportFrom').value = toISO(from);
  document.getElementById('reportTo').value = toISO(to);
  renderReports();
}

function renderReports() {
  const fromEl = document.getElementById('reportFrom');
  const toEl = document.getElementById('reportTo');
  if (!fromEl.value || !toEl.value) return;
  const from = fromEl.value, to = toEl.value;

  const payments = state.payments.filter(p => p.factDate && p.factDate >= from && p.factDate <= to);

  let grossAll = 0, taxAll = 0;
  const byClient = new Map();
  for (const p of payments) {
    const c = getClient(p.clientId);
    if (!c) continue;
    const amount = Number(p.amount) || 0;
    const rate = clientTaxRatePercent(c);
    const tax = amount * rate / 100;
    grossAll += amount; taxAll += tax;
    const agg = byClient.get(c.id) || { name: c.name, type: c.type, gross: 0, tax: 0 };
    agg.gross += amount; agg.tax += tax;
    byClient.set(c.id, agg);
  }
  const netAll = grossAll - taxAll;

  document.getElementById('reportStats').innerHTML = `
    <div class="stat stat--dark">
      <div class="stat__label">Доход за период</div>
      <div class="stat__value">${formatMoney(grossAll)}</div>
    </div>
    <div class="stat">
      <div class="stat__label">Налог НПД</div>
      <div class="stat__value">${formatMoney(taxAll)}</div>
    </div>
    <div class="stat">
      <div class="stat__label">На руки</div>
      <div class="stat__value">${formatMoney(netAll)}</div>
    </div>
  `;

  const rows = Array.from(byClient.values()).sort((a, b) => b.gross - a.gross);
  const tableEl = document.getElementById('reportTable');
  tableEl.innerHTML = rows.length
    ? rows.map(r => `
      <div class="ctRow">
        <div class="ctRow__left">
          <div>
            <div class="row__title">${escapeHTML(r.name)}</div>
            <div class="row__sub">${r.type === 'recurring' ? 'Постоянный' : 'Разовый'}</div>
          </div>
        </div>
        <div class="ctRow__stats">
          <div><div class="ctRow__stat-label">Доход</div><div class="ctRow__stat-value">${formatMoney(r.gross)}</div></div>
          <div><div class="ctRow__stat-label">Налог</div><div class="ctRow__stat-value">${formatMoney(r.tax)}</div></div>
          <div><div class="ctRow__stat-label">На руки</div><div class="ctRow__stat-value">${formatMoney(r.gross - r.tax)}</div></div>
        </div>
      </div>
    `).join('')
    : '<div class="empty"><div class="empty__title">Нет данных за этот период</div><div class="empty__sub">Попробуйте выбрать другой период или отметьте платежи как оплаченные</div></div>';
}

// ---------- Рендер: всё вместе ----------

function renderAll() {
  renderStats();
  renderTaxForecast();
  renderLists();
  renderClientsTable();
  fillClientSelect();
  renderReports();
  if (clientDetailModal.classList.contains('is-open') && detailClientId) {
    if (getClient(detailClientId)) openClientDetail(detailClientId);
    else clientDetailModal.classList.remove('is-open');
  }
}

// ---------- Навигация по вкладкам ----------

document.querySelectorAll('.navlink').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.navlink').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const view = btn.dataset.view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
    document.getElementById(`view-${view}`).classList.add('is-active');
  });
});

document.querySelectorAll('.tabbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabbtn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const sub = btn.dataset.subtab;
    document.getElementById('listRecurring').hidden = sub !== 'recurring';
    document.getElementById('listOneoff').hidden = sub !== 'oneoff';
  });
});

// ---------- Модалка: клиент ----------

const clientModal = document.getElementById('clientModal');
const clientForm = document.getElementById('clientForm');

function setClientTypeUI(type) {
  document.getElementById('clientType').value = type;
  document.querySelectorAll('#clientForm [data-type]').forEach(o => {
    o.classList.toggle('is-active', o.dataset.type === type);
  });
  document.getElementById('planDayWrap').hidden = type !== 'recurring';
  document.getElementById('planDateWrap').hidden = type !== 'oneoff';
}

function setClientContractUI(enabled) {
  document.getElementById('clientContract').value = enabled ? '1' : '0';
  document.querySelectorAll('#clientForm [data-contract]').forEach(o => {
    o.classList.toggle('is-active', (o.dataset.contract === '1') === enabled);
  });
  document.getElementById('payerTypeWrap').hidden = !enabled;
}

function setPayerTypeUI(type) {
  document.getElementById('clientPayerType').value = type;
  document.querySelectorAll('#clientForm [data-payer]').forEach(o => {
    o.classList.toggle('is-active', o.dataset.payer === type);
  });
}

document.querySelectorAll('#clientForm [data-type]').forEach(opt => {
  opt.addEventListener('click', () => setClientTypeUI(opt.dataset.type));
});
document.querySelectorAll('#clientForm [data-contract]').forEach(opt => {
  opt.addEventListener('click', () => setClientContractUI(opt.dataset.contract === '1'));
});
document.querySelectorAll('#clientForm [data-payer]').forEach(opt => {
  opt.addEventListener('click', () => setPayerTypeUI(opt.dataset.payer));
});

function openClientModal(editId) {
  clientForm.reset();
  document.getElementById('clientId').value = editId || '';
  if (editId) {
    const c = getClient(editId);
    document.getElementById('clientModalTitle').textContent = 'Редактировать клиента';
    document.getElementById('clientName').value = c.name;
    document.getElementById('clientTasks').value = c.tasksDesc || '';
    document.getElementById('clientPlanAmount').value = c.planAmount ?? '';
    document.getElementById('clientPlanDay').value = c.planDay ?? '';
    document.getElementById('clientPlanDate').value = c.planDate ?? '';
    setClientTypeUI(c.type);
    setClientContractUI(!!(c.contract && c.contract.enabled));
    setPayerTypeUI(c.contract && c.contract.payerType === 'company' ? 'company' : 'individual');
  } else {
    document.getElementById('clientModalTitle').textContent = 'Новый клиент';
    setClientTypeUI('recurring');
    setClientContractUI(false);
    setPayerTypeUI('individual');
  }
  clientModal.classList.add('is-open');
  document.getElementById('clientName').focus();
}

clientForm.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('clientId').value;
  const name = document.getElementById('clientName').value.trim();
  const type = document.getElementById('clientType').value;
  const tasksDesc = document.getElementById('clientTasks').value.trim();
  const planAmountRaw = document.getElementById('clientPlanAmount').value;
  const planAmount = planAmountRaw ? Number(planAmountRaw) : null;
  const planDay = type === 'recurring' && document.getElementById('clientPlanDay').value
    ? Number(document.getElementById('clientPlanDay').value) : null;
  const planDate = type === 'oneoff' ? (document.getElementById('clientPlanDate').value || null) : null;
  const contractEnabled = document.getElementById('clientContract').value === '1';
  const payerType = document.getElementById('clientPayerType').value;
  if (!name) return;

  const draft = { name, type, tasksDesc, planAmount, planDay, planDate, contract: { enabled: contractEnabled, payerType } };
  const row = clientToRow(draft);

  try {
    if (id) {
      const { error } = await sb.from('clients').update(row).eq('id', id);
      if (error) throw error;
      Object.assign(getClient(id), draft);
    } else {
      const { data, error } = await sb.from('clients').insert(row).select().single();
      if (error) throw error;
      state.clients.push(rowToClient(data));
    }
    closeModals();
    renderAll();
    showToast(id ? 'Клиент обновлён' : 'Клиент добавлен');
  } catch (err) {
    console.error(err);
    showToast('Не удалось сохранить клиента');
  }
});

// ---------- Модалка: платёж ----------

const paymentModal = document.getElementById('paymentModal');
const paymentForm = document.getElementById('paymentForm');

function fillClientSelect(selectedId) {
  const select = document.getElementById('paymentClient');
  const current = selectedId || select.value;
  select.innerHTML = state.clients
    .slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .map(c => `<option value="${c.id}">${escapeHTML(c.name)}${c.type === 'recurring' ? ' · постоянный' : ' · разовый'}</option>`)
    .join('');
  if (current) select.value = current;
}

function updateTaxPreview() {
  const clientId = document.getElementById('paymentClient').value;
  const amount = Number(document.getElementById('paymentAmount').value) || 0;
  const c = getClient(clientId);
  const rate = clientTaxRatePercent(c);
  const el = document.getElementById('taxPreview');
  if (rate > 0 && amount > 0) {
    el.hidden = false;
    el.textContent = `Налог НПД ${rate}%: ${formatMoney(amount * rate / 100)} · на руки: ${formatMoney(amount - amount * rate / 100)}`;
  } else {
    el.hidden = true;
  }
}
document.getElementById('paymentClient').addEventListener('change', updateTaxPreview);
document.getElementById('paymentAmount').addEventListener('input', updateTaxPreview);

function openPaymentModal({ editId, presetClientId } = {}) {
  if (!state.clients.length) {
    showToast('Сначала добавьте клиента');
    openClientModal();
    return;
  }
  paymentForm.reset();
  fillClientSelect(presetClientId);
  document.getElementById('paymentId').value = editId || '';
  document.getElementById('paymentPlanDate').value = todayISO();

  if (editId) {
    const p = state.payments.find(x => x.id === editId);
    document.getElementById('paymentModalTitle').textContent = 'Редактировать запись';
    document.getElementById('paymentClient').value = p.clientId;
    document.getElementById('paymentTask').value = p.task;
    document.getElementById('paymentAmount').value = p.amount;
    document.getElementById('paymentPlanDate').value = p.planDate;
    document.getElementById('paymentFactDate').value = p.factDate || '';
  } else {
    document.getElementById('paymentModalTitle').textContent = 'Новая запись';
  }
  updateTaxPreview();
  paymentModal.classList.add('is-open');
  document.getElementById('paymentTask').focus();
}

paymentForm.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('paymentId').value;
  const clientId = document.getElementById('paymentClient').value;
  const task = document.getElementById('paymentTask').value.trim();
  const amount = Number(document.getElementById('paymentAmount').value) || 0;
  const planDate = document.getElementById('paymentPlanDate').value;
  const factDate = document.getElementById('paymentFactDate').value || null;
  if (!clientId || !task || !planDate) return;

  const draft = { clientId, task, amount, planDate, factDate };
  const row = paymentToRow(draft);

  try {
    if (id) {
      const { error } = await sb.from('payments').update(row).eq('id', id);
      if (error) throw error;
      Object.assign(state.payments.find(x => x.id === id), draft);
    } else {
      const { data, error } = await sb.from('payments').insert(row).select().single();
      if (error) throw error;
      state.payments.push(rowToPayment(data));
    }
    closeModals();
    renderAll();
    showToast(id ? 'Запись обновлена' : 'Запись добавлена');
  } catch (err) {
    console.error(err);
    showToast('Не удалось сохранить запись');
  }
});

// ---------- Общие действия модалок ----------

function closeModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('is-open'));
}

document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeModals));
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) closeModals(); });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });

// ---------- Делегирование кликов по спискам ----------

document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === 'mark-paid') {
    try {
      const factDate = todayISO();
      const { error } = await sb.from('payments').update({ fact_date: factDate }).eq('id', id);
      if (error) throw error;
      state.payments.find(x => x.id === id).factDate = factDate;
      renderAll();
      showToast('Отмечено как оплачено');
    } catch (err) {
      console.error(err);
      showToast('Не удалось обновить запись');
    }
  } else if (action === 'edit-payment') {
    openPaymentModal({ editId: id });
  } else if (action === 'delete-payment') {
    if (confirm('Удалить эту запись?')) {
      try {
        const { error } = await sb.from('payments').delete().eq('id', id);
        if (error) throw error;
        state.payments = state.payments.filter(p => p.id !== id);
        renderAll();
        showToast('Запись удалена');
      } catch (err) {
        console.error(err);
        showToast('Не удалось удалить запись');
      }
    }
  } else if (action === 'edit-client') {
    closeModals();
    openClientModal(id);
  } else if (action === 'delete-client') {
    deleteClientWithConfirm(id);
  } else if (action === 'add-payment-for') {
    openPaymentModal({ presetClientId: id });
  } else if (action === 'empty-add-client') {
    openClientModal();
  } else if (action === 'empty-add-payment') {
    openPaymentModal();
  }
});

async function deleteClientWithConfirm(id) {
  const hasPayments = state.payments.some(p => p.clientId === id);
  const msg = hasPayments
    ? 'У этого клиента есть записи о платежах. Удалить клиента и все его записи?'
    : 'Удалить этого клиента?';
  if (confirm(msg)) {
    try {
      const { error } = await sb.from('clients').delete().eq('id', id);
      if (error) throw error;
      state.clients = state.clients.filter(c => c.id !== id);
      state.payments = state.payments.filter(p => p.clientId !== id);
      closeModals();
      renderAll();
      showToast('Клиент удалён');
    } catch (err) {
      console.error(err);
      showToast('Не удалось удалить клиента');
    }
  }
}

document.getElementById('btnNewPaymentTop').addEventListener('click', () => openPaymentModal());
document.getElementById('btnNewClientTop').addEventListener('click', () => openClientModal());

// ---------- Карточка клиента: открытие по клику на строку ----------

document.getElementById('clientsTable').addEventListener('click', e => {
  if (e.target.closest('[data-action]')) return;
  const row = e.target.closest('.ctRow');
  if (row) openClientDetail(row.dataset.clientId);
});

document.getElementById('btnDetailAddPayment').addEventListener('click', () => {
  openPaymentModal({ presetClientId: detailClientId });
});
document.getElementById('btnDetailEditClient').addEventListener('click', () => {
  closeModals();
  openClientModal(detailClientId);
});
document.getElementById('btnDetailDeleteClient').addEventListener('click', () => {
  deleteClientWithConfirm(detailClientId);
});

// ---------- Отчёты: пресеты и даты ----------

document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => setReportPreset(btn.dataset.preset));
});
document.getElementById('reportFrom').addEventListener('change', renderReports);
document.getElementById('reportTo').addEventListener('change', renderReports);

// ---------- Настройки: экспорт / импорт / сброс ----------

document.getElementById('btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `freelab-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const importFile = document.getElementById('importFile');
document.getElementById('btnImport').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed.clients) || !Array.isArray(parsed.payments)) throw new Error('bad shape');
      if (!confirm('Импорт заменит все текущие данные в облаке резервной копией из файла. Продолжить?')) return;

      const clients = parsed.clients.map(normalizeClient);
      const payments = parsed.payments;

      // Удаляем всё текущее (платежи удалятся каскадом вместе с клиентами)
      const { data: existing, error: exErr } = await sb.from('clients').select('id');
      if (exErr) throw exErr;
      if (existing && existing.length) {
        const { error: delErr } = await sb.from('clients').delete().in('id', existing.map(r => r.id));
        if (delErr) throw delErr;
      }

      // Вставляем клиентов, запоминаем соответствие старых id новым
      const idMap = new Map();
      for (const c of clients) {
        const { data, error } = await sb.from('clients').insert(clientToRow(c)).select().single();
        if (error) throw error;
        idMap.set(c.id, data.id);
      }
      for (const p of payments) {
        const newClientId = idMap.get(p.clientId);
        if (!newClientId) continue;
        const row = paymentToRow({ ...p, clientId: newClientId });
        const { error } = await sb.from('payments').insert(row);
        if (error) throw error;
      }

      await fetchState();
      showToast('Данные загружены');
    } catch (err) {
      console.error(err);
      alert('Не удалось прочитать файл или сохранить данные в облако. Убедитесь, что это резервная копия из Фрилаб.');
    }
  };
  reader.readAsText(file);
  importFile.value = '';
});

document.getElementById('btnReset').addEventListener('click', async () => {
  if (confirm('Точно удалить всех клиентов и все платежи? Это действие необратимо.')) {
    try {
      const { data: existing, error: exErr } = await sb.from('clients').select('id');
      if (exErr) throw exErr;
      if (existing && existing.length) {
        const { error: delErr } = await sb.from('clients').delete().in('id', existing.map(r => r.id));
        if (delErr) throw delErr;
      }
      state = { clients: [], payments: [] };
      renderAll();
      showToast('Все данные удалены');
    } catch (err) {
      console.error(err);
      showToast('Не удалось удалить данные');
    }
  }
});

// ---------- Toast ----------

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
}

// ---------- Инициализация: приветствие ----------

function initGreeting() {
  const hour = new Date().getHours();
  const greet = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  document.getElementById('greeting').textContent = `${greet}, Наталия 👋`;
  document.getElementById('todayLabel').textContent = `${todayLabel()} — вот как идут дела с клиентами`;
}

// ---------- Аутентификация (Supabase Auth) ----------

const authScreenEl = document.getElementById('authScreen');
const appEl = document.getElementById('app');
const authForm = document.getElementById('authForm');
const authEmailInput = document.getElementById('authEmail');
const authPasswordInput = document.getElementById('authPassword');
const authErrorEl = document.getElementById('authError');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggleBtn = document.getElementById('authToggleMode');
const btnLogout = document.getElementById('btnLogout');

let authMode = 'signin'; // 'signin' | 'signup'

function setAuthMode(mode) {
  authMode = mode;
  authErrorEl.hidden = true;
  if (mode === 'signup') {
    authSubmitBtn.textContent = 'Зарегистрироваться';
    authToggleBtn.textContent = 'Уже есть аккаунт? Войти';
  } else {
    authSubmitBtn.textContent = 'Войти';
    authToggleBtn.textContent = 'Нет аккаунта? Зарегистрироваться';
  }
}

authToggleBtn.addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));

authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  authErrorEl.hidden = true;
  authSubmitBtn.disabled = true;
  try {
    if (authMode === 'signup') {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        authErrorEl.hidden = false;
        authErrorEl.style.background = '#EAF7F0';
        authErrorEl.style.color = 'var(--green)';
        authErrorEl.textContent = 'Проверьте почту и подтвердите e-mail, затем войдите.';
        setAuthMode('signin');
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    authErrorEl.hidden = false;
    authErrorEl.style.background = '#FDEAEA';
    authErrorEl.style.color = 'var(--red)';
    authErrorEl.textContent = err.message === 'Invalid login credentials'
      ? 'Неверный e-mail или пароль'
      : (err.message || 'Ошибка входа');
  } finally {
    authSubmitBtn.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  await sb.auth.signOut();
});

function showApp(session) {
  authScreenEl.hidden = true;
  appEl.hidden = false;
  document.getElementById('sidebarEmail').textContent = session.user.email;
  initGreeting();
  fetchState();
}

function showAuth() {
  appEl.hidden = true;
  authScreenEl.hidden = false;
  authForm.reset();
}

sb.auth.onAuthStateChange((_event, session) => {
  if (session) showApp(session);
  else showAuth();
});

sb.auth.getSession().then(({ data }) => {
  if (data.session) showApp(data.session);
  else showAuth();
});
