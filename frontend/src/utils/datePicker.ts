type DatePickerOptions = {
  format?: 'DD/MM/YYYY';
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toIso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function toDisplay(d: Date) { return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`; }

export function initDatePicker(opts: DatePickerOptions = {}) {
  if (typeof document === 'undefined') return;
  let targetInput: HTMLInputElement | null = null;
  let current: Date = new Date();

  const el = document.createElement('div');
  el.id = 'fc-datepicker';
  el.className = 'fc-datepicker';
  el.style.display = 'none';
  el.innerHTML = `
    <div class="fc-dp-header">
      <button class="fc-dp-btn" data-act="prev">◀</button>
      <select class="fc-dp-month">${MONTHS.map((m,i)=>`<option value="${i}">${m}</option>`).join('')}</select>
      <input class="fc-dp-year" type="number" min="1900" max="2100" />
      <button class="fc-dp-btn" data-act="next">▶</button>
    </div>
    <div class="fc-dp-grid" role="grid" aria-label="Calendar"></div>
    <div class="fc-dp-footer">
      <button class="fc-dp-today">Today</button>
      <div class="fc-dp-help">Use arrows, Enter, Esc</div>
    </div>
  `;
  document.body.appendChild(el);

  const monthSel = el.querySelector('.fc-dp-month') as HTMLSelectElement;
  const yearInp = el.querySelector('.fc-dp-year') as HTMLInputElement;
  const grid = el.querySelector('.fc-dp-grid') as HTMLDivElement;

  function render() {
    monthSel.value = String(current.getMonth());
    yearInp.value = String(current.getFullYear());
    const start = new Date(current.getFullYear(), current.getMonth(), 1);
    const firstDay = start.getDay();
    const days = new Date(current.getFullYear(), current.getMonth()+1, 0).getDate();
    const cells: string[] = [];
    const headers = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(h=>`<div class="fc-dp-head">${h}</div>`);
    cells.push(...headers);
    for (let i=0;i<firstDay;i++) cells.push('<div class="fc-dp-empty"></div>');
    for (let d=1; d<=days; d++) {
      const dt = new Date(current.getFullYear(), current.getMonth(), d);
      const iso = toIso(dt);
      cells.push(`<button class="fc-dp-day" data-date="${iso}" tabindex="0">${d}</button>`);
    }
    grid.innerHTML = cells.join('');
  }

  function position() {
    if (!targetInput) return;
    const rect = targetInput.getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.bottom + 4}px`;
    el.style.display = 'block';
    render();
  }

  function close() {
    el.style.display = 'none';
    targetInput = null;
  }

  function ensureDisplaySpan(inp: HTMLInputElement, date?: Date) {
    let s = inp.nextElementSibling as HTMLElement | null;
    if (!s || !s.classList.contains('fc-date-display')) {
      s = document.createElement('span');
      s.className = 'fc-date-display text-xs text-gray-600 ml-2';
      inp.parentElement?.insertBefore(s, inp.nextSibling);
    }
    if (date) s.textContent = toDisplay(date);
    else if (inp.value) { try { s.textContent = toDisplay(new Date(inp.value)); } catch { s.textContent = ''; } }
    else s.textContent = '';
  }

  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains('fc-dp-btn')) {
      const act = t.getAttribute('data-act');
      if (act === 'prev') current = new Date(current.getFullYear(), current.getMonth()-1, 1);
      else if (act === 'next') current = new Date(current.getFullYear(), current.getMonth()+1, 1);
      render();
    }
    if (t.classList.contains('fc-dp-day')) {
      const iso = t.getAttribute('data-date')!;
      const [y,m,d] = iso.split('-').map(Number);
      const dt = new Date(y, m-1, d);
      if (targetInput) {
        // Keep underlying value compatible with existing code
        targetInput.value = iso;
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        targetInput.setAttribute('data-display', toDisplay(dt));
        ensureDisplaySpan(targetInput, dt);
      }
      close();
    }
  });
  monthSel.addEventListener('change', () => { current = new Date(Number(yearInp.value||current.getFullYear()), Number(monthSel.value), 1); render(); });
  yearInp.addEventListener('change', () => { current = new Date(Number(yearInp.value||current.getFullYear()), Number(monthSel.value||current.getMonth()), 1); render(); });

  document.addEventListener('keydown', (e) => {
    if (el.style.display !== 'block') return;
    if (e.key === 'Escape') { close(); }
    if (!targetInput) return;
    const step = (days: number) => { current = new Date(current.getFullYear(), current.getMonth(), Math.min(Math.max(1, (current.getDate()||1) + days), new Date(current.getFullYear(), current.getMonth()+1, 0).getDate())); render(); };
    if (e.key === 'ArrowLeft') { step(-1); }
    if (e.key === 'ArrowRight') { step(1); }
    if (e.key === 'ArrowUp') { step(-7); }
    if (e.key === 'ArrowDown') { step(7); }
    if (e.key === 'Enter') {
      const iso = toIso(new Date(current.getFullYear(), current.getMonth(), current.getDate()||1));
      targetInput.value = iso;
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      targetInput.setAttribute('data-display', toDisplay(new Date(iso)));
      ensureDisplaySpan(targetInput, new Date(iso));
      close();
    }
  });

  document.addEventListener('click', (e) => {
    if (el.style.display !== 'block') return;
    const t = e.target as HTMLElement;
    if (!el.contains(t) && (!targetInput || !targetInput.contains(t as any))) close();
  });

  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && (t.type === 'date' || t.getAttribute('data-fc-date') === 'true')) {
      targetInput = t as HTMLInputElement;
      targetInput.placeholder = 'DD/MM/YYYY';
      // Initialize current by input value if present
      try {
        const v = targetInput.value;
        if (v) { const d = new Date(v); if (!isNaN(d.getTime())) current = d; }
      } catch {}
      ensureDisplaySpan(targetInput);
      position();
    }
  });

  // Validate typed DD/MM/YYYY and convert to ISO
  document.addEventListener('blur', (e) => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && (t.type === 'date' || t.getAttribute('data-fc-date') === 'true')) {
      const raw = t.value.trim();
      const ddmmyyyy = /^([0-3]?\d)[\/-]([0-1]?\d)[\/-](\d{4})$/;
      if (ddmmyyyy.test(raw)) {
        const m = raw.match(ddmmyyyy)!;
        const dd = Number(m[1]); const mm = Number(m[2]); const yyyy = Number(m[3]);
        const dt = new Date(yyyy, mm - 1, dd);
        if (!isNaN(dt.getTime())) {
          t.value = toIso(dt);
          t.setAttribute('data-display', toDisplay(dt));
          ensureDisplaySpan(t, dt);
          t.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        // keep ISO if already set
        ensureDisplaySpan(t);
      }
    }
  }, true);
}
