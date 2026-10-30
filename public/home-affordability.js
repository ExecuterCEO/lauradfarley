(function () {
  const $ = (id) => document.getElementById(id);

  function money(n) {
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  }

  function moneyExact(n) {
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
  }

  function num(id) {
    const raw = ($(id).value || '').replace(/,/g, '').trim();
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function paymentFactor(annualRate, years) {
    const n = years * 12;
    const r = annualRate / 100 / 12;
    if (n <= 0) return null;
    if (r === 0) return 1 / n;
    const pow = Math.pow(1 + r, n);
    return (r * pow) / (pow - 1);
  }

  function readShared() {
    return {
      rate: num('rate'),
      years: Number($('years').value),
      taxAnnual: num('tax-annual'),
      taxPercent: num('tax-percent'),
      insurance: num('insurance') || 0,
      hoa: num('hoa') || 0,
      mello: num('mello') || 0,
      otherAssess: num('other-assess') || 0,
      pmi: num('pmi') || 0,
      debts: num('debts') || 0,
      front: (num('front') ?? 28) / 100,
      back: (num('back') ?? 36) / 100,
    };
  }

  function fixedHousing(s) {
    return s.insurance / 12 + s.hoa + s.mello + s.otherAssess + s.pmi;
  }

  function taxMonthlyFromPrice(s, price) {
    if (s.taxAnnual != null) return s.taxAnnual / 12;
    if (s.taxPercent != null) return (price * (s.taxPercent / 100)) / 12;
    return 0;
  }

  function solveAfford(s, downMode, downValue) {
    const factor = paymentFactor(s.rate, s.years);
    if (factor == null || s.rate == null || s.rate < 0) return { error: 'Enter an interest rate.' };
    const income = num('income');
    if (income == null || income <= 0) return { error: 'Enter gross annual income.' };
    if (downValue == null || downValue < 0) return { error: 'Enter a down payment.' };
    if (s.front <= 0 || s.back <= 0) return { error: 'Enter planning ratios above zero.' };

    const housingCap = (income / 12) * s.front;
    const debtCap = (income / 12) * s.back - s.debts;
    const budget = Math.min(housingCap, debtCap);
    if (budget <= 0) return { error: 'The other monthly debts already use the planning budget. Lower those debts or raise the ratios your lender gave you.' };

    const fixed = fixedHousing(s);
    const taxIsPercent = s.taxAnnual == null && s.taxPercent != null;
    const taxFixed = s.taxAnnual != null ? s.taxAnnual / 12 : 0;
    const room = budget - fixed - taxFixed;
    if (room <= 0) return { error: 'The taxes, insurance, HOA, and assessments you entered already use the planning budget.' };

    let price;
    let loan;
    if (downMode === 'percent') {
      if (downValue >= 100) return { error: 'A 100% down payment is a cash purchase. This estimate is for a loan.' };
      const loanShare = 1 - downValue / 100;
      const taxPerDollar = taxIsPercent ? (s.taxPercent / 100) / 12 : 0;
      const perDollar = loanShare * factor + taxPerDollar;
      if (perDollar <= 0) return { error: 'Could not solve a price from these figures.' };
      price = room / perDollar;
      loan = price * loanShare;
    } else {
      const taxPerDollar = taxIsPercent ? (s.taxPercent / 100) / 12 : 0;
      const perDollar = factor + taxPerDollar;
      price = (room + downValue * factor) / perDollar;
      loan = price - downValue;
      if (loan < 0) return { error: 'The down payment is larger than the price these figures support.' };
    }

    return finish(s, price, loan, factor, housingCap, debtCap);
  }

  function solveIncome(s, downMode, downValue) {
    const price = num('price');
    if (price == null || price <= 0) return { error: 'Enter a purchase price.' };
    if (downValue == null || downValue < 0) return { error: 'Enter a down payment.' };
    const factor = paymentFactor(s.rate, s.years);
    if (factor == null || s.rate == null || s.rate < 0) return { error: 'Enter an interest rate.' };
    if (s.front <= 0 || s.back <= 0) return { error: 'Enter planning ratios above zero.' };

    let loan;
    if (downMode === 'percent') {
      if (downValue >= 100) return { error: 'A 100% down payment is a cash purchase. This estimate is for a loan.' };
      loan = price * (1 - downValue / 100);
    } else {
      loan = price - downValue;
      if (loan < 0) return { error: 'The down payment is larger than the purchase price.' };
    }
    return finish(s, price, loan, factor, null, null);
  }

  function finish(s, price, loan, factor, housingCap, debtCap) {
    const principal = loan * factor;
    const tax = taxMonthlyFromPrice(s, price);
    const housing = principal + tax + fixedHousing(s);
    const incomeForHousing = s.front > 0 ? (housing / s.front) * 12 : null;
    const incomeForDebts = s.back > 0 ? ((housing + s.debts) / s.back) * 12 : null;
    const incomeNeeded = Math.max(incomeForHousing || 0, incomeForDebts || 0);
    return {
      price,
      loan,
      down: price - loan,
      principal,
      tax,
      insurance: s.insurance / 12,
      hoa: s.hoa,
      mello: s.mello,
      otherAssess: s.otherAssess,
      pmi: s.pmi,
      housing,
      incomeForHousing,
      incomeForDebts,
      incomeNeeded,
      housingCap,
      debtCap,
      taxMissing: s.taxAnnual == null && s.taxPercent == null,
    };
  }

  function render(result) {
    const box = $('result');
    if (result.error) {
      box.innerHTML = `<p class="text-[#2B322C]">${result.error}</p>`;
      return;
    }
    const rows = [
      ['Purchase price', money(result.price)],
      ['Down payment', money(result.down)],
      ['Loan amount', money(result.loan)],
      ['Principal and interest', moneyExact(result.principal)],
      ['Property tax', moneyExact(result.tax)],
      ['Insurance', moneyExact(result.insurance)],
      ['HOA', moneyExact(result.hoa)],
      ['Mello-Roos or special tax', moneyExact(result.mello)],
      ['Other assessments', moneyExact(result.otherAssess)],
      ['Mortgage insurance', moneyExact(result.pmi)],
      ['Estimated monthly housing', moneyExact(result.housing)],
    ];
    const list = rows.map(([k, v]) => `<div class="flex justify-between gap-4 border-t border-[var(--line)] py-2"><span>${k}</span><span class="font-medium">${v}</span></div>`).join('');
    const warn = result.taxMissing ? '<p class="mt-3">Property tax is blank, so this estimate leaves taxes out. Add the bill or a percent before you rely on it.</p>' : '';
    box.innerHTML = `
      <p class="text-[11px] tracking-[0.16em] uppercase text-[var(--sage-deep)] font-medium">Estimate</p>
      <p class="font-serif text-4xl text-[var(--sage-ink)] mt-1">${money(result.price)}</p>
      <p class="mt-2 text-[#2B322C]">Income to stay inside both planning ratios: <strong>${money(result.incomeNeeded)}</strong> a year.</p>
      <p class="mt-1 text-sm text-[#2B322C]">Housing ratio alone: ${money(result.incomeForHousing)}. Housing plus the other debts you entered: ${money(result.incomeForDebts)}.</p>
      ${warn}
      <div class="mt-4 text-sm text-[#2B322C]">${list}</div>
    `;
  }

  function currentMode() {
    return $('mode-income').getAttribute('aria-pressed') === 'true' ? 'income' : 'afford';
  }

  function downMode() {
    return $('down-dollars').getAttribute('aria-pressed') === 'true' ? 'dollars' : 'percent';
  }

  function calculate() {
    const s = readShared();
    const mode = currentMode();
    const dMode = downMode();
    const downValue = dMode === 'percent' ? num('down-percent') : num('down-dollars');
    const result = mode === 'income' ? solveIncome(s, dMode, downValue) : solveAfford(s, dMode, downValue);
    render(result);
  }

  function setPressed(on, off) {
    on.setAttribute('aria-pressed', 'true');
    off.setAttribute('aria-pressed', 'false');
    on.className = 'calc-on';
    off.className = 'calc-off';
  }

  $('mode-afford').addEventListener('click', () => {
    setPressed($('mode-afford'), $('mode-income'));
    $('income-fields').hidden = false;
    $('price-fields').hidden = true;
    calculate();
  });
  $('mode-income').addEventListener('click', () => {
    setPressed($('mode-income'), $('mode-afford'));
    $('income-fields').hidden = true;
    $('price-fields').hidden = false;
    calculate();
  });
  $('down-percent-btn').addEventListener('click', () => {
    setPressed($('down-percent-btn'), $('down-dollars'));
    $('down-percent-wrap').hidden = false;
    $('down-dollars-wrap').hidden = true;
    calculate();
  });
  $('down-dollars').addEventListener('click', () => {
    setPressed($('down-dollars'), $('down-percent-btn'));
    $('down-percent-wrap').hidden = true;
    $('down-dollars-wrap').hidden = false;
    calculate();
  });

  document.querySelectorAll('#calculator input, #calculator select').forEach((el) => {
    el.addEventListener('input', calculate);
  });
  calculate();

  window.HomeAffordability = { paymentFactor, solveAfford, solveIncome, readShared };
})();
