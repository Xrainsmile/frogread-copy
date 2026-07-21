// PDF page trigger — shows a floating button that starts PDF translation.
// The actual parsing/translation happens in the background; the panel is
// injected there too.

export function initPdfContent(): void {
  if (document.getElementById('rf-pdf-trigger')) return;
  const btn = document.createElement('div');
  btn.id = 'rf-pdf-trigger';
  btn.className = 'rf-floating-btn';
  btn.innerHTML = '<span class="rf-btn-text">PDF</span>';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'translate-pdf', url: location.href }).catch(() => {});
  });
  document.documentElement.appendChild(btn);
}
