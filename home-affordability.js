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

  function fixedHousing(s, cash) {
    const pmi = cash ? 0 : s.pmi;
    return s.insurance / 12 + s.hoa + s.mello + s.otherAssess + pmi;
  }

  function taxMonthlyFromPrice(s, price) {
    if (s.taxAnnual != null) return s.taxAnnual / 12;
    if (s.taxPercent != null) return (price * (s.taxPercent / 100)) / 12;
    return 0;
  }

  function solveAfford(s, downMode, downValue) {
    const income = num('income');
    if (income == null || income <= 0) return { error: 'Enter gross annual income.' };
    if (downValue == null || downValue < 0) return { error: 'Enter a down payment.' };
    if (s.front <= 0 || s.back <= 0) return { error: 'Enter planning ratios above zero.' };
    if (downMode === 'percent' && downValue > 100) return { error: 'Down payment percent cannot be more than 100.' };

    const housingCap = (income / 12) * s.front;
    const debtCap = (income / 12) * s.back - s.debts;
    const budget = Math.min(housingCap, debtCap);
    if (budget <= 0) return { error: 'The other monthly debts already use the planning budget. Lower those debts or raise the ratios your lender gave you.' };

    if (downMode === 'percent' && downValue >= 100) {
      return solveCashAfford(s, budget, housingCap, debtCap);
    }

    const factor = paymentFactor(s.rate, s.years);
    if (factor == null || s.rate == null || s.rate < 0) return { error: 'Enter an interest rate.' };

    const fixed = fixedHousing(s, false);
    const taxIsPercent = s.taxAnnual == null && s.taxPercent != null;
    const taxFixed = s.taxAnnual != null ? s.taxAnnual / 12 : 0;
    const room = budget - fixed - taxFixed;
    if (room <= 0) return { error: 'The taxes, insurance, HOA, and assessments you entered already use the planning budget.' };

    let price;
    let loan;
    if (downMode === 'percent') {
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
      if (loan <= 0) return solveCashFromCashPrice(s, downValue, housingCap, debtCap);
    }

    return finish(s, price, loan, factor, housingCap, debtCap, false);
  }

  function solveCashAfford(s, budget, housingCap, debtCap) {
    const fixed = fixedHousing(s, true);
    const taxIsPercent = s.taxAnnual == null && s.taxPercent != null && s.taxPercent > 0;
    if (!taxIsPercent) {
      const taxFixed = s.taxAnnual != null ? s.taxAnnual / 12 : 0;
      const housing = fixed + taxFixed;
      if (housing > budget) return { error: 'The taxes, insurance, HOA, and assessments you entered already use the planning budget.' };
      return finish(s, null, 0, 0, housingCap, debtCap, true);
    }
    const room = budget - fixed;
    if (room <= 0) return { error: 'The insurance, HOA, and assessments you entered already use the planning budget.' };
    const price = room / ((s.taxPercent / 100) / 12);
    return finish(s, price, 0, 0, housingCap, debtCap, true);
  }

  function solveCashFromCashPrice(s, price, housingCap, debtCap) {
    if (price <= 0) return { error: 'Enter a cash amount.' };
    return finish(s, price, 0, 0, housingCap, debtCap, true);
  }

  function solveIncome(s, downMode, downValue) {
    const price = num('price');
    if (price == null || price <= 0) return { error: 'Enter a purchase price.' };
    if (downValue == null || downValue < 0) return { error: 'Enter a down payment.' };
    if (s.front <= 0 || s.back <= 0) return { error: 'Enter planning ratios above zero.' };
    if (downMode === 'percent' && downValue > 100) return { error: 'Down payment percent cannot be more than 100.' };
    const cash = downMode === 'percent' ? downValue >= 100 : downValue >= price;
    if (cash) return finish(s, price, 0, 0, null, null, true);

    const factor = paymentFactor(s.rate, s.years);
    if (factor == null || s.rate == null || s.rate < 0) return { error: 'Enter an interest rate.' };

    const loan = downMode === 'percent' ? price * (1 - downValue / 100) : price - downValue;
    return finish(s, price, loan, factor, null, null, false);
  }

  function finish(s, price, loan, factor, housingCap, debtCap, cash) {
    const principal = loan > 0 && factor ? loan * factor : 0;
    const tax = price == null ? (s.taxAnnual != null ? s.taxAnnual / 12 : 0) : taxMonthlyFromPrice(s, price);
    const pmi = cash ? 0 : s.pmi;
    const housing = principal + tax + fixedHousing(s, cash);
    const incomeForHousing = s.front > 0 ? (housing / s.front) * 12 : null;
    const incomeForDebts = s.back > 0 ? ((housing + s.debts) / s.back) * 12 : null;
    const incomeNeeded = Math.max(incomeForHousing || 0, incomeForDebts || 0);
    return {
      price,
      loan,
      down: price == null ? null : price - loan,
      principal,
      tax,
      insurance: s.insurance / 12,
      hoa: s.hoa,
      mello: s.mello,
      otherAssess: s.otherAssess,
      pmi,
      housing,
      incomeForHousing,
      incomeForDebts,
      incomeNeeded,
      housingCap,
      debtCap,
      cash,
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
      result.price == null ? null : ['Purchase price', money(result.price)],
      result.price == null ? null : ['Down payment', money(result.down)],
      ['Loan amount', money(result.loan)],
      ['Principal and interest', moneyExact(result.principal)],
      ['Property tax', moneyExact(result.tax)],
      ['Insurance', moneyExact(result.insurance)],
      ['HOA', moneyExact(result.hoa)],
      ['Mello-Roos or special tax', moneyExact(result.mello)],
      ['Other assessments', moneyExact(result.otherAssess)],
      ['Mortgage insurance', moneyExact(result.pmi)],
      ['Estimated monthly housing', moneyExact(result.housing)],
    ].filter(Boolean);
    const list = rows.map(([k, v]) => `<div class="flex justify-between gap-4 border-t border-[var(--line)] py-2"><span>${k}</span><span class="font-medium">${v}</span></div>`).join('');
    const warn = result.taxMissing ? '<p class="mt-3">Property tax is blank, so this estimate leaves taxes out. Add the bill or a percent before you rely on it.</p>' : '';
    const cashNote = result.cash
      ? '<p class="mt-3">Free and clear. There is no loan payment. The income figure is what it takes to carry the tax, insurance, HOA, Mello-Roos, and other dues.</p>'
      : '';
    const noPrice = result.price == null
      ? '<p class="mt-3">A cash price is not set by a loan. Enter the tax as a percent of price to estimate a maximum price, or switch to the price question and enter the home.</p>'
      : '';
    const headline = result.price == null
      ? money(result.incomeNeeded)
      : money(result.price);
    const headlineLabel = result.price == null ? 'Income to carry these costs' : 'Estimate';
    box.innerHTML = `
      <p class="text-[11px] tracking-[0.16em] uppercase text-[var(--sage-deep)] font-medium">${headlineLabel}</p>
      <p class="font-serif text-4xl text-[var(--sage-ink)] mt-1">${headline}</p>
      <p class="mt-2 text-[#2B322C]">Income to stay inside both planning ratios: <strong>${money(result.incomeNeeded)}</strong> a year.</p>
      <p class="mt-1 text-sm text-[#2B322C]">Housing ratio alone: ${money(result.incomeForHousing)}. Housing plus the other debts you entered: ${money(result.incomeForDebts)}.</p>
      ${cashNote}
      ${noPrice}
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
  });
  $('mode-income').addEventListener('click', () => {
    setPressed($('mode-income'), $('mode-afford'));
    $('income-fields').hidden = true;
    $('price-fields').hidden = false;
  });
  $('down-percent-btn').addEventListener('click', () => {
    setPressed($('down-percent-btn'), $('down-dollars'));
    $('down-percent-wrap').hidden = false;
    $('down-dollars-wrap').hidden = true;
  });
  $('down-dollars').addEventListener('click', () => {
    setPressed($('down-dollars'), $('down-percent-btn'));
    $('down-percent-wrap').hidden = true;
    $('down-dollars-wrap').hidden = false;
  });

  $('calculate-btn').addEventListener('click', calculate);

  window.HomeAffordability = { paymentFactor, solveAfford, solveIncome, readShared };
})();
