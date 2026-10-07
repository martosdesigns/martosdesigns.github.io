/**
 * MARTOS DESIGNS — Pintado de la web pública
 * -------------------------------------------------------------
 * Lee las piezas (ver data.js) y construye el contenido de cada página.
 * Las páginas solo declaran DÓNDE va cada cosa; este archivo decide QUÉ:
 *
 *   #diseno-app                 → pestañas + rejilla de diseño (diseno.html)
 *   [data-render="video"]       → carrusel de vídeos        (video.html)
 *   [data-render="web"]         → carrusel de proyectos web (web.html)
 *   [data-render="destacados"]  → piezas marcadas como destacadas (index.html)
 *   [data-render="ultimos"]     → las 8 piezas más recientes      (index.html)
 *
 * Todo el texto que viene de la base de datos se inserta con textContent
 * (nunca como HTML), y los enlaces se validan, así que un dato mal
 * escrito no puede romper ni "inyectar" nada en la página.
 * -------------------------------------------------------------
 */
(function () {
  'use strict';

  const Data = window.PortfolioData;

  const ETIQUETA_SECCION = { diseno: 'Diseño', video: 'Vídeo', web: 'Web' };
  const MAX_PORTADA = 8; // piezas máximas en cada carrusel de la portada

  // -----------------------------------------------------------
  // Utilidades de DOM
  // -----------------------------------------------------------

  /**
   * Crea un elemento. props admite: class, text, dataset y cualquier atributo
   * (los que empiezan por "on" se tratan como eventos). children admite
   * nodos, textos o null (que se ignora).
   */
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    [].concat(children).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    });
    return node;
  }

  /** Solo deja pasar enlaces http(s); cualquier otra cosa (javascript:, data:...) se descarta. */
  function safeUrl(url) {
    return /^https?:\/\//i.test(url || '') ? url : '';
  }

  /** Miniatura automática de YouTube, por si un vídeo no tiene imagen propia. */
  function youtubeThumb(url) {
    const match = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/);
    return match ? `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg` : '';
  }

  function emptyState(text) {
    return el('p', { class: 'empty-state', text });
  }

  // -----------------------------------------------------------
  // Bloques reutilizables
  // -----------------------------------------------------------

  function placeholder(text) {
    return el('div', { class: 'piece-placeholder', text });
  }

  /**
   * Zona de imagen de una tarjeta. Si la imagen no existe (ruta mal escrita
   * o archivo sin publicar) se sustituye por un aviso, en vez de dejar un
   * icono de imagen rota.
   */
  function mediaBlock(pieza, { aspecto = '16:9', fondo = 'oscuro', contain = false, overlay = null } = {}) {
    const classes = [
      'piece-media',
      `aspect-${aspecto.replace(':', '-')}`,
      `fondo-${fondo}`,
      contain ? 'fit-contain' : '',
    ].filter(Boolean).join(' ');

    const src = pieza.ruta || (pieza.seccion === 'video' ? youtubeThumb(pieza.url) : '');
    const wrapper = el('div', { class: classes });

    if (src) {
      const img = el('img', { src, alt: pieza.titulo, loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', () => img.replaceWith(placeholder('Imagen no encontrada')));
      wrapper.append(img);
    } else {
      wrapper.append(placeholder('Sin imagen'));
    }
    if (overlay) wrapper.append(overlay);
    return wrapper;
  }

  /** Agrupa las piezas de diseño por pack (el nombre se compara sin tildes ni mayúsculas). */
  function buildPacks(piezasDiseno) {
    const packs = new Map();
    piezasDiseno.forEach((pieza) => {
      const key = Data.slug(pieza.pack);
      if (!key) return;
      if (!packs.has(key)) packs.set(key, { key, nombre: pieza.pack, piezas: [] });
      packs.get(key).piezas.push(pieza);
    });
    return packs;
  }

  /** Abre el visor ampliado con las imágenes de la pieza (o de todo su pack), empezando por la pulsada. */
  function openPieza(pieza, pack) {
    const origen = pack ? pack.piezas : [pieza];
    const items = origen
      .filter((p) => p.ruta)
      .map((p) => ({ id: p.id, src: p.ruta, caption: pack ? `${pack.nombre} — ${p.titulo}` : p.titulo }));
    if (!items.length || typeof window.openLightbox !== 'function') return;
    const start = Math.max(0, items.findIndex((item) => item.id === pieza.id));
    window.openLightbox(items, start);
  }

  // -----------------------------------------------------------
  // Diseño: pestañas + rejilla
  // -----------------------------------------------------------

  function piezaCard(pieza, ctx) {
    const tipo = ctx.tiposById[pieza.tipo];
    const pack = ctx.packs.get(Data.slug(pieza.pack));
    const hayImagen = Boolean(pieza.ruta);

    const meta = [
      tipo ? el('span', { class: 'piece-type', text: tipo.nombre }) : null,
      pack ? el('span', { class: 'pack-badge', text: `Pack · ${pack.nombre}` }) : null,
    ];

    return el('button', {
      type: 'button',
      class: `piece-card${hayImagen ? '' : ' is-static'}`,
      'aria-label': hayImagen ? `Ampliar: ${pieza.titulo}` : pieza.titulo,
      onclick: () => openPieza(pieza, pack),
    }, [
      mediaBlock(pieza, {
        aspecto: tipo ? tipo.aspecto : '16:9',
        fondo: tipo ? tipo.fondo : 'oscuro',
        contain: tipo ? tipo.aspecto === '1:1' : false,
      }),
      el('div', { class: 'piece-body' }, [
        el('div', { class: 'piece-title', text: pieza.titulo }),
        el('div', { class: 'piece-meta' }, meta),
      ]),
    ]);
  }

  /** Tarjeta de pack: mosaico con las primeras imágenes y el recuento de piezas. */
  function packCard(pack, ctx) {
    const visibles = pack.piezas.slice(0, 4);
    const resto = pack.piezas.length - visibles.length;

    const cells = visibles.map((pieza, index) => {
      const cell = el('div', { class: 'mosaic-cell' });
      if (pieza.ruta) {
        const img = el('img', { src: pieza.ruta, alt: pieza.titulo, loading: 'lazy', decoding: 'async' });
        img.addEventListener('error', () => img.remove());
        cell.append(img);
      }
      if (index === visibles.length - 1 && resto > 0) {
        cell.append(el('span', { class: 'mosaic-more', text: `+${resto}` }));
      }
      return cell;
    });

    const nombresTipos = [...new Set(pack.piezas.map((p) => (ctx.tiposById[p.tipo] || {}).nombre).filter(Boolean))];
    const recuento = pack.piezas.length === 1 ? '1 pieza' : `${pack.piezas.length} piezas`;

    return el('button', {
      type: 'button',
      class: 'piece-card pack-card',
      'aria-label': `Abrir pack: ${pack.nombre}`,
      onclick: () => openPieza(pack.piezas.find((p) => p.ruta) || pack.piezas[0], pack),
    }, [
      el('div', { class: 'piece-media aspect-16-9 mosaic', 'data-count': Math.min(visibles.length, 4) }, cells),
      el('div', { class: 'piece-body' }, [
        el('div', { class: 'piece-title', text: pack.nombre }),
        el('div', { class: 'piece-meta' }, [
          el('span', { class: 'piece-type', text: [recuento, ...nombresTipos].join(' · ') }),
        ]),
      ]),
    ]);
  }

  function renderDiseno(container, { piezas, tipos }) {
    const items = piezas.filter((p) => p.seccion === 'diseno');
    if (!items.length) {
      container.replaceChildren(emptyState('Próximamente: aquí aparecerán logos, overlays y miniaturas.'));
      return;
    }

    const ctx = {
      tiposById: Object.fromEntries(tipos.map((t) => [t.id, t])),
      packs: buildPacks(items),
    };

    // Pestañas: Todo, Packs (si hay) y un tipo por cada categoría que tenga contenido.
    const pestañas = [{ id: 'todo', label: 'Todo', count: items.length }];
    if (ctx.packs.size) pestañas.push({ id: 'packs', label: 'Packs', count: ctx.packs.size });
    tipos.forEach((tipo) => {
      const count = items.filter((p) => p.tipo === tipo.id).length;
      if (count) pestañas.push({ id: tipo.id, label: tipo.nombre, count });
    });

    const tablist = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Categorías de diseño' });
    const panel = el('div', { class: 'piece-grid', role: 'tabpanel', id: 'diseno-panel' });

    const cardsFor = (tabId) => {
      if (tabId === 'packs') return [...ctx.packs.values()].map((pack) => packCard(pack, ctx));
      const lista = tabId === 'todo' ? items : items.filter((p) => p.tipo === tabId);
      return lista.map((pieza) => piezaCard(pieza, ctx));
    };

    const selectTab = (tabId, { updateHash = true } = {}) => {
      const activa = pestañas.find((t) => t.id === tabId) || pestañas[0];
      tablist.querySelectorAll('[role="tab"]').forEach((button) => {
        const selected = button.dataset.tab === activa.id;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      panel.setAttribute('aria-labelledby', `tab-${activa.id}`);
      const cards = cardsFor(activa.id);
      cards.forEach((card, index) => card.style.setProperty('--i', index));
      panel.replaceChildren(...cards);
      if (updateHash) window.history.replaceState(null, '', `#${activa.id}`);
    };

    pestañas.forEach((tab) => {
      tablist.append(el('button', {
        type: 'button',
        role: 'tab',
        class: 'tab',
        id: `tab-${tab.id}`,
        'data-tab': tab.id,
        'aria-controls': 'diseno-panel',
        onclick: () => selectTab(tab.id),
      }, [tab.label, el('span', { class: 'tab-count', text: tab.count })]));
    });

    // Navegación por teclado entre pestañas (flechas izquierda/derecha).
    tablist.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const botones = [...tablist.querySelectorAll('[role="tab"]')];
      const actual = botones.findIndex((b) => b.getAttribute('aria-selected') === 'true');
      const siguiente = (actual + (event.key === 'ArrowRight' ? 1 : -1) + botones.length) % botones.length;
      botones[siguiente].focus();
      selectTab(botones[siguiente].dataset.tab);
    });

    container.replaceChildren(tablist, panel);

    // Permite enlazar directamente a una pestaña: diseno.html#logo
    const fromHash = () => window.location.hash.slice(1);
    selectTab(fromHash(), { updateHash: false });
    window.addEventListener('hashchange', () => selectTab(fromHash(), { updateHash: false }));
  }

  // -----------------------------------------------------------
  // Tarjetas de carrusel (Vídeo, Web y portada)
  // -----------------------------------------------------------

  function cardBody(pieza, extra = []) {
    return el('div', { class: 'card-body' }, [
      el('div', { class: 'card-title', text: pieza.titulo }),
      pieza.subtitulo ? el('div', { class: 'card-sub', text: pieza.subtitulo }) : null,
      ...extra,
    ]);
  }

  function videoCard(pieza) {
    const href = safeUrl(pieza.url);
    const media = mediaBlock(pieza, { overlay: el('div', { class: 'playbtn' }) });
    const link = href
      ? el('a', { class: 'card-media-link', href, target: '_blank', rel: 'noopener', 'aria-label': `Ver vídeo: ${pieza.titulo}` }, media)
      : media;
    return el('div', { class: 'card carousel-item carousel-item--card' }, [link, cardBody(pieza)]);
  }

  function webCard(pieza) {
    const href = safeUrl(pieza.url);
    const extra = [
      pieza.etiquetas.length
        ? el('div', { class: 'tags' }, pieza.etiquetas.map((tag) => el('span', { class: 'tag', text: tag })))
        : null,
      href
        ? el('a', { class: 'link-arrow', href, target: '_blank', rel: 'noopener' }, ['Ver en vivo ', el('span', { text: '→' })])
        : null,
    ];
    return el('div', { class: 'card carousel-item carousel-item--card' }, [
      el('div', { class: 'browser' }, [el('span'), el('span'), el('span')]),
      mediaBlock(pieza),
      cardBody(pieza, extra),
    ]);
  }

  /** Tarjeta genérica de la portada: según la sección abre el visor (diseño) o el enlace (vídeo / web). */
  function homeCard(pieza, ctx) {
    const tipo = ctx.tiposById[pieza.tipo];
    const subtitulo = [ETIQUETA_SECCION[pieza.seccion], tipo ? tipo.nombre : '', pieza.subtitulo].filter(Boolean).join(' · ');
    const media = mediaBlock(pieza, {
      fondo: tipo ? tipo.fondo : 'oscuro',
      contain: Boolean(tipo && tipo.aspecto === '1:1'),
      overlay: pieza.seccion === 'video' ? el('div', { class: 'playbtn' }) : null,
    });
    const body = cardBody({ titulo: pieza.titulo, subtitulo });
    const classes = 'card carousel-item carousel-item--card';

    if (pieza.seccion === 'diseno') {
      const pack = ctx.packs.get(Data.slug(pieza.pack));
      return el('button', { type: 'button', class: `${classes} card-button`, onclick: () => openPieza(pieza, pack) }, [media, body]);
    }
    const href = safeUrl(pieza.url);
    if (href) return el('a', { class: `${classes} card-link`, href, target: '_blank', rel: 'noopener' }, [media, body]);
    return el('div', { class: classes }, [media, body]);
  }

  function renderCarousel(container, tarjetas, textoVacio) {
    container.replaceChildren(...(tarjetas.length ? tarjetas : [emptyState(textoVacio)]));
  }

  // -----------------------------------------------------------
  // Punto de entrada
  // -----------------------------------------------------------

  function renderTarget(target, { piezas, tipos }) {
    const ctx = {
      tiposById: Object.fromEntries(tipos.map((t) => [t.id, t])),
      packs: buildPacks(piezas.filter((p) => p.seccion === 'diseno')),
    };

    if (target.id === 'diseno-app') return renderDiseno(target, { piezas, tipos });

    switch (target.dataset.render) {
      case 'video':
        return renderCarousel(target, piezas.filter((p) => p.seccion === 'video').map(videoCard), 'Próximamente: aquí irán los vídeos.');
      case 'web':
        return renderCarousel(target, piezas.filter((p) => p.seccion === 'web').map(webCard), 'Próximamente: aquí irán los proyectos web.');
      case 'destacados':
        return renderCarousel(target, piezas.filter((p) => p.destacado).slice(0, MAX_PORTADA).map((p) => homeCard(p, ctx)), 'Próximamente.');
      case 'ultimos': {
        const recientes = piezas.slice().sort((a, b) => b.creado - a.creado).slice(0, MAX_PORTADA);
        return renderCarousel(target, recientes.map((p) => homeCard(p, ctx)), 'Próximamente.');
      }
      default:
        return undefined;
    }
  }

  /** Aviso discreto para no confundir el contenido de ejemplo con el real. */
  function showDemoBadge() {
    if (!Data.isDemo || document.querySelector('.demo-badge')) return;
    document.body.append(el('div', { class: 'demo-badge', text: 'Modo demostración · contenido de ejemplo' }));
  }

  /** Pinta todos los bloques de la página actual. Devuelve una promesa que se resuelve al terminar. */
  async function renderAll() {
    const targets = document.querySelectorAll('#diseno-app, [data-render]');
    if (!targets.length) return;

    try {
      const datos = await Data.loadAll();
      targets.forEach((target) => renderTarget(target, datos));
      showDemoBadge();
    } catch (error) {
      console.error('No se pudieron cargar los proyectos:', error);
      targets.forEach((target) => target.replaceChildren(emptyState('No se han podido cargar los proyectos. Inténtalo de nuevo en unos minutos.')));
    }
  }

  window.PortfolioRender = { renderAll };
})();
