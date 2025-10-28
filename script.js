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
document.addEventListener('DOMContentLoaded', loadAdsterraBanner);

// === Protection anti-redirections publicitaires ===
(function() {
  const originalLocation = window.location;
  const blockList = ['adsterra', 'effectivegate', 'technorvia', 'format', 'co.in'];

  // Intercepter les tentatives de redirection via window.top.location, window.location, etc.
  const blockRedirection = (target) => {
    try {
      const url = target.toString();
      if (blockList.some(keyword => url.includes(keyword))) {
        console.warn('🚫 Redirection bloquée vers :', url);
        return true;
      }
    } catch (e) {}
    return false;
  };

  // Bloquer les redirections forcées par scripts
  Object.defineProperty(window, 'location', {
    configurable: false,
    enumerable: true,
    get: function() {
      return originalLocation;
    },
    set: function(value) {
      if (!blockRedirection(value)) {
        originalLocation.href = value;
      }
    }
  });

  // Bloquer aussi les redirections via top.location
  if (window.top !== window.self) {
    try {
      Object.defineProperty(window.top, 'location', {
        configurable: false,
        enumerable: true,
        get: function() {
          return originalLocation;
        },
        set: function(value) {
          if (!blockRedirection(value)) {
            originalLocation.href = value;
          }
        }
      });
    } catch (e) {
      // Certains navigateurs empêchent d'écrire dans top.location, c’est normal
    }
  }

  // Optionnel : détecter les tentatives de replace()
  const originalReplace = window.location.replace;
  window.location.replace = function(url) {
    if (!blockRedirection(url)) {
      return originalReplace.call(window.location, url);
    }
  };
})();
