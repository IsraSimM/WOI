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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRouter);
} else {
  initRouter();
}
