export function openPrintPreview(title: string, contentHtml: string) {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;
  const styles = `
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 16px; }
      h1 { font-size: 18px; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
      th { background: #f5f5f5; }
      @media print { .no-print { display: none; } }
    </style>
  `;
  w.document.write(`<!doctype html><html><head><title>${title} Preview</title>${styles}</head><body>`);
  w.document.write(`<div class="no-print" style="margin-bottom:12px; display:flex; gap:8px;">
    <button onclick="window.print()" style="padding:6px 10px; background:#2563eb; color:#fff; border:none; border-radius:4px;">Print</button>
    <button onclick="window.close()" style="padding:6px 10px; background:#e5e7eb; color:#111827; border:none; border-radius:4px;">Close</button>
  </div>`);
  w.document.write(`<h1>${title}</h1>`);
  w.document.write(contentHtml);
  w.document.write('</body></html>');
  w.document.close();
}

export function printElement(selector: string, title = 'Print Preview') {
  const el = document.querySelector(selector);
  if (!el) return openPrintPreview(title, '<p>No content</p>');
  const html = (el as HTMLElement).innerHTML;
  openPrintPreview(title, html);
}

