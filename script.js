/**
 * MARTOS DESIGNS — Portfolio de Eric Martos
 * -------------------------------------------------------------
 * Script compartido por las 6 páginas del sitio (index, diseno,
 * video, web, sobre-mi, contacto). No usa frameworks ni build
 * step: es JavaScript plano, pensado para poder editarse a mano.
 *
 * Índice de funciones:
 *   1. highlightCurrentNavLink()  → marca la página activa en el menú
 *   2. initCarousels()            → flechas de los carruseles horizontales
 *   3. initMobileMenu()           → menú hamburguesa en pantallas pequeñas
 *   4. initCopyEmailButton()      → botón "copiar correo" en Contacto
 *   5. initScrollReveal()         → animaciones de aparición al hacer scroll
 *   6. initPageTransitions()      → fundido al navegar entre páginas
 *   7. initHeroParallax()         → paralaje del titular en el Inicio
 *   8. initLightbox()             → visor ampliado para grupos de imágenes
 *
 * Todas las funciones son independientes entre sí: si una página
 * no tiene el elemento correspondiente, la función simplemente no
 * hace nada (comprueban su propio elemento antes de continuar).
 * -------------------------------------------------------------
 */

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 1. Resalta en el menú el enlace que corresponde a la página actual,
 *    comparando el nombre de archivo de la URL con el href de cada enlace.
 */
function highlightCurrentNavLink() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item, .nav-mobile a').forEach((link) => {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active');
    }
  });
}

/**
 * 2. Da vida a los carruseles horizontales (Logos, Overlays, Vídeo, Web...).
 *    Cada carrusel tiene dos botones (data-dir="-1" / "1") que hacen scroll
 *    una "página" de tarjetas hacia atrás o hacia delante, y se desactivan
 *    solos al llegar al principio o al final.
 */
function initCarousels() {
  document.querySelectorAll('.carousel').forEach((carousel) => {
    const carouselId = carousel.id;
    const prevBtn = document.querySelector(`.car-btn[data-target="${carouselId}"][data-dir="-1"]`);
    const nextBtn = document.querySelector(`.car-btn[data-target="${carouselId}"][data-dir="1"]`);
    if (!prevBtn && !nextBtn) return;

    const CARD_GAP = 22; // debe coincidir con el "gap" de .carousel en styles.css

    const getScrollStep = () => {
      const firstCard = carousel.querySelector('.carousel-item');
      return firstCard ? (firstCard.offsetWidth + CARD_GAP) * 2 : 300;
    };

    const refreshArrowStates = () => {
      const maxScroll = carousel.scrollWidth - carousel.clientWidth - 4;
      if (prevBtn) prevBtn.disabled = carousel.scrollLeft <= 4;
      if (nextBtn) nextBtn.disabled = carousel.scrollLeft >= maxScroll;
    };

    prevBtn?.addEventListener('click', () => {
      carousel.scrollBy({ left: -getScrollStep(), behavior: 'smooth' });
    });
    nextBtn?.addEventListener('click', () => {
      carousel.scrollBy({ left: getScrollStep(), behavior: 'smooth' });
    });

    carousel.addEventListener('scroll', refreshArrowStates, { passive: true });
    window.addEventListener('resize', refreshArrowStates);
    refreshArrowStates();
  });
}

/**
 * 3. Abre/cierra el menú de navegación en móvil (el botón hamburguesa).
 */
function initMobileMenu() {
  const burgerBtn = document.getElementById('burger');
  const mobilePanel = document.getElementById('mobile-panel');
  if (!burgerBtn || !mobilePanel) return;

  burgerBtn.addEventListener('click', () => {
    const isOpen = mobilePanel.classList.toggle('open');
    burgerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
}

/**
 * 4. Botón "Copiar correo" de la página de Contacto: copia el email al
 *    portapapeles y muestra una confirmación breve, con un pequeño pulso
 *    visual (clase .copied, animada en CSS) que se puede repetir sin
 *    esperar a que termine la anterior.
 */
function initCopyEmailButton() {
  const copyBtn = document.getElementById('copy-email');
  if (!copyBtn) return;

  const EMAIL = 'martosdesigns.art@gmail.com';

  copyBtn.addEventListener('click', async () => {
    copyBtn.classList.remove('copied');
    void copyBtn.offsetWidth; // fuerza el reinicio de la animación CSS
    copyBtn.classList.add('copied');

    try {
      await navigator.clipboard.writeText(EMAIL);
      copyBtn.textContent = '¡Copiado!';
      setTimeout(() => { copyBtn.textContent = 'Copiar correo'; }, 1800);
    } catch {
      // Si el navegador bloquea el portapapeles, al menos mostramos el email
      copyBtn.textContent = EMAIL;
    }
  });
}

/**
 * 5. Anima la aparición de tarjetas, títulos y bloques de texto cuando
 *    entran en la pantalla al hacer scroll, y los vuelve a ocultar cuando
 *    salen (para que la animación se repita si el usuario sube y baja).
 *
 *    Hay dos variantes:
 *    - .reveal-item → fundido + ligera escala (tarjetas, títulos de sección)
 *    - .reveal-blur → fundido + desenfoque + ascenso (cabeceras de página,
 *      un efecto más "cinematográfico" reservado para los titulares grandes)
 */
function initScrollReveal() {
  const SCALE_FADE_SELECTORS = [
    '.sec-head', '.card', '.tile', '.subgroup-label', '.carousel-item',
    '.photo-ph', '.about-bio p', '.terminal', '.code-frame',
    '.contact-card', '.copy-btn', '.tc-strip',
  ].join(', ');

  const BLUR_FADE_SELECTORS = [
    '.page-hero .eyebrow', '.page-hero h1', '.page-hero .sec-desc',
    '.page-hero .script-note', '.squiggle.draw',
  ].join(', ');

  const scaleFadeEls = document.querySelectorAll(SCALE_FADE_SELECTORS);
  scaleFadeEls.forEach((el, index) => {
    el.classList.add('reveal-item');
    // Las tarjetas de un mismo carrusel se escalonan según su posición
    // dentro del grupo, no según su orden global en la página.
    const staggerPosition = el.classList.contains('carousel-item')
      ? Array.prototype.indexOf.call(el.parentElement.children, el)
      : index;
    el.style.transitionDelay = `${Math.min(staggerPosition, 8) * 70}ms`;
  });

  const blurFadeEls = document.querySelectorAll(BLUR_FADE_SELECTORS);
  blurFadeEls.forEach((el, index) => {
    el.classList.add('reveal-blur');
    el.style.transitionDelay = `${(index % 5) * 110}ms`;
  });

  const allRevealEls = [...scaleFadeEls, ...blurFadeEls];

  if (!('IntersectionObserver' in window)) {
    // Navegador sin soporte: mostramos todo directamente, sin animación.
    allRevealEls.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle('is-visible', entry.isIntersecting);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );

  allRevealEls.forEach((el) => observer.observe(el));
}

/**
 * 6. Transición suave entre páginas del sitio: al hacer clic en un enlace
 *    interno (.html), la página actual se desvanece antes de navegar, y
 *    la página nueva aparece con el mismo fundido al cargar (ver el final
 *    de este archivo, donde se añade la clase "page-ready" al <body>).
 *    Los enlaces externos (mailto:, Instagram, YouTube...) no se tocan.
 */
function initPageTransitions() {
  const FADE_OUT_DURATION = 280; // ms — debe coincidir con la transición CSS de <body>

  document.querySelectorAll('a[href$=".html"]').forEach((link) => {
    const href = link.getAttribute('href');
    const isExternal = link.target === '_blank' || /^https?:\/\//.test(href);
    if (isExternal) return;

    link.addEventListener('click', (event) => {
      event.preventDefault();
      document.body.classList.remove('page-ready');
      document.body.classList.add('page-leaving');
      setTimeout(() => { window.location.href = href; }, FADE_OUT_DURATION);
    });
  });
}

/**
 * 7. Paralaje sutil del titular en la portada: a medida que se hace scroll
 *    dentro del hero, el texto se desvanece y sube ligeramente, como en
 *    muchas páginas de producto. Solo existe el elemento #hero en index.html,
 *    así que en el resto de páginas esta función no hace nada.
 */
function initHeroParallax() {
  if (prefersReducedMotion()) return;

  const hero = document.getElementById('hero');
  const heroContent = hero?.querySelector('.hero-content');
  if (!hero || !heroContent) return;

  const FADE_OUT_DISTANCE = 480; // px de scroll hasta desvanecerse del todo
  const MAX_RISE = 90; // px máximos que sube el texto

  const updateParallax = () => {
    const scrollY = window.scrollY;
    const opacity = Math.max(0, 1 - scrollY / FADE_OUT_DISTANCE);
    const riseAmount = Math.min(scrollY * 0.3, MAX_RISE);
    heroContent.style.opacity = opacity;
    heroContent.style.transform = `translateY(${-riseAmount}px)`;
  };

  window.addEventListener('scroll', updateParallax, { passive: true });
  updateParallax();
}

/**
 * 8. Visor de imágenes ampliadas para "tarjetas de grupo" (ej. varias
 *    miniaturas del mismo proyecto). Cualquier <button> con el atributo
 *    data-lightbox-group="nombre-del-grupo" se agrupa automáticamente con
 *    los demás botones que compartan ese mismo nombre; al hacer clic se
 *    abre un visor a pantalla completa con flechas para pasar solo entre
 *    las imágenes de ese grupo.
 *
 *    Atributos que lee cada botón disparador:
 *      data-lightbox-group  → nombre del grupo (obligatorio)
 *      data-src             → imagen a mostrar en grande (obligatorio)
 *      data-caption         → texto opcional bajo la imagen
 */
function initLightbox() {
  const triggers = document.querySelectorAll('[data-lightbox-group]');
  if (!triggers.length) return;

  // Agrupa los botones por nombre de grupo y guarda a cada uno su posición
  // dentro del grupo (para poder abrir el visor justo en esa imagen).
  const groups = {};
  triggers.forEach((btn) => {
    const groupName = btn.dataset.lightboxGroup;
    groups[groupName] ??= [];
    groups[groupName].push({
      src: btn.dataset.src,
      caption: btn.dataset.caption || '',
    });
    btn.dataset.groupIndex = groups[groupName].length - 1;
  });

  // Construye el overlay una sola vez y lo reutiliza para todos los grupos.
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="Cerrar">✕</button>
    <button class="lightbox-prev" aria-label="Anterior">‹</button>
    <img class="lightbox-img" src="" alt="">
    <button class="lightbox-next" aria-label="Siguiente">›</button>
    <div class="lightbox-caption"></div>
  `;
  document.body.appendChild(overlay);

  const imageEl = overlay.querySelector('.lightbox-img');
  const captionEl = overlay.querySelector('.lightbox-caption');

  let activeGroup = null;
  let activeIndex = 0;

  const renderCurrentImage = () => {
    const item = groups[activeGroup][activeIndex];
    imageEl.src = item.src;
    imageEl.alt = item.caption;
    captionEl.textContent = item.caption;
  };

  const openLightbox = (groupName, startIndex) => {
    activeGroup = groupName;
    activeIndex = startIndex;
    renderCurrentImage();
    overlay.classList.add('open');
  };

  const closeLightbox = () => overlay.classList.remove('open');

  const showNextImage = () => {
    activeIndex = (activeIndex + 1) % groups[activeGroup].length;
    renderCurrentImage();
  };

  const showPreviousImage = () => {
    activeIndex = (activeIndex - 1 + groups[activeGroup].length) % groups[activeGroup].length;
    renderCurrentImage();
  };

  triggers.forEach((btn) => {
    btn.addEventListener('click', () => {
      openLightbox(btn.dataset.lightboxGroup, parseInt(btn.dataset.groupIndex, 10));
    });
  });

  overlay.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  overlay.querySelector('.lightbox-next').addEventListener('click', showNextImage);
  overlay.querySelector('.lightbox-prev').addEventListener('click', showPreviousImage);

  // Cierra al hacer clic fuera de la imagen (sobre el fondo oscuro)
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeLightbox();
  });

  // Navegación por teclado: flechas para moverse, Escape para cerrar
  document.addEventListener('keydown', (event) => {
    if (!overlay.classList.contains('open')) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowRight') showNextImage();
    if (event.key === 'ArrowLeft') showPreviousImage();
  });
}

// -------------------------------------------------------------
// Punto de entrada: se ejecuta en cuanto el HTML está listo.
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('js-ready'); // activa las animaciones CSS que dependen de JS

  highlightCurrentNavLink();
  initCarousels();
  initMobileMenu();
  initCopyEmailButton();
  initScrollReveal();
  initPageTransitions();
  initHeroParallax();
  initLightbox();

  // Fundido de entrada: revela la página una vez todo está preparado.
  requestAnimationFrame(() => document.body.classList.add('page-ready'));
});
