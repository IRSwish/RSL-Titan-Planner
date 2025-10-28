// --- Charger le menu externe d'abord ---
fetch('/menu.html')
  .then(response => response.text())
  .then(data => {
    document.getElementById('menu-container').innerHTML = data;

    // Maintenant que le menu est dans le DOM, on peut l'activer
    const burgerIcon = document.getElementById('burger-icon');
    const burgerLinks = document.getElementById('burger-links');

    if(burgerIcon && burgerLinks){
      burgerIcon.addEventListener('click', () => {
        burgerLinks.classList.toggle('active');
      });
    }

    document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const parent = toggle.parentElement;
        parent.classList.toggle('open');
      });
    });
  })
  .catch(error => console.error('Erreur lors du chargement du menu:', error));


// === Intégration automatique de la bannière Adsterra (bandeau bas de page) ===
function loadAdsterraBanner() {
  const bannerContainer = document.createElement('div');
  bannerContainer.className = 'adsense-footer';
  bannerContainer.setAttribute('align', 'center');
  document.body.appendChild(bannerContainer);

  // Définir les options Adsterra globalement
  window.atOptions = {
    'key': '598199983e93ba13e5325d01ffc8a9cc',
    'format': 'iframe',
    'height': 60,
    'width': 468,
    'params': {}
  };

  // Créer le script d’invocation
  const invokeScript = document.createElement('script');
  invokeScript.type = 'text/javascript';
  invokeScript.src = '//www.highperformanceformat.com/598199983e93ba13e5325d01ffc8a9cc/invoke.js';
  bannerContainer.appendChild(invokeScript);
}
// document.addEventListener('DOMContentLoaded', loadAdsterraBanner);