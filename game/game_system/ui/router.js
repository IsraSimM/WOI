function initRouter() {
  const routeButtons = document.querySelectorAll('[data-route]');
  routeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-route');
      if (!target) return;
      window.location.href = target;
    });
  });

  const actionButtons = document.querySelectorAll('[data-action]');
  actionButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      if (action === 'exit') {
        alert('Salir del juego no esta disponible en navegador.');
      }
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const active = document.activeElement;
    const tag = active?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      active.blur();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    if (!window.location.pathname.endsWith('/index.html')) {
      window.location.href = 'index.html';
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRouter);
} else {
  initRouter();
}
