// --- fusion.js ---
(() => {
  let timelineData = null;

  /**
   * Charge le fichier JSON et affiche la timeline
   */
  function fetchAndRenderTimeline() {
    const timelineContainer = document.querySelector('.timeline-container');
    if (!timelineContainer) return;

    const jsonPath = timelineContainer.dataset.json;
    if (!jsonPath) {
      console.error('Aucun JSON indiqué pour la timeline');
      return;
    }

    // Vider la timeline avant de recharger
    const timeline = document.querySelector('.timeline');
    if (timeline) timeline.innerHTML = '';

    fetch(jsonPath)
      .then(res => {
        if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        timelineData = data;
        renderTimeline(data);
      })
      .catch(err => console.error('Erreur lors du chargement du JSON :', err));
  }

  /**
   * Rend la timeline en fonction des données JSON
   */
  function renderTimeline(data) {
    const timeline = document.querySelector('.timeline');
    if (!timeline) return;

    timeline.innerHTML = ''; // on nettoie

    data.steps.forEach(step => {
      const stepEl = document.createElement('div');
      stepEl.classList.add('timeline-step', step.status || 'not-started');
      stepEl.textContent = step.name;
      timeline.appendChild(stepEl);
    });

    // Mise à jour des compteurs
    updateSummary(data);
  }

  /**
   * Met à jour les totaux dans le résumé
   */
  function updateSummary(data) {
    const acquired = document.getElementById('points-acquired');
    const virtual = document.getElementById('points-virtual');
    const skipped = document.getElementById('points-passed');

    let totalAcquired = 0;
    let totalVirtual = 0;
    let totalSkipped = 0;

    data.steps.forEach(step => {
      if (step.points) {
        totalVirtual += step.points;
        if (step.status === 'done') totalAcquired += step.points;
        if (step.status === 'skipped') totalSkipped += step.points;
      }
    });

    if (acquired) acquired.textContent = totalAcquired;
    if (virtual) virtual.textContent = totalVirtual;
    if (skipped) skipped.textContent = totalSkipped;
  }

  /**
   * Charge le menu si nécessaire
   */
  function loadMenu() {
    const menuContainer = document.getElementById('menu-container');
    if (!menuContainer) return;

    fetch('/menu.html')
      .then(res => res.text())
      .then(html => {
        menuContainer.innerHTML = html;
      })
      .catch(err => console.error('Erreur lors du chargement du menu :', err));
  }

  // Chargement initial de la page
  window.addEventListener('load', () => {
    fetchAndRenderTimeline();
    loadMenu();
  });

  // Recalcule la timeline au resize
  window.addEventListener('resize', () => {
    if (timelineData) renderTimeline(timelineData);
  });

  // 👉 Permet de relancer le chargement depuis l'extérieur
  window.reloadTimeline = () => {
    fetchAndRenderTimeline();
  };
})();
