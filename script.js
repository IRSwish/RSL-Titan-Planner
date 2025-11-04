fetch('/menu.html')
  .then(r => r.text())
  .then(html => {
    const host = document.getElementById('menu-container');
    if (!host) {
      console.warn('⚠️ #menu-container introuvable');
      return;
    }
    host.innerHTML = html;

    // === Initialisation Lucide avec retry ===
    const renderIcons = () => {
      if (window.lucide && lucide.createIcons) {
        lucide.createIcons();
      } else {
        setTimeout(renderIcons, 200);
      }
    };
    renderIcons();

    const sidebar = document.getElementById('sidebar');
    const burgerBtn = document.getElementById('burger-btn');
    let open = false;

    // === Fonction centrale ===
    const setOpen = (state) => {
      open = !!state;
      if (sidebar) sidebar.classList.toggle('open', open);
      document.body.classList.toggle('menu-opened', open);
      if (burgerBtn) {
        burgerBtn.innerHTML = open
          ? '<i data-lucide="x"></i>'
          : '<i data-lucide="menu"></i>';
        renderIcons();
      }
    };

    // === Délégation principale des clics ===
    document.addEventListener('click', (e) => {
      const onBurger = e.target.closest('#burger-btn');
      const inSidebar = e.target.closest('#sidebar');
      const onLink = e.target.closest('#sidebar a');

      if (onBurger) {
        setOpen(!open);
        return;
      }

      const dropdownToggle = e.target.closest('.dropdown-toggle');
      if (dropdownToggle) {
        e.stopPropagation();
        const parent = dropdownToggle.parentElement;

        parent.parentElement
          .querySelectorAll('.dropdown.open')
          .forEach(other => {
            if (other !== parent) other.classList.remove('open');
          });

        parent.classList.toggle('open');
        return;
      }

      const subToggle = e.target.closest('.dropdown-sub-toggle');
      if (subToggle) {
        e.stopPropagation();
        const content = subToggle.nextElementSibling;
        const parentList = subToggle.closest('.dropdown-content, .dropdown-sub-content');

        if (parentList) {
          parentList
            .querySelectorAll('.dropdown-sub-toggle.open')
            .forEach(other => {
              if (other !== subToggle) {
                other.classList.remove('open');
                const next = other.nextElementSibling;
                if (next && next.classList.contains('dropdown-sub-content')) {
                  next.classList.remove('open');
                  next.style.display = 'none';
                }
              }
            });
        }

        content.classList.toggle('open');
        subToggle.classList.toggle('open');
        return;
      }

      if (onLink) {
        // laisse le hashchanger se déclencher, la fermeture se fera dans l'écouteur global
        return;
      }

      if (open && !inSidebar && !onBurger) {
        setOpen(false);
      }
    });

    // ✅ === AUTO-OUVERTURE + SURBRILLANCE APRÈS INJECTION ===
    const activateCurrentLink = () => {
      const normalize = (str) => str.toLowerCase().replace(/\/+$/, '');
      const path = normalize(window.location.pathname);
      const hash = window.location.hash.toLowerCase();
      const fullPath = normalize(`${path}${hash}`);

      const sidebar = document.getElementById('sidebar');
      if (!sidebar) return;

      // Retire tout marquage précédent
      sidebar.querySelectorAll('.active-link').forEach(a => a.classList.remove('active-link'));

      const links = [...sidebar.querySelectorAll('a[href]')];
      const norm = s => (s || '').toLowerCase().replace(/\/+$/, '');

      // === Détection du lien actif ===
      let activeLink = null;

      // 1️⃣ Si on a un hash (#maria, #hydra, #halloween-path-2025)
      if (hash) {
        activeLink = links.find(a => {
          const href = norm(a.getAttribute('href'));
          return (
            href === fullPath ||
            href === hash ||
            href.endsWith(hash) ||
            href.includes(`${path}${hash}`)
          );
        });
      }

      // 2️⃣ Sinon : recherche normale sur le chemin sans hash
      if (!activeLink) {
        activeLink = links.find(a => {
          const href = norm(a.getAttribute('href').split('#')[0]);
          if (!href || href.startsWith('#')) return false;
          return path === href || path.startsWith(href);
        });
      }

      if (!activeLink) return;

      // Active visuellement le lien
      activeLink.classList.add('active-link');

      // Ouvre les bons parents
      const openParent = (el) => {
        if (!el) return;
        const toggle = el.previousElementSibling;
        if (toggle && toggle.classList.contains('dropdown-sub-toggle')) toggle.classList.add('open');
        el.classList.add('open');
        const parentDropdown = el.closest('.dropdown');
        if (parentDropdown) parentDropdown.classList.add('open');
      };

      const mainDropdown = activeLink.closest('.dropdown');
      if (mainDropdown) mainDropdown.classList.add('open');

      const subContent = activeLink.closest('.dropdown-sub-content');
      if (subContent) openParent(subContent);
    };

    // ✅ Premier appel après injection du menu
    activateCurrentLink();

    // ✅ Mise à jour automatique quand le hash change
    window.addEventListener('hashchange', () => {
      activateCurrentLink();
      // ferme le menu si il était ouvert
      if (sidebar?.classList.contains('open')) setOpen(false);
    });
  });
