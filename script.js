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
