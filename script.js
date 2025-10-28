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

// === Intégration automatique de la Social Bar Adsterra ===
function loadAdsterraSocialBar() {
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = '//pl27941880.effectivegatecpm.com/d2/18/e1/d218e10073aebbd048301c683dbf1599.js';
  document.body.appendChild(script);
}
document.addEventListener('DOMContentLoaded', loadAdsterraSocialBar);


// === Intégration automatique de la bannière Adsterra (bandeau bas de page) ===
function loadAdsterraBanner() {
  const bannerContainer = document.createElement('div');
  bannerContainer.className = 'adsense-footer';
  bannerContainer.innerHTML = `
    <div align="center">
      <script type="text/javascript">
        atOptions = {
          'key' : '598199983e93ba13e5325d01ffc8a9cc',
          'format' : 'iframe',
          'height' : 60,
          'width' : 468,
          'params' : {}
        };
      </script>
      <script type="text/javascript" src="//www.highperformanceformat.com/598199983e93ba13e5325d01ffc8a9cc/invoke.js"></script>
    </div>
  `;
  document.body.appendChild(bannerContainer);
}
document.addEventListener('DOMContentLoaded', loadAdsterraBanner);
