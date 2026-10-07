/**
 * MARTOS DESIGNS — Panel de administración
 * -------------------------------------------------------------
 * Gestiona las piezas del portfolio (colección "piezas" de Firestore)
 * y los tipos de diseño (documento "config/diseno").
 *
 * IMPORTANTE: el panel NO sube archivos. Las imágenes se copian a la
 * carpeta "assets" del sitio y se publican con él; aquí solo se
 * guarda su ruta junto con el título, el tipo, el pack, etc.
 *
 * Qué protege los datos: no este panel, sino las reglas de seguridad
 * de Firestore (firestore.rules). Aunque alguien conociera la
 * dirección de esta página, solo tu cuenta puede escribir.
 *
 * Índice:
 *   1. Utilidades (DOM, rutas, errores, avisos, modales)
 *   2. Acceso (login / logout)
 *   3. Carga de datos
 *   4. Listado: pintado y acciones por fila (editar, ordenar...)
 *   5. Formulario de una pieza
 *   6. Alta de varias piezas de golpe
 *   7. Gestor de tipos de diseño
 *   8. Arranque
 * -------------------------------------------------------------
 */
(function () {
  'use strict';

  const Data = window.PortfolioData;
  const COLECCION = Data.COLECCION_PIEZAS;
  const DOC_TIPOS = Data.DOC_TIPOS;

  const NOMBRE_SECCION = { diseno: 'Diseño', video: 'Vídeo', web: 'Web' };
  const IDS_RESERVADOS = ['todo', 'packs']; // ids de pestaña que un tipo no puede usar

  const state = {
    piezas: [],
    tipos: [],
    seccion: 'diseno',
    tipoFiltro: '',
    editandoId: null,
  };

  let auth = null;
  let db = null;

  // ===========================================================
  // 1. UTILIDADES
  // ===========================================================

  const $ = (id) => document.getElementById(id);

  /** Crea un elemento (versión mínima: class, text, atributos, eventos y hijos). */
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

  /** Limpia una ruta pegada por el usuario: sin espacios en los extremos y con "/" en vez de "\" (Windows). */
  function normalizePath(path) {
    return String(path || '').trim().replace(/\\/g, '/');
  }

  /** Una ruta es válida si es relativa (assets/...) o un enlace http(s); se rechazan javascript:, data:, etc. */
  function isSafePath(path) {
    return !path.includes(':') || /^https?:\/\//i.test(path);
  }

  function isHttpUrl(url) {
    return /^https?:\/\/\S+$/i.test(url);
  }

  /** "assets/logos/logo-01.jpg" → "Logo 01" */
  function titleFromPath(path) {
    const file = path.split('/').pop().replace(/\.[^.]+$/, '');
    const text = file.replace(/[-_]+/g, ' ').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Sin título';
  }

  /** Traduce los códigos de error de Firebase a mensajes comprensibles. */
  function describeError(error) {
    const messages = {
      'permission-denied': 'Firestore ha rechazado la operación: esta cuenta no figura como administradora en las reglas de seguridad (firestore.rules).',
      'unavailable': 'No hay conexión con Firebase. Comprueba tu internet.',
      'auth/invalid-credential': 'Correo o contraseña incorrectos.',
      'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
      'auth/wrong-password': 'Correo o contraseña incorrectos.',
      'auth/user-not-found': 'Correo o contraseña incorrectos.',
      'auth/invalid-email': 'El correo no tiene un formato válido.',
      'auth/user-disabled': 'Esta cuenta está desactivada.',
      'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
      'auth/network-request-failed': 'No hay conexión con Firebase. Comprueba tu internet.',
      'auth/operation-not-allowed': 'El acceso con correo y contraseña no está activado en Firebase (Authentication → Método de acceso).',
    };
    return messages[error && error.code] || (error && error.message) || 'Ha ocurrido un error inesperado.';
  }

  let toastTimer = null;
  function toast(message, kind = 'ok') {
    const node = $('toast');
    node.textContent = message;
    node.className = `toast${kind === 'error' ? ' toast-error' : ''}`;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 3500);
  }

  function showError(id, message) {
    const node = $(id);
    node.textContent = message;
    node.hidden = !message;
  }

  function setBusy(button, busy, busyText = 'Guardando…') {
    if (busy) { button.dataset.label = button.textContent; button.textContent = busyText; }
    else if (button.dataset.label) { button.textContent = button.dataset.label; }
    button.disabled = busy;
  }

  // Ventanas modales: se cierran con "Cancelar", clic fuera o Escape.
  function openModal(id) {
    $(id).hidden = false;
    document.body.classList.add('modal-open');
    const first = $(id).querySelector('input:not([type="checkbox"]), select, textarea');
    if (first) first.focus();
  }

  function closeModal(id) {
    $(id).hidden = true;
    if (!document.querySelector('.modal:not([hidden])')) document.body.classList.remove('modal-open');
  }

  function initModals() {
    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('[data-close]')) closeModal(modal.id);
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      document.querySelectorAll('.modal:not([hidden])').forEach((modal) => closeModal(modal.id));
    });
  }

  function showView(id) {
    ['setup-view', 'login-view', 'app-view'].forEach((view) => { $(view).hidden = view !== id; });
  }

  // ===========================================================
  // 2. ACCESO
  // ===========================================================

  async function handleLogin(event) {
    event.preventDefault();
    showError('login-error', '');
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!email || !password) return showError('login-error', 'Escribe tu correo y tu contraseña.');

    const button = $('login-submit');
    setBusy(button, true, 'Entrando…');
    try {
      await auth.signInWithEmailAndPassword(email, password);
      $('login-password').value = '';
    } catch (error) {
      showError('login-error', describeError(error));
    } finally {
      setBusy(button, false);
    }
  }

  async function onAuthChange(user) {
    if (!user) {
      state.piezas = [];
      showView('login-view');
      return;
    }
    $('user-email').textContent = user.email || '';
    showView('app-view');
    await loadData();
  }

  // ===========================================================
  // 3. CARGA DE DATOS
  // ===========================================================

  /** Rutas de imágenes para el autocompletado (las genera tools/listar-assets.js). */
  async function loadAssetManifest() {
    try {
      const response = await fetch('assets-manifest.json', { cache: 'no-store' });
      if (!response.ok) return;
      const files = await response.json();
      if (!Array.isArray(files)) return;
      $('assets-list').replaceChildren(...files.map((file) => el('option', { value: file })));
    } catch (error) { /* sin manifiesto, el campo sigue funcionando escribiendo la ruta */ }
  }

  async function loadData() {
    showError('load-error', '');
    try {
      const [piezasSnap, tiposDoc] = await Promise.all([
        db.collection(COLECCION).get(),
        db.collection(DOC_TIPOS.coleccion).doc(DOC_TIPOS.id).get(),
      ]);
      state.piezas = piezasSnap.docs.map((doc) => Data.normalizePieza({ id: doc.id, ...doc.data() }));
      const guardados = tiposDoc.exists ? tiposDoc.data().tipos : null;
      state.tipos = (Array.isArray(guardados) && guardados.length ? guardados : Data.DEFAULT_TIPOS).map(Data.normalizeTipo);
    } catch (error) {
      state.piezas = [];
      state.tipos = Data.DEFAULT_TIPOS.map(Data.normalizeTipo);
      showError('load-error', describeError(error));
    }
    refreshAll();
  }

  /** Vuelve a pintar todo lo que depende de las piezas y los tipos. */
  function refreshAll() {
    refreshTipoSelects();
    refreshPackList();
    renderToolbar();
    renderList();
  }

  // ===========================================================
  // 4. LISTADO
  // ===========================================================

  const tipoNombre = (id) => (state.tipos.find((tipo) => tipo.id === id) || {}).nombre || '';

  /** Piezas de la sección (y tipo) que se están viendo, en el mismo orden que la web pública. */
  function currentList() {
    const lista = state.piezas.filter((pieza) =>
      pieza.seccion === state.seccion && (state.seccion !== 'diseno' || !state.tipoFiltro || pieza.tipo === state.tipoFiltro));
    return Data.sortPiezas(lista);
  }

  function renderToolbar() {
    document.querySelectorAll('#seccion-tabs [role="tab"]').forEach((tab) => {
      const seccion = tab.dataset.seccion;
      tab.setAttribute('aria-selected', String(seccion === state.seccion));
      tab.querySelector('.tab-count').textContent = state.piezas.filter((p) => p.seccion === seccion).length;
    });
    const esDiseno = state.seccion === 'diseno';
    $('btn-bulk').hidden = !esDiseno;
    $('btn-tipos').hidden = !esDiseno;
    $('tipo-filter-wrap').hidden = !esDiseno;
  }

  function renderRow(pieza, index, total) {
    const meta = [
      pieza.seccion === 'diseno' && tipoNombre(pieza.tipo) ? el('span', { text: tipoNombre(pieza.tipo) }) : null,
      pieza.pack ? el('span', { class: 'badge', text: `Pack · ${pieza.pack}` }) : null,
      pieza.destacado ? el('span', { class: 'badge badge-accent', text: 'Destacada' }) : null,
      !pieza.visible ? el('span', { class: 'badge', text: 'Oculta' }) : null,
    ];

    const action = (name, label, extraClass = '') =>
      el('button', { type: 'button', class: `btn btn-small ${extraClass}`.trim(), 'data-action': name, text: label });

    const thumb = el('div', { class: 'pieza-thumb' });
    if (pieza.ruta) {
      const img = el('img', { src: pieza.ruta, alt: '', loading: 'lazy' });
      img.addEventListener('error', () => img.remove());
      thumb.append(img);
    }

    const up = action('up', '↑');
    up.setAttribute('aria-label', 'Subir');
    up.disabled = index === 0;
    const down = action('down', '↓');
    down.setAttribute('aria-label', 'Bajar');
    down.disabled = index === total - 1;

    return el('li', { class: `pieza-row${pieza.visible ? '' : ' is-hidden'}`, 'data-id': pieza.id }, [
      thumb,
      el('div', { class: 'pieza-info' }, [
        el('div', { class: 'pieza-titulo', text: pieza.titulo }),
        el('div', { class: 'pieza-meta' }, meta),
      ]),
      el('div', { class: 'pieza-actions' }, [
        up,
        down,
        action('toggle-destacado', pieza.destacado ? 'Quitar destacada' : 'Destacar'),
        action('toggle-visible', pieza.visible ? 'Ocultar' : 'Mostrar'),
        action('edit', 'Editar'),
        action('delete', 'Borrar', 'btn-danger'),
      ]),
    ]);
  }

  function renderList() {
    const piezas = currentList();
    const list = $('piezas-list');
    if (!piezas.length) {
      const aviso = state.seccion === 'diseno' && state.tipoFiltro
        ? 'No hay piezas de este tipo.'
        : `Todavía no hay piezas en ${NOMBRE_SECCION[state.seccion]}. Pulsa "Añadir pieza" para crear la primera.`;
      list.replaceChildren(el('li', { class: 'admin-empty', text: aviso }));
      return;
    }
    list.replaceChildren(...piezas.map((pieza, index) => renderRow(pieza, index, piezas.length)));
  }

  const piezaRef = (id) => db.collection(COLECCION).doc(id);

  /** Guarda cambios sueltos de una pieza y los refleja en pantalla. */
  async function updatePieza(id, changes, okMessage) {
    try {
      await piezaRef(id).update(changes);
      const pieza = state.piezas.find((p) => p.id === id);
      Object.assign(pieza, changes);
      refreshAll();
      if (okMessage) toast(okMessage);
    } catch (error) {
      toast(describeError(error), 'error');
    }
  }

  /** Sube o baja una pieza intercambiando su "orden" con la vecina en la lista que se está viendo. */
  async function movePieza(id, delta) {
    const lista = currentList();
    const i = lista.findIndex((p) => p.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= lista.length) return;
    const a = lista[i];
    const b = lista[j];
    // Si por algún motivo ambas tienen el mismo orden, se separa con un pequeño desplazamiento.
    const nuevoA = a.orden === b.orden ? b.orden + delta * 0.5 : b.orden;
    const nuevoB = a.orden === b.orden ? b.orden : a.orden;
    try {
      const batch = db.batch();
      batch.update(piezaRef(a.id), { orden: nuevoA });
      batch.update(piezaRef(b.id), { orden: nuevoB });
      await batch.commit();
      a.orden = nuevoA;
      b.orden = nuevoB;
      renderList();
    } catch (error) {
      toast(describeError(error), 'error');
    }
  }

  async function deletePieza(id) {
    const pieza = state.piezas.find((p) => p.id === id);
    if (!pieza || !window.confirm(`¿Borrar "${pieza.titulo}"?\n\nEsta acción no se puede deshacer (el archivo de imagen no se toca).`)) return;
    try {
      await piezaRef(id).delete();
      state.piezas = state.piezas.filter((p) => p.id !== id);
      refreshAll();
      toast('Pieza borrada.');
    } catch (error) {
      toast(describeError(error), 'error');
    }
  }

  function handleListClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const id = button.closest('.pieza-row').dataset.id;
    const pieza = state.piezas.find((p) => p.id === id);

    switch (button.dataset.action) {
      case 'up': return movePieza(id, -1);
      case 'down': return movePieza(id, 1);
      case 'edit': return openPiezaForm(pieza);
      case 'delete': return deletePieza(id);
      case 'toggle-visible':
        return updatePieza(id, { visible: !pieza.visible }, pieza.visible ? 'Pieza oculta en la web.' : 'Pieza visible en la web.');
      case 'toggle-destacado':
        return updatePieza(id, { destacado: !pieza.destacado }, pieza.destacado ? 'Ya no es destacada.' : 'Marcada como destacada.');
      default: return undefined;
    }
  }

  function selectSeccion(seccion) {
    state.seccion = seccion;
    state.tipoFiltro = '';
    $('tipo-filter').value = '';
    renderToolbar();
    renderList();
  }

  // ===========================================================
  // 5. FORMULARIO DE UNA PIEZA
  // ===========================================================

  /** Rellena los desplegables de tipo (filtro, formulario y alta múltiple) y conserva lo seleccionado. */
  function refreshTipoSelects() {
    const filtro = $('tipo-filter');
    const filtroActual = state.tipoFiltro;
    filtro.replaceChildren(el('option', { value: '', text: 'Todos los tipos' }), ...state.tipos.map((tipo) => el('option', { value: tipo.id, text: tipo.nombre })));
    filtro.value = state.tipos.some((t) => t.id === filtroActual) ? filtroActual : '';
    state.tipoFiltro = filtro.value;

    ['f-tipo', 'b-tipo'].forEach((id) => {
      const select = $(id);
      const actual = select.value;
      select.replaceChildren(...state.tipos.map((tipo) => el('option', { value: tipo.id, text: tipo.nombre })));
      if (state.tipos.some((t) => t.id === actual)) select.value = actual;
    });
  }

  /** Sugiere los packs que ya existen al escribir el nombre de uno. */
  function refreshPackList() {
    const nombres = [...new Set(state.piezas.map((p) => p.pack).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    $('packs-list').replaceChildren(...nombres.map((nombre) => el('option', { value: nombre })));
  }

  /** Muestra u oculta los campos del formulario según la sección elegida. */
  function updateFormVisibility() {
    const seccion = $('f-seccion').value;
    document.querySelectorAll('#modal-pieza [data-for]').forEach((field) => {
      field.hidden = !field.dataset.for.split(' ').includes(seccion);
    });
    $('f-ruta-label').textContent = {
      diseno: 'Imagen (ruta)',
      video: 'Miniatura del vídeo (ruta)',
      web: 'Captura de la web (ruta)',
    }[seccion];
    $('f-url-label').textContent = seccion === 'video' ? 'Enlace del vídeo (YouTube)' : 'Enlace de la web en vivo (opcional)';
  }

  /** Vista previa de la imagen según la ruta escrita. */
  function updatePreview() {
    const ruta = normalizePath($('f-ruta').value);
    const img = $('f-preview');
    const message = $('f-preview-msg');
    img.hidden = true;
    if (!ruta) { message.textContent = 'Sin imagen'; return; }
    if (!isSafePath(ruta)) { message.textContent = 'Ruta no válida'; return; }
    message.textContent = 'Cargando…';
    img.onload = () => { img.hidden = false; message.textContent = ''; };
    img.onerror = () => { img.hidden = true; message.textContent = 'No se encuentra ese archivo. ¿Está copiado en la carpeta y publicado?'; };
    img.src = ruta;
  }

  function openPiezaForm(pieza = null) {
    state.editandoId = pieza ? pieza.id : null;
    $('modal-pieza-title').textContent = pieza ? 'Editar pieza' : 'Añadir pieza';
    showError('f-error', '');

    $('f-seccion').value = pieza ? pieza.seccion : state.seccion;
    $('f-tipo').value = pieza && pieza.tipo ? pieza.tipo : (state.tipoFiltro || (state.tipos[0] && state.tipos[0].id) || '');
    $('f-titulo').value = pieza ? pieza.titulo : '';
    $('f-subtitulo').value = pieza ? pieza.subtitulo : '';
    $('f-ruta').value = pieza ? pieza.ruta : '';
    $('f-pack').value = pieza ? pieza.pack : '';
    $('f-url').value = pieza ? pieza.url : '';
    $('f-etiquetas').value = pieza ? pieza.etiquetas.join(', ') : '';
    $('f-destacado').checked = pieza ? pieza.destacado : false;
    $('f-visible').checked = pieza ? pieza.visible : true;

    updateFormVisibility();
    updatePreview();
    openModal('modal-pieza');
  }

  /** Lee el formulario y devuelve solo los campos que corresponden a la sección elegida. */
  function readPiezaForm() {
    const seccion = $('f-seccion').value;
    return {
      seccion,
      tipo: seccion === 'diseno' ? $('f-tipo').value : '',
      titulo: $('f-titulo').value.trim(),
      subtitulo: seccion === 'diseno' ? '' : $('f-subtitulo').value.trim(),
      ruta: normalizePath($('f-ruta').value),
      pack: seccion === 'diseno' ? $('f-pack').value.trim() : '',
      url: seccion === 'diseno' ? '' : $('f-url').value.trim(),
      etiquetas: seccion === 'web' ? $('f-etiquetas').value.split(',').map((t) => t.trim()).filter(Boolean) : [],
      destacado: $('f-destacado').checked,
      visible: $('f-visible').checked,
    };
  }

  /** Devuelve el texto del primer problema que encuentre, o '' si todo está bien. */
  function validatePieza(data) {
    if (!data.titulo) return 'Escribe un título.';
    if (data.ruta && !isSafePath(data.ruta)) return 'La ruta de la imagen no es válida: usa una ruta como assets/carpeta/imagen.jpg.';
    if (data.seccion === 'diseno') {
      if (!data.tipo) return 'Elige un tipo (créalo en "Tipos de diseño" si no existe).';
      if (!data.ruta) return 'Indica la ruta de la imagen.';
    }
    if (data.seccion === 'video' && !isHttpUrl(data.url)) return 'Pega el enlace del vídeo (empieza por https://).';
    if (data.seccion === 'web' && data.url && !isHttpUrl(data.url)) return 'El enlace debe empezar por https://';
    return '';
  }

  async function handlePiezaSubmit(event) {
    event.preventDefault();
    const data = readPiezaForm();
    const problem = validatePieza(data);
    if (problem) return showError('f-error', problem);

    const button = $('f-submit');
    setBusy(button, true);
    showError('f-error', '');
    try {
      if (state.editandoId) {
        await piezaRef(state.editandoId).update(data);
        Object.assign(state.piezas.find((p) => p.id === state.editandoId), data);
      } else {
        // Las nuevas piezas se colocan al principio: un orden negativo basado en la hora.
        const extra = { orden: -Date.now(), creado: Date.now() };
        const ref = await db.collection(COLECCION).add({ ...data, ...extra });
        state.piezas.push(Data.normalizePieza({ id: ref.id, ...data, ...extra }));
      }
      // Si la pieza cambió de sección, se sigue la pieza para no "perderla" de vista.
      if (data.seccion !== state.seccion) state.seccion = data.seccion;
      closeModal('modal-pieza');
      refreshAll();
      toast('Pieza guardada.');
    } catch (error) {
      showError('f-error', describeError(error));
    } finally {
      setBusy(button, false);
    }
  }

  // ===========================================================
  // 6. ALTA DE VARIAS PIEZAS DE GOLPE
  // ===========================================================

  function openBulkForm() {
    showError('b-error', '');
    $('b-rutas').value = '';
    $('b-pack').value = '';
    $('b-visible').checked = true;
    $('b-tipo').value = state.tipoFiltro || (state.tipos[0] && state.tipos[0].id) || '';
    openModal('modal-bulk');
  }

  async function handleBulkSubmit(event) {
    event.preventDefault();
    const rutas = $('b-rutas').value.split('\n').map(normalizePath).filter(Boolean);
    const tipo = $('b-tipo').value;
    if (!rutas.length) return showError('b-error', 'Escribe al menos una ruta (una por línea).');
    const invalida = rutas.find((ruta) => !isSafePath(ruta));
    if (invalida) return showError('b-error', `Ruta no válida: ${invalida}`);
    if (!tipo) return showError('b-error', 'Elige un tipo.');

    const button = $('b-submit');
    setBusy(button, true, 'Creando…');
    showError('b-error', '');
    try {
      const base = Date.now();
      const batch = db.batch();
      const creadas = rutas.map((ruta, index) => {
        // Orden consecutivo: la primera línea queda primero y todas antes que lo ya existente.
        const data = {
          seccion: 'diseno', tipo, titulo: titleFromPath(ruta), subtitulo: '', ruta,
          pack: $('b-pack').value.trim(), url: '', etiquetas: [], destacado: false,
          visible: $('b-visible').checked, orden: -base + index, creado: base + index,
        };
        const ref = db.collection(COLECCION).doc();
        batch.set(ref, data);
        return Data.normalizePieza({ id: ref.id, ...data });
      });
      await batch.commit();
      state.piezas.push(...creadas);
      state.seccion = 'diseno';
      closeModal('modal-bulk');
      refreshAll();
      toast(`${creadas.length} ${creadas.length === 1 ? 'pieza creada' : 'piezas creadas'}.`);
    } catch (error) {
      showError('b-error', describeError(error));
    } finally {
      setBusy(button, false);
    }
  }

  // ===========================================================
  // 7. GESTOR DE TIPOS DE DISEÑO
  // ===========================================================

  function tipoRow(tipo = { id: '', nombre: '', aspecto: '16:9', fondo: 'oscuro' }) {
    const select = (className, values, current) =>
      el('select', { class: className }, values.map(([value, label]) => el('option', { value, text: label, selected: value === current })));

    const row = el('li', { class: 'tipo-row', 'data-id': tipo.id }, [
      el('input', { type: 'text', class: 'tipo-nombre', value: tipo.nombre, maxlength: 40, placeholder: 'Nombre (ej. Banners)', 'aria-label': 'Nombre del tipo' }),
      select('tipo-aspecto', [['16:9', 'Panorámica 16:9'], ['1:1', 'Cuadrada 1:1']], tipo.aspecto),
      select('tipo-fondo', [['oscuro', 'Fondo oscuro'], ['claro', 'Fondo claro']], tipo.fondo),
      el('button', {
        type: 'button', class: 'btn btn-small btn-danger', text: 'Quitar',
        onclick: () => {
          const usadas = tipo.id ? state.piezas.filter((p) => p.tipo === tipo.id).length : 0;
          const aviso = `Hay ${usadas} ${usadas === 1 ? 'pieza' : 'piezas'} de este tipo: seguirán existiendo, pero sin pestaña propia (solo en "Todo"). ¿Quitarlo igualmente?`;
          if (usadas && !window.confirm(aviso)) return;
          row.remove();
        },
      }),
    ]);
    return row;
  }

  function openTiposForm() {
    showError('t-error', '');
    $('tipos-list').replaceChildren(...state.tipos.map((tipo) => tipoRow(tipo)));
    openModal('modal-tipos');
  }

  async function handleTiposSubmit(event) {
    event.preventDefault();
    const rows = [...document.querySelectorAll('#tipos-list .tipo-row')];
    const usados = new Set(rows.map((row) => row.dataset.id).filter(Boolean));
    const tipos = [];

    for (const row of rows) {
      const nombre = row.querySelector('.tipo-nombre').value.trim();
      if (!nombre) return showError('t-error', 'Todos los tipos necesitan un nombre (o quita la fila vacía).');

      let id = row.dataset.id;
      if (!id) {
        // Tipo nuevo: su id sale del nombre y se asegura que no choque con otro ni con las pestañas fijas.
        const base = Data.slug(nombre) || 'tipo';
        id = base;
        for (let n = 2; usados.has(id) || IDS_RESERVADOS.includes(id); n += 1) id = `${base}-${n}`;
        usados.add(id);
      }
      tipos.push({ id, nombre, aspecto: row.querySelector('.tipo-aspecto').value, fondo: row.querySelector('.tipo-fondo').value });
    }
    if (!tipos.length) return showError('t-error', 'Debe haber al menos un tipo.');

    const button = $('t-submit');
    setBusy(button, true);
    showError('t-error', '');
    try {
      await db.collection(DOC_TIPOS.coleccion).doc(DOC_TIPOS.id).set({ tipos });
      state.tipos = tipos.map(Data.normalizeTipo);
      closeModal('modal-tipos');
      refreshAll();
      toast('Tipos guardados.');
    } catch (error) {
      showError('t-error', describeError(error));
    } finally {
      setBusy(button, false);
    }
  }

  // ===========================================================
  // 8. ARRANQUE
  // ===========================================================

  function bindEvents() {
    $('login-form').addEventListener('submit', handleLogin);
    $('btn-logout').addEventListener('click', () => auth.signOut());

    $('seccion-tabs').addEventListener('click', (event) => {
      const tab = event.target.closest('[data-seccion]');
      if (tab) selectSeccion(tab.dataset.seccion);
    });
    $('tipo-filter').addEventListener('change', (event) => {
      state.tipoFiltro = event.target.value;
      renderList();
    });
    $('piezas-list').addEventListener('click', handleListClick);

    $('btn-add').addEventListener('click', () => openPiezaForm());
    $('btn-bulk').addEventListener('click', openBulkForm);
    $('btn-tipos').addEventListener('click', openTiposForm);
    $('btn-add-tipo').addEventListener('click', () => {
      const row = tipoRow();
      $('tipos-list').append(row);
      row.querySelector('.tipo-nombre').focus();
    });

    $('f-seccion').addEventListener('change', updateFormVisibility);
    $('f-ruta').addEventListener('input', updatePreview);
    $('pieza-form').addEventListener('submit', handlePiezaSubmit);
    $('bulk-form').addEventListener('submit', handleBulkSubmit);
    $('tipos-form').addEventListener('submit', handleTiposSubmit);

    initModals();
  }

  function boot() {
    bindEvents();

    if (window.location.protocol === 'file:') $('file-warning').hidden = false;

    if (!Data.isConfigured()) {
      showView('setup-view');
      return;
    }

    try {
      Data.ensureApp();
      db = Data.getDb();
      auth = firebase.auth();
    } catch (error) {
      $('setup-detail').textContent = error.message;
      showView('setup-view');
      return;
    }

    loadAssetManifest();
    auth.onAuthStateChanged(onAuthChange);
  }

  boot();
})();
