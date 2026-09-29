/* Разбор надиктованной фразы про платёж: клиент, сумма, дата, оплачено или ожидается.
   Чистая функция без обращений к странице — её можно проверять отдельно от браузера.
   Распознавание речи отдаёт то цифры («5000», «5 тысяч»), то слова («пять тысяч»),
   поэтому понимаем оба вида. */
(function (root) {
  'use strict';

  const UNITS = {
    ноль: 0, один: 1, одна: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7,
    восемь: 8, девять: 9, десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13,
    четырнадцать: 14, пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
  };
  const TENS = { двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90 };
  const HUNDREDS = { сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500, шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900 };
  const THOUSAND = /^(тысяч[а-я]*|тыс|к)$/;
  const MILLION = /^миллион[а-я]*$/;

  // Порядковые в родительном падеже — так говорят дату: «двадцать восьмого сентября»
  const ORD_UNITS = {
    первого: 1, второго: 2, третьего: 3, четвёртого: 4, четвертого: 4, пятого: 5, шестого: 6, седьмого: 7,
    восьмого: 8, девятого: 9, десятого: 10, одиннадцатого: 11, двенадцатого: 12, тринадцатого: 13,
    четырнадцатого: 14, пятнадцатого: 15, шестнадцатого: 16, семнадцатого: 17, восемнадцатого: 18,
    девятнадцатого: 19, двадцатого: 20, тридцатого: 30,
  };
  const ORD_TENS = { двадцать: 20, тридцать: 30 };
  const ORD_ONES = {
    первого: 1, второго: 2, третьего: 3, четвёртого: 4, четвертого: 4, пятого: 5, шестого: 6, седьмого: 7,
    восьмого: 8, девятого: 9,
  };

  const MONTHS = {
    январ: 0, феврал: 1, март: 2, апрел: 3, ма: 4, июн: 5, июл: 6, август: 7, сентябр: 8, октябр: 9, ноябр: 10, декабр: 11,
  };

  const PAID_WORDS = /^(получил[аи]?|получено|заплатил[аи]?|оплатил[аи]?|оплачено|перевёл|перевел|перевели|пришл[аои]|пришёл|пришел|зачислил[аи]?|поступил[аои]?)$/;
  const WAIT_WORDS = /^(жду|ждём|ждем|ожидаю|ожидается|ожидаем|планируется|должн[аыо]?|заплатят|оплатят|переведут)$/;

  const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”.,;:!?()]/g, ' ').replace(/\s+/g, ' ').trim();
  const normKeep = s => s.toLowerCase().replace(/[«»"“”.,;:!?()]/g, ' ').replace(/\s+/g, ' ').trim();

  function iso(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Число, записанное словами, с позиции i: {value, end} или null */
  function wordNumberAt(tokens, i) {
    let total = 0, cur = 0, j = i, seen = false;
    while (j < tokens.length) {
      const t = tokens[j];
      if (t in HUNDREDS) { cur += HUNDREDS[t]; seen = true; }
      else if (t in TENS) { cur += TENS[t]; seen = true; }
      else if (t in UNITS) { cur += UNITS[t]; seen = true; }
      else if (seen && THOUSAND.test(t)) { total += (cur || 1) * 1000; cur = 0; }
      else if (seen && MILLION.test(t)) { total += (cur || 1) * 1000000; cur = 0; }
      else break;
      j++;
    }
    if (!seen) return null;
    return { value: total + cur, end: j };
  }

  /** Число цифрами с позиции i: «5000», «5 000», «5 тысяч», «5к», «2,5 тысячи» */
  function digitNumberAt(tokens, i) {
    const t = tokens[i];
    if (!/^\d+([.,]\d+)?$/.test(t) && !/^\d+к$/.test(t)) return null;
    let j = i + 1;
    let raw = t;
    if (/^\d+к$/.test(raw)) return { value: parseInt(raw, 10) * 1000, end: j };
    // «5 000», «15 500»: следующие группы по три цифры склеиваем
    while (j < tokens.length && /^\d{3}$/.test(tokens[j]) && /^\d{1,3}$/.test(raw.replace(/\s/g, '').slice(-3) === raw ? raw : String(parseInt(raw, 10)))) {
      raw += tokens[j]; j++;
    }
    let value = parseFloat(raw.replace(',', '.'));
    if (j < tokens.length && THOUSAND.test(tokens[j])) { value *= 1000; j++; }
    else if (j < tokens.length && MILLION.test(tokens[j])) { value *= 1000000; j++; }
    return { value: Math.round(value), end: j };
  }

  /** Число любым способом */
  function numberAt(tokens, i) {
    return digitNumberAt(tokens, i) || wordNumberAt(tokens, i);
  }

  /** День месяца словом-порядковым: «двадцать восьмого», «первого». {value,end} */
  function ordinalDayAt(tokens, i) {
    const t = tokens[i];
    if (t in ORD_UNITS) return { value: ORD_UNITS[t], end: i + 1 };
    if (t in ORD_TENS && ORD_ONES[tokens[i + 1]]) return { value: ORD_TENS[t] + ORD_ONES[tokens[i + 1]], end: i + 2 };
    return null;
  }

  function monthOf(token) {
    if (!token) return null;
    for (const stem of Object.keys(MONTHS)) {
      if (stem === 'ма') { if (/^ма[яй]$/.test(token)) return MONTHS[stem]; continue; }
      if (token.startsWith(stem)) return MONTHS[stem];
    }
    return null;
  }

  /** Ищем в токенах дату. Возвращает {iso, from, to} — диапазон токенов, чтобы вычесть его из фразы. */
  function findDate(tokens, today) {
    // «сегодня / вчера / завтра / послезавтра / позавчера»
    const rel = { сегодня: 0, вчера: -1, позавчера: -2, завтра: 1, послезавтра: 2 };
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] in rel) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + rel[tokens[i]]);
        return { iso: iso(d), from: i, to: i + 1 };
      }
    }
    // «28 сентября», «двадцать восьмого сентября», «28-го сентября»
    for (let i = 0; i < tokens.length; i++) {
      let day = null, end = i;
      const m1 = /^(\d{1,2})(-?(го|е|ое|м|го))?$/.exec(tokens[i]);
      if (m1) { day = parseInt(m1[1], 10); end = i + 1; }
      else {
        const o = ordinalDayAt(tokens, i);
        if (o) { day = o.value; end = o.end; }
        else {
          // «двадцать восьмое» словом-числительным без окончания порядкового
          const w = wordNumberAt(tokens, i);
          if (w && w.value >= 1 && w.value <= 31 && monthOf(tokens[w.end]) != null) { day = w.value; end = w.end; }
        }
      }
      if (day != null && day >= 1 && day <= 31 && monthOf(tokens[end]) != null) {
        const month = monthOf(tokens[end]);
        let year = today.getFullYear();
        // «в декабре» сказанное в январе — про прошлый год, а не про будущий
        const guess = new Date(year, month, day);
        if (guess - today > 1000 * 60 * 60 * 24 * 200) year -= 1;
        else if (today - guess > 1000 * 60 * 60 * 24 * 200) year += 1;
        const d = new Date(year, month, day);
        if (d.getMonth() === month) return { iso: iso(d), from: i, to: end + 1 };
      }
    }
    return null;
  }

  /** Ищем клиента: имя клиента должно найтись в речи целиком или по основе слов. */
  function findClient(tokens, clients) {
    const speech = tokens.map(t => t);
    let best = null;
    for (const c of clients) {
      const nameTokens = norm(c.name).split(' ').filter(w => w.length > 1 && !/^(ооо|ип|он|лайн|онлайн)$/.test(w) || w.length > 3);
      if (!nameTokens.length) continue;
      let hits = 0, lastEnd = -1;
      const idxs = [];
      for (const nt of nameTokens) {
        const stem = nt.length > 5 ? nt.slice(0, nt.length - 2) : nt.length > 3 ? nt.slice(0, nt.length - 1) : nt;
        const at = speech.findIndex(s => s.startsWith(stem) || (s.length >= 4 && stem.startsWith(s.slice(0, Math.max(4, s.length - 2)))));
        if (at >= 0) { hits++; idxs.push(at); }
      }
      if (!hits) continue;
      const score = hits / nameTokens.length + hits * 0.01;
      // хватит и одного слова из названия, если оно значимое: «Ивент», «Галина»
      const ok = hits >= 1 && (hits >= Math.ceil(nameTokens.length / 2) || nameTokens.some(nt => nt.length >= 5 && idxs.length));
      if (ok && (!best || score > best.score)) best = { client: c, score, idxs };
    }
    return best;
  }

  /**
   * text — то, что услышало распознавание. clients — [{id, name}], today — Date.
   * Возвращает всё, что удалось понять; недостающее остаётся null.
   */
  function parseVoiceEntry(text, clients, today) {
    today = today || new Date();
    const cleaned = norm(text);
    const tokens = cleaned.split(' ').filter(Boolean);
    const used = new Array(tokens.length).fill(false);

    const out = { client: null, amount: null, date: null, paid: false, task: '', heard: text };

    // статус: получено или ожидается
    tokens.forEach((t, i) => {
      if (PAID_WORDS.test(t)) { out.paid = true; used[i] = true; }
      else if (WAIT_WORDS.test(t)) { used[i] = true; }
    });

    // дата — раньше суммы, чтобы «28 сентября» не приняли за сумму
    const dt = findDate(tokens, today);
    if (dt) {
      out.date = dt.iso;
      for (let i = dt.from; i < dt.to; i++) used[i] = true;
    }

    // клиент
    const cl = findClient(tokens, clients || []);
    if (cl) {
      out.client = cl.client;
      cl.idxs.forEach(i => { used[i] = true; });
    }

    // сумма — первое число вне даты; предпочитаем то, что рядом со словом «рублей» или самое крупное
    // Слова, которые уже заняты датой или клиентом, прячем от разбора числа: иначе
    // «пять тысяч двадцать восьмого сентября» дотянет «двадцать» до суммы
    const masked = tokens.map((t, i) => (used[i] ? '\u0000' : t));
    const candidates = [];
    for (let i = 0; i < tokens.length; i++) {
      if (used[i]) continue;
      const n = numberAt(masked, i);
      if (n && n.value > 0) {
        candidates.push({ value: n.value, from: i, to: n.end, ruble: /^(руб|₽|р$)/.test(tokens[n.end] || '') });
        i = n.end - 1;
      }
    }
    if (candidates.length) {
      const pick = candidates.find(c => c.ruble) || candidates.reduce((a, b) => (b.value > a.value ? b : a));
      out.amount = pick.value;
      for (let i = pick.from; i < pick.to; i++) used[i] = true;
      if (/^(руб|₽|р$)/.test(tokens[pick.to] || '')) used[pick.to] = true;
    }

    // всё, что осталось, — суть задачи; служебные слова отбрасываем
    const STOP = /^(и|в|на|за|от|по|с|со|у|к|для|это|вот|ну|а|же|мне|нам|рублей|рубля|рубль|руб|р|числа|год|года)$/;
    const rest = tokens.filter((t, i) => !used[i] && !STOP.test(t));
    out.task = rest.join(' ');
    return out;
  }

  const api = { parseVoiceEntry, findDate, wordNumberAt, digitNumberAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VoiceParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
