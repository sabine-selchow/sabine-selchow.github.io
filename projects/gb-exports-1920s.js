document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('gbModal');
  const openBtn = document.getElementById('openPdf');
  const closeBg = document.getElementById('closePdf');
  const closeX = document.getElementById('xClose');

  function openModal() {
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBg) closeBg.addEventListener('click', closeModal);
  if (closeX) closeX.addEventListener('click', closeModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
});
