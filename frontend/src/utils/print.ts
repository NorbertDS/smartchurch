export function printTarget(target: 'members'|'cell-groups'|'departments'|'reports'|'attendance'|'events'|'minutes', orientation?: 'portrait'|'landscape') {
  if (typeof document === 'undefined') return;
  (document.body as any).dataset.printTarget = target;
  (document.body as any).dataset.printOrientation = orientation || 'portrait';
  let style: HTMLStyleElement | null = null;
  if ((document.body as any).dataset.printOrientation === 'landscape') {
    style = document.createElement('style');
    style.id = 'fc-print-orientation';
    style.textContent = '@media print { @page { size: landscape; } }';
    document.head.appendChild(style);
  }
  window.print();
  setTimeout(() => {
    delete (document.body as any).dataset.printTarget;
    delete (document.body as any).dataset.printOrientation;
    if (style && style.parentElement) style.parentElement.removeChild(style);
  }, 500);
}
