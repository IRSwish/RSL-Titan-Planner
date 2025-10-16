// --- fusion.js ---
(() => {
  let timelineData = null;

  function getCurrentFusionConfig() {
    const hash = window.location.hash.replace('#', '');
    if (!hash || !window.fusions[hash]) return null;
    return window.fusions[hash];
  }

  function fetchAndRenderTimeline() {
    const timelineContainer = document.querySelector('.timeline-container');
    if (!timelineContainer) return;

    const config = getCurrentFusionConfig();
    if (!config) {
      console.error('Aucune fusion correspondante pour ce hash.');
      document.getElementById('page-title').textContent = "Fusion inconnue";
      const timeline = document.querySelector('.timeline');
      if (timeline) timeline.innerHTML = '';
      return;
    }

    document.getElementById('page-title').textContent = config.name;

    fetch(config.json)
      .then(res => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        return res.json();
      })
      .then(data => {
        timelineData = data;
        renderTimeline(data);
      })
      .catch(err => {
        console.error('Erreur lors du chargement du JSON :', err);
        const timeline = document.querySelector('.timeline');
        if (timeline) timeline.innerHTML = `<div class="error">Impossible de charger les données.</div>`;
      });
  }

  window.addEventListener('load', () => {
    fetchAndRenderTimeline();
    loadMenu();
  });

  // 🔁 Si on change juste le hash → recharge les données
  window.addEventListener('hashchange', () => {
    fetchAndRenderTimeline();
  });

  window.addEventListener('resize', () => {
    if (timelineData) renderTimeline(timelineData);
  });

  // --- Chargement menu externe ---
  function loadMenu() {
    fetch('../menu.html')
      .then(response => response.text())
      .then(data => {
        const menuContainer = document.getElementById('menu-container');
        if (menuContainer) menuContainer.innerHTML = data;

        const burgerIcon = document.getElementById('burger-icon');
        const burgerLinks = document.getElementById('burger-links');
        if (burgerIcon && burgerLinks) {
          burgerIcon.addEventListener('click', () => {
            burgerLinks.classList.toggle('active');
          });
        }

        document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
          toggle.addEventListener('click', () => {
            toggle.parentElement.classList.toggle('open');
          });
        });
      })
      .catch(err => console.error('Erreur lors du chargement du menu :', err));
  }

  // --- Rendu timeline ---
  function renderTimeline(data) {
    const timelineContainer = document.querySelector('.timeline-container');
    const timeline = document.querySelector('.timeline');
    if (!timeline || !timelineContainer) return;

    timeline.innerHTML = '';

    const events = data.events || [];
    if (!Array.isArray(events) || events.length === 0) {
      timeline.innerHTML = `<div class="error">Aucun événement à afficher.</div>`;
      return;
    }

    const minDate = new Date(Math.min(...events.map(e => new Date(e.start_date))));
    const maxDate = new Date(Math.max(...events.map(e => new Date(e.end_date))));
    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;

    const today = new Date();
    today.setHours(0,0,0,0);

    const horizontalGap = 16;
    const pointStates = ['state-upcoming', 'state-ongoing', 'state-validated', 'state-passed'];
    const savedStates = JSON.parse(localStorage.getItem('pointStates') || '{}');

    const containerStyle = getComputedStyle(timelineContainer);
    const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(containerStyle.paddingRight) || 0;
    const usableWidth = timelineContainer.clientWidth - paddingLeft - paddingRight;
    const dayWidth = usableWidth / totalDays;

    // Colonnes de dates
    for (let i = 0; i < totalDays; i++) {
      const currentDate = new Date(minDate);
      currentDate.setDate(minDate.getDate() + i);

      const day = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
      const date = currentDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

      const col = document.createElement('div');
      col.classList.add('date-column');
      col.style.width = `${dayWidth}px`;

      if (currentDate.getTime() === today.getTime()) {
        col.style.backgroundColor = 'rgba(212,175,55,0.15)';
      }

      col.innerHTML = `<span class="day">${day}</span><span class="date">${date}</span>`;

      if (i > 0) {
        const leftLine = document.createElement('div');
        leftLine.classList.ad
