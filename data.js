/**
 * MARTOS DESIGNS — Capa de datos
 * -------------------------------------------------------------
 * Único punto del sitio que sabe de dónde salen los proyectos.
 * Lo usan tanto las páginas públicas (vía render.js) como el panel
 * de administración (admin.js).
 *
 * Modelo de datos (Firestore):
 *
 *   Colección "piezas" — una pieza = un diseño, un vídeo o un proyecto web
 *     seccion    'diseno' | 'video' | 'web'
 *     tipo       id del tipo de diseño ('logo', 'overlay'...). Solo en diseño.
 *     titulo     texto que se muestra en la tarjeta
 *     subtitulo  texto secundario (ej. "Personal" o el nombre del cliente)
 *     ruta       imagen de la pieza, ej. "assets/logos/logo-01.jpg"
 *     pack       nombre del pack al que pertenece (opcional, solo diseño)
 *     url        enlace del vídeo (YouTube) o de la web en vivo
 *     etiquetas  lista de textos, ej. ["HTML", "CSS"] (solo web)
 *     destacado  true → sale en "Proyectos destacados" de la portada
 *     visible    false → oculta en la web pública (sigue en el panel)
 *     orden      número; menor = antes. Se reordena desde el panel
 *     creado     fecha de creación en milisegundos (para "Últimos trabajos")
 *
 *   Documento "config/diseno" — lista de tipos de diseño editable
 *     tipos      [{ id, nombre, aspecto: '1:1'|'16:9', fondo: 'claro'|'oscuro' }]
 *
 * Mientras firebase-config.js no esté rellenado, funciona en modo
 * demostración con contenido de ejemplo (DEMO_PIEZAS), sin red.
 * -------------------------------------------------------------
 */
(function () {
  'use strict';

  const COLECCION_PIEZAS = 'piezas';
  const DOC_TIPOS = { coleccion: 'config', id: 'diseno' };

  // Para no gastar lecturas de Firestore en cada página, los datos se
  // guardan en la sesión del navegador durante unos minutos. Añadiendo
  // ?fresh a la URL se ignora la caché (el panel lo usa en "Ver web").
  const CACHE_KEY = 'md-portfolio-cache-v1';
  const CACHE_TTL_MS = 5 * 60 * 1000;

  const SECCIONES = ['diseno', 'video', 'web'];
  const ASPECTOS = ['1:1', '16:9'];
  const FONDOS = ['claro', 'oscuro'];

  /** Tipos de diseño que se usan hasta que se guarden otros desde el panel. */
  const DEFAULT_TIPOS = [
    { id: 'logo', nombre: 'Logos', aspecto: '1:1', fondo: 'claro' },
    { id: 'overlay', nombre: 'Overlays', aspecto: '16:9', fondo: 'oscuro' },
    { id: 'miniatura', nombre: 'Miniaturas', aspecto: '16:9', fondo: 'oscuro' },
  ];

  /** Contenido de ejemplo para el modo demostración. */
  const DEMO_PIEZAS = [
    { id: 'demo-l1', seccion: 'diseno', tipo: 'logo', titulo: 'Logo de ejemplo 1', destacado: true, orden: 10, creado: 1700000010000 },
    { id: 'demo-l2', seccion: 'diseno', tipo: 'logo', titulo: 'Logo de ejemplo 2', orden: 11, creado: 1700000009000 },
    { id: 'demo-l3', seccion: 'diseno', tipo: 'logo', titulo: 'Logo de ejemplo 3', orden: 12, creado: 1700000008000 },
    { id: 'demo-o1', seccion: 'diseno', tipo: 'overlay', titulo: 'Overlay de ejemplo 1', orden: 20, creado: 1700000007000 },
    { id: 'demo-o2', seccion: 'diseno', tipo: 'overlay', titulo: 'Overlay de ejemplo 2', orden: 21, creado: 1700000006000 },
    { id: 'demo-m1', seccion: 'diseno', tipo: 'miniatura', titulo: 'Miniatura #1 — La llegada', ruta: 'assets/video/vlog-japon-1.jpg', pack: 'VLOG en Japón', destacado: true, orden: 1, creado: 1700000020000 },
    { id: 'demo-m2', seccion: 'diseno', tipo: 'miniatura', titulo: 'Miniatura #2', pack: 'VLOG en Japón', orden: 2, creado: 1700000019000 },
    { id: 'demo-m3', seccion: 'diseno', tipo: 'miniatura', titulo: 'Miniatura #3', pack: 'VLOG en Japón', orden: 3, creado: 1700000018000 },
    { id: 'demo-m4', seccion: 'diseno', tipo: 'logo', titulo: 'Logo del canal', pack: 'VLOG en Japón', orden: 4, creado: 1700000017000 },
    { id: 'demo-v1', seccion: 'video', titulo: 'VLOG en JAPÓN #1', subtitulo: 'Personal', ruta: 'assets/video/vlog-japon-1.jpg', url: 'https://www.youtube.com/watch?v=3Z7yGwcP_nc&t=163s', destacado: true, orden: 1, creado: 1700000030000 },
    { id: 'demo-v2', seccion: 'video', titulo: 'Proyecto de vídeo de ejemplo', subtitulo: 'Cliente / marca', orden: 2, creado: 1700000005000 },
    { id: 'demo-w1', seccion: 'web', titulo: 'Proyecto web de ejemplo 1', subtitulo: 'Breve descripción del proyecto', etiquetas: ['HTML', 'CSS', 'JS'], orden: 1, creado: 1700000004000 },
    { id: 'demo-w2', seccion: 'web', titulo: 'Proyecto web de ejemplo 2', subtitulo: 'Breve descripción del proyecto', etiquetas: ['HTML', 'CSS', 'JS'], orden: 2, creado: 1700000003000 },
  ];

  // -----------------------------------------------------------
  // Utilidades
  // -----------------------------------------------------------

  /** Convierte un texto en un identificador sin tildes ni espacios: "VLOG en Japón" → "vlog-en-japon". */
  function slug(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /** Garantiza que una pieza (venga de Firestore o del modo demo) tiene todos los campos con el tipo correcto. */
  function normalizePieza(raw) {
    return {
      id: raw.id,
      seccion: SECCIONES.includes(raw.seccion) ? raw.seccion : 'diseno',
      tipo: String(raw.tipo || ''),
      titulo: String(raw.titulo || 'Sin título'),
      subtitulo: String(raw.subtitulo || ''),
      ruta: String(raw.ruta || '').trim(),
      pack: String(raw.pack || '').trim(),
      url: String(raw.url || '').trim(),
      etiquetas: Array.isArray(raw.etiquetas) ? raw.etiquetas.map(String).filter(Boolean) : [],
      destacado: Boolean(raw.destacado),
      visible: raw.visible !== false,
      orden: Number.isFinite(raw.orden) ? raw.orden : 0,
      creado: Number.isFinite(raw.creado) ? raw.creado : 0,
    };
  }

  /** Igual que normalizePieza, pero para un tipo de diseño. */
  function normalizeTipo(raw) {
    const nombre = String(raw.nombre || '').trim() || 'Sin nombre';
    return {
      id: String(raw.id || slug(nombre)),
      nombre,
      aspecto: ASPECTOS.includes(raw.aspecto) ? raw.aspecto : '16:9',
      fondo: FONDOS.includes(raw.fondo) ? raw.fondo : 'oscuro',
    };
  }

  /** Orden de aparición: primero por "orden" (menor antes) y, a igualdad, la más reciente primero. */
  function sortPiezas(piezas) {
    return piezas.slice().sort((a, b) => a.orden - b.orden || b.creado - a.creado);
  }

  // -----------------------------------------------------------
  // Conexión con Firebase
  // -----------------------------------------------------------

  const config = window.FIREBASE_CONFIG || {};
  const isPlaceholder = (value) => !value || /PEGA_AQUI/i.test(value);

  /** true cuando firebase-config.js ya tiene los datos reales del proyecto. */
  function isConfigured() {
    return !isPlaceholder(config.apiKey) && !isPlaceholder(config.projectId);
  }

  /** Inicializa la app de Firebase una sola vez (la usan la web y el panel). */
  function ensureApp() {
    if (!window.firebase) {
      throw new Error('El SDK de Firebase no se ha cargado (¿sin conexión?).');
    }
    if (!firebase.apps.length) firebase.initializeApp(config);
  }

  function getDb() {
    ensureApp();
    return firebase.firestore();
  }

  // -----------------------------------------------------------
  // Carga de datos para la web pública
  // -----------------------------------------------------------

  function readCache() {
    try {
      if (new URLSearchParams(window.location.search).has('fresh')) return null;
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.guardado < CACHE_TTL_MS) return cached.datos;
    } catch (error) { /* sessionStorage no disponible: se ignora la caché */ }
    return null;
  }

  function writeCache(datos) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ guardado: Date.now(), datos }));
    } catch (error) { /* si no se puede guardar, no pasa nada */ }
  }

  async function fetchFromFirestore() {
    const db = getDb();
    // Solo se piden las piezas visibles: coincide con la regla de seguridad
    // que permite la lectura pública únicamente de piezas con visible == true.
    const [piezasSnap, tiposDoc] = await Promise.all([
      db.collection(COLECCION_PIEZAS).where('visible', '==', true).get(),
      db.collection(DOC_TIPOS.coleccion).doc(DOC_TIPOS.id).get(),
    ]);

    const piezas = piezasSnap.docs.map((doc) => normalizePieza({ id: doc.id, ...doc.data() }));
    const tiposGuardados = tiposDoc.exists ? tiposDoc.data().tipos : null;
    const tipos = Array.isArray(tiposGuardados) && tiposGuardados.length
      ? tiposGuardados.map(normalizeTipo)
      : DEFAULT_TIPOS;

    return { piezas: sortPiezas(piezas), tipos };
  }

  let loadPromise = null;

  /** Devuelve { piezas, tipos } para pintar la página. Se calcula una sola vez por carga de página. */
  function loadAll() {
    if (!loadPromise) {
      loadPromise = (async () => {
        if (!isConfigured()) {
          return { piezas: sortPiezas(DEMO_PIEZAS.map(normalizePieza)), tipos: DEFAULT_TIPOS };
        }
        const cached = readCache();
        if (cached) return cached;
        const datos = await fetchFromFirestore();
        writeCache(datos);
        return datos;
      })();
    }
    return loadPromise;
  }

  window.PortfolioData = {
    isDemo: !isConfigured(),
    isConfigured,
    COLECCION_PIEZAS,
    DOC_TIPOS,
    DEFAULT_TIPOS,
    ASPECTOS,
    FONDOS,
    slug,
    normalizePieza,
    normalizeTipo,
    sortPiezas,
    ensureApp,
    getDb,
    loadAll,
  };
})();
