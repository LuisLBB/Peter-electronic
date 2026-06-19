// ============================================================
//  PETER ELECTRONIC - Lógica del Frontend (cliente)
//  Se comunica con el backend (Node/Express) vía la API REST.
// ============================================================

// ---- REFERENCIAS A ELEMENTOS DEL DOM (login, navegación) ----
const loginOverlay = document.getElementById("loginOverlay");
const appShell = document.getElementById("app");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");

const navLinks = document.querySelectorAll(".nav-link");
const views = document.querySelectorAll(".view");
const logoutBtn = document.getElementById("logoutBtn");

const statSales = document.getElementById("statSales");
const statStock = document.getElementById("statStock");
const statRevenue = document.getElementById("statRevenue");
const dashboardExchangeRate = document.getElementById("dashboardExchangeRate");
const inventoryGrid = document.getElementById("inventoryGrid");

const detailModal = document.getElementById("detailModal");
const modalBody = document.getElementById("modalBody");
const modalTitle = document.getElementById("modalTitle");
const closeModalBtn = document.getElementById("closeModalBtn");
const sellMessage = document.getElementById("sellMessage");
const cartPreviewPanel = document.getElementById("cartPreviewPanel");
const cartPreviewList = document.getElementById("cartPreviewList");
const btnAddToCart = document.getElementById("btnAddToCart");
const modalActionContainer = document.getElementById("modalActionContainer");

const openAddModalBtn = document.getElementById("openAddModalBtn");
const closeAddModalBtn = document.getElementById("closeAddModalBtn");
const addModal = document.getElementById("addModal");
const addProductForm = document.getElementById("addProductForm");
const addProductMessage = document.getElementById("addProductMessage");

const selectExistente = document.getElementById("selectExistente");
const wrapperNombreModelo = document.getElementById("wrapperNombreModelo");
const wrapperStorage = document.getElementById("wrapperStorage");
const wrapperRam = document.getElementById("wrapperRam");
const specsEspecificasContainer = document.getElementById("specsEspecificasContainer");

const btnProcessBulkSale = document.getElementById("btnProcessBulkSale");
const cartCount = document.getElementById("cartCount");
const salesListContainer = document.getElementById("salesListContainer");

const userForm = document.getElementById("userForm");
const usersList = document.getElementById("usersList");
const userMessage = document.getElementById("userMessage");

const historyTableBody = document.getElementById("historyTableBody");

const globalExchangeInput = document.getElementById("globalExchangeInput");
const btnSaveExchange = document.getElementById("btnSaveExchange");
const prodPriceUSD = document.getElementById("prodPriceUSD");
const prodPriceBOB = document.getElementById("prodPriceBOB");

const searchInventoryInput = document.getElementById("searchInventoryInput");
const searchSalesInput = document.getElementById("searchSalesInput");
// ---- CONFIGURACIÓN GLOBAL Y ESTADO DE LA APLICACIÓN ----
// URL base del backend desplegado en Render. Todas las peticiones parten de aquí.
const API_BASE_URL = "https://peter-electronic-backend.onrender.com/api";

// Variables de estado: guardan datos en memoria mientras se usa la app
let currentActiveGroupKey = null;   // modelo abierto actualmente en el modal
let currentMaxAvailable = 0;        // stock disponible del modelo abierto
let globalCart = [];                // carrito de venta (IMEIs seleccionados)
let currentGlobalExchangeRate = 6.96; // tipo de cambio USD->BOB en uso

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const currencyFormatter = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "BOB",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0
});

// ============================================================
//  TIPO DE CAMBIO (conversión USD -> Bolivianos)
// ============================================================

// Redondea el precio en bolivianos al múltiplo de 5 más cercano hacia abajo
function redondearCostoComercial(valorDolares, tipoCambio) {
  const exactBOB = valorDolares * tipoCambio;
  return Math.floor(exactBOB / 5) * 5;
}

function calcularPrecioFormulario() {
  if (!prodPriceUSD || !prodPriceBOB) return;
  const usd = parseFloat(prodPriceUSD.value) || 0;
  if (usd === 0) {
    prodPriceBOB.value = "Bs. 0";
    return;
  }
  const finalBOB = redondearCostoComercial(usd, currentGlobalExchangeRate);
  prodPriceBOB.value = currencyFormatter.format(finalBOB);
}

if (prodPriceUSD) {
  prodPriceUSD.addEventListener("input", calcularPrecioFormulario);
}

// Pide al backend el tipo de cambio actual (GET) y lo aplica en pantalla
async function fetchAndApplyExchangeRate() {
  try {
    const response = await fetch(`${API_BASE_URL}/exchange-rate`);
    const data = await response.json();
    currentGlobalExchangeRate = data.exchangeRate;
    
    if (globalExchangeInput) globalExchangeInput.value = currentGlobalExchangeRate;
    if (dashboardExchangeRate) dashboardExchangeRate.textContent = `Bs. ${currentGlobalExchangeRate}`;
  } catch (error) {
    console.error(error);
  }
}

if (btnSaveExchange) {
  btnSaveExchange.addEventListener("click", async () => {
    if (!globalExchangeInput) return;
    const newRate = parseFloat(globalExchangeInput.value) || 6.96;
    try {
      const response = await fetch(`${API_BASE_URL}/exchange-rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: newRate })
      });
      const data = await response.json();
      if (data.success) {
        currentGlobalExchangeRate = newRate;
        if (dashboardExchangeRate) dashboardExchangeRate.textContent = `Bs. ${newRate}`;
        calcularPrecioFormulario();
        await renderInventory();
        await renderDashboard();
        
        if (currentActiveGroupKey) {
          await openProductModalByGroup(currentActiveGroupKey);
        }
      }
    } catch (error) {
      alert("Error al conectar con el servidor.");
    }
  });
}

// ============================================================
//  NAVEGACIÓN ENTRE VISTAS (inicio, inventario, ventas, etc.)
// ============================================================

// Muestra la vista pedida y oculta las demás
function showView(viewId) {
  views.forEach((view) => {
    view.classList.toggle("is-visible", view.id === viewId);
  });
  navLinks.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === viewId);
  });
  if (viewId === "historial") {
    renderHistoryTable();
  }
  if (viewId === "ventasRegistradas") {
    renderSalesHistoryView();
  }
}

// ============================================================
//  HISTORIAL DE MOVIMIENTOS (auditoría de ingresos y ventas)
// ============================================================

// Pide el historial al backend (GET) y lo pinta como tabla con colores por tipo
async function renderHistoryTable() {
  if (!historyTableBody) return;
  try {
    const response = await fetch(`${API_BASE_URL}/history`);
    const historyData = await response.json();

    if (historyData.length === 0) {
      historyTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 15px;">No hay movimientos registrados aún.</td></tr>`;
      return;
    }

    historyTableBody.innerHTML = historyData
      .map((log, index) => {
        const esVenta = (log.operation || "").toLowerCase().includes("venta");
        // Colores de la paleta del sistema: teal para ingresos, rojo para ventas
        const acento = esVenta ? "#ef233c" : "#2a9d8f";
        const fondoBadge = esVenta ? "rgba(239,35,60,0.12)" : "rgba(42,157,143,0.12)";
        const icono = esVenta ? "↑" : "↓";
        const filaFondo = index % 2 === 0 ? "transparent" : "rgba(255,255,255,0.03)";

        return `
          <tr style="border-bottom: 1px solid var(--gray-200); background:${filaFondo}; border-left:4px solid ${acento};">
            <td style="padding: 12px; font-size:0.88rem; color:var(--gray-700);">${log.datetime}</td>
            <td style="padding: 12px;">
              <span style="display:inline-flex; align-items:center; gap:6px; background:${fondoBadge}; color:${acento}; font-weight:700; font-size:0.8rem; padding:4px 10px; border-radius:20px; white-space:nowrap;">
                ${icono} ${log.operation}
              </span>
            </td>
            <td style="padding: 12px; font-weight: 600;">${log.productName}</td>
            <td style="padding: 12px; font-family: monospace; font-size:0.85rem; color:var(--gray-700);">${log.quantity}</td>
            <td style="padding: 12px;">${log.responsible}</td>
          </tr>
        `;
      })
      .join("");
  } catch (error) {
    console.error(error);
  }
}

// Estado del calendario del dashboard
// ============================================================
//  RESUMEN EJECUTIVO: DASHBOARD + CALENDARIO POR DÍA
// ============================================================

let fechaSeleccionada = "";   // "YYYY-MM-DD" actualmente elegida
let hoyBO = "";               // fecha de hoy según Bolivia (tope máximo)
let calVisibleYear = 0;       // año del mes mostrado en la cuadrícula
let calVisibleMonth = 0;      // mes (0-11) mostrado en la cuadrícula

// Pide al backend las estadísticas del día seleccionado y actualiza las tarjetas
async function renderDashboard() {
  try {
    const url = fechaSeleccionada
      ? `${API_BASE_URL}/dashboard-stats?date=${fechaSeleccionada}`
      : `${API_BASE_URL}/dashboard-stats`;
    const response = await fetch(url);
    const stats = await response.json();
    if (statSales) statSales.textContent = stats.sales;
    if (statStock) statStock.textContent = stats.stock;
    if (statRevenue) statRevenue.textContent = currencyFormatter.format(stats.revenue);
  } catch (error) {
    console.error(error);
  }
}

async function initDashboardCalendar() {
  const calGrid = document.getElementById("calGrid");
  if (!calGrid) return;
  try {
    const response = await fetch(`${API_BASE_URL}/sales-dates`);
    const data = await response.json();
    hoyBO = data.today;
  } catch (error) {
    // Respaldo: calcular hoy en el cliente si el servidor no responde
    hoyBO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  fechaSeleccionada = hoyBO;
  const [anio, mes] = hoyBO.split("-").map(Number);
  calVisibleYear = anio;
  calVisibleMonth = mes - 1;
  renderCalendar();
}

function renderCalendar() {
  const calGrid = document.getElementById("calGrid");
  const calMonthLabel = document.getElementById("calMonthLabel");
  if (!calGrid) return;

  const nombresMes = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  if (calMonthLabel) calMonthLabel.textContent = `${nombresMes[calVisibleMonth]} ${calVisibleYear}`;

  const diasSemana = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
  let html = diasSemana
    .map(d => `<div style="text-align:center; font-size:0.7rem; font-weight:700; color:var(--gray-500); padding:4px 0;">${d}</div>`)
    .join("");

  const primerDia = new Date(calVisibleYear, calVisibleMonth, 1);
  // getDay(): 0=domingo..6=sábado. Lo convertimos a lunes=0..domingo=6
  let offset = primerDia.getDay() - 1;
  if (offset < 0) offset = 6;

  const diasEnMes = new Date(calVisibleYear, calVisibleMonth + 1, 0).getDate();

  // Celdas vacías antes del día 1
  for (let i = 0; i < offset; i++) {
    html += `<div></div>`;
  }

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const mm = String(calVisibleMonth + 1).padStart(2, "0");
    const dd = String(dia).padStart(2, "0");
    const fechaStr = `${calVisibleYear}-${mm}-${dd}`;

    const esFuturo = fechaStr > hoyBO;
    const esSeleccionado = fechaStr === fechaSeleccionada;
    const esHoy = fechaStr === hoyBO;

    let estilo = "text-align:center; padding:8px 0; border-radius:6px; font-size:0.85rem; font-weight:600;";
    if (esFuturo) {
      estilo += " color:var(--gray-300); cursor:not-allowed; background:transparent;";
    } else if (esSeleccionado) {
      estilo += " background:linear-gradient(145deg, var(--red), var(--red-dark)); color:white; cursor:pointer; box-shadow:0 0 10px rgba(255,42,61,0.4);";
    } else {
      estilo += " color:var(--gray-900); cursor:pointer; background:rgba(255,42,61,0.08);";
      if (esHoy) estilo += " border:1px solid var(--red);";
    }

    const attr = esFuturo ? "" : `data-cal-day="${fechaStr}"`;
    html += `<div ${attr} style="${estilo}">${dia}</div>`;
  }

  calGrid.innerHTML = html;
}

(function bindCalendarControls() {
  const calPrev = document.getElementById("calPrevMonth");
  const calNext = document.getElementById("calNextMonth");
  const calGrid = document.getElementById("calGrid");

  if (calPrev) {
    calPrev.addEventListener("click", () => {
      calVisibleMonth--;
      if (calVisibleMonth < 0) { calVisibleMonth = 11; calVisibleYear--; }
      renderCalendar();
    });
  }

  if (calNext) {
    calNext.addEventListener("click", () => {
      // No permitir navegar más allá del mes actual
      const [anioHoy, mesHoy] = hoyBO.split("-").map(Number);
      const yaEnMesActual = (calVisibleYear === anioHoy && calVisibleMonth === mesHoy - 1);
      if (yaEnMesActual) return;
      calVisibleMonth++;
      if (calVisibleMonth > 11) { calVisibleMonth = 0; calVisibleYear++; }
      renderCalendar();
    });
  }

  if (calGrid) {
    calGrid.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const fecha = target.getAttribute("data-cal-day");
      if (!fecha) return;
      fechaSeleccionada = fecha;
      renderCalendar();
      renderDashboard();
    });
  }
})();

// ============================================================
//  INVENTARIO (catálogo de modelos agrupados por IMEI)
// ============================================================

// Pide el inventario al backend, agrupa los IMEIs por modelo y pinta las tarjetas
async function renderInventory() {
  if (!inventoryGrid) return;
  try {
    const response = await fetch(`${API_BASE_URL}/inventory`);
    const inventory = await response.json();

    if (inventory.length === 0) {
      inventoryGrid.innerHTML = `<p style="padding:20px; grid-column: 1/-1; text-align:center;">No hay terminales móviles ingresadas in stock.</p>`;
      return;
    }

    const filterText = searchInventoryInput ? searchInventoryInput.value.trim().toLowerCase() : "";
    const grouped = {};
    
    inventory.forEach(item => {
      if (filterText && !item.name.toLowerCase().includes(filterText)) {
        return; 
      }

      const key = `${item.name}|${item.almacenamiento}|${item.ram}`;
      if (!grouped[key]) {
        const originalUSD = item.priceUSD || (item.price / (item.exchangeRate || 6.96));
        const liveBOB = Math.floor((originalUSD * currentGlobalExchangeRate) / 5) * 5;

        grouped[key] = {
          name: item.name,
          colors: [],
          almacenamiento: item.almacenamiento,
          ram: item.ram,
          price: liveBOB,
          priceUSD: originalUSD,
          specs: item.specs,
          totalStock: 0,
          imeisDisponibles: []
        };
      }
      if (item.status === "Disponible") {
        grouped[key].totalStock += 1;
        grouped[key].imeisDisponibles.push({ imei: item.imei, color: item.color });
        if (!grouped[key].colors.includes(item.color)) {
          grouped[key].colors.push(item.color);
        }
      }
    });

    const entries = Object.entries(grouped);
    if (entries.length === 0) {
      inventoryGrid.innerHTML = `<p style="padding:20px; grid-column: 1/-1; text-align:center;">No existen modelos que coincidan con la búsqueda.</p>`;
      return;
    }

    // Orden alfabético por nombre de modelo (ignorando mayúsculas y acentos)
    entries.sort((a, b) => a[1].name.localeCompare(b[1].name, "es", { sensitivity: "base" }));

    inventoryGrid.innerHTML = entries
      .map(([unusedKey, group]) => {
        const outOfStock = group.totalStock === 0;
        const modelKey = `${group.name}|${group.almacenamiento}|${group.ram}`;
        return `
          <article class="product-card" style="border-left: 4px solid ${outOfStock ? "#ef233c" : "#2a9d8f"}">
            <h4>${group.name}</h4>
            <p style="margin: 4px 0; font-size: 0.9rem;"><strong>Colores:</strong> ${group.colors.join(", ") || "Ninguno disponible"}</p>
            <p style="margin: 2px 0; font-size: 0.9rem;"><strong>Capacidad:</strong> ${group.almacenamiento} / ${group.ram}</p>
            <p class="product-meta" style="margin-top:6px; font-size:1.05rem;">
              <strong style="color:#2a9d8f;">${currencyFormatter.format(group.price)}</strong> 
              <span style="color:var(--gray-500); font-size:0.85rem;">/ ${usdFormatter.format(group.priceUSD)} USD</span>
            </p>
            <p style="margin: 8px 0; font-weight:700; color: ${outOfStock ? "#ef233c" : "#2a9d8f"}">
              ${outOfStock ? "SIN STOCK" : `Stock disponible: ${group.totalStock} uds`}
            </p>
            <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
              <button class="btn btn-primary" style="padding: 6px 12px; font-size:0.85rem;" data-group-key="${modelKey}">Ver Ficha Técnica</button>
              <button class="btn" style="padding: 6px 12px; font-size:0.85rem; background:#ef233c; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:700;" data-delete-model="${modelKey}">Eliminar</button>
            </div>
          </article>
        `;
      })
      .join("");
  } catch (error) {
    console.error(error);
  }
}

if (searchInventoryInput) {
  searchInventoryInput.addEventListener("input", renderInventory);
}

// ---- AUTOCOMPLETADO: búsqueda de modelos al ingresar stock ----
let modelosDisponiblesCache = [];

// Carga la lista de modelos existentes (ordenados) para el buscador
async function populateModelsSelector() {
  if (!selectExistente) return;
  try {
    const response = await fetch(`${API_BASE_URL}/inventory`);
    const inventory = await response.json();

    const uniqueKeys = new Set();
    const modelos = [];
    inventory.forEach(item => {
      const key = `${item.name}|${item.almacenamiento}|${item.ram}`;
      if (!uniqueKeys.has(key)) {
        uniqueKeys.add(key);
        modelos.push({
          value: key,
          label: `${item.name} (${item.almacenamiento} / ${item.ram})`
        });
      }
    });

    // Orden alfabético por nombre del modelo (sin distinguir mayúsculas/acentos)
    modelos.sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
    modelosDisponiblesCache = modelos;

    // Poblar el select oculto: es la "fuente de verdad" que lee el formulario al enviar
    selectExistente.innerHTML = `<option value="NUEVO">-- No, es un modelo NUEVO (Digitar todo) --</option>`;
    modelos.forEach(m => {
      const option = document.createElement("option");
      option.value = m.value;
      option.textContent = m.label;
      selectExistente.appendChild(option);
    });
  } catch (error) {
    console.error(error);
  }
}

const searchModelInput = document.getElementById("searchModelInput");
const modelResultsList = document.getElementById("modelResultsList");
const modelSeleccionadoLabel = document.getElementById("modelSeleccionadoLabel");

function renderModelResults(filtro) {
  if (!modelResultsList) return;
  const texto = filtro.trim().toLowerCase();

  if (!texto) {
    modelResultsList.innerHTML = "";
    return;
  }

  const coincidencias = modelosDisponiblesCache.filter(m => m.label.toLowerCase().includes(texto));

  if (coincidencias.length === 0) {
    modelResultsList.innerHTML = `
      <div style="padding:14px; text-align:center;">
        <p style="color:#ef233c; font-weight:700; font-size:0.9rem; margin-bottom:10px;">No existe ningún modelo con ese nombre.</p>
        <button type="button" id="btnRegistrarNuevo" style="width:100%; padding:10px; border-radius:6px; border:1px dashed var(--red); background:rgba(255,42,61,0.1); color:var(--red-neon); font-weight:700; cursor:pointer; font-size:0.85rem;">
          + Registrar "${filtro.trim()}" como modelo NUEVO
        </button>
      </div>`;
    return;
  }

  modelResultsList.innerHTML = `<div style="border:1px solid var(--gray-200); border-radius:6px; overflow:hidden;">` + coincidencias
    .map(m => `<div class="model-suggestion" data-value="${m.value}" data-label="${m.label}"
        style="padding:11px 12px; cursor:pointer; font-size:0.9rem; border-bottom:1px solid var(--gray-100); font-weight:600;">${m.label}</div>`)
    .join("") + `</div>`;
}

function seleccionarModelo(value, label) {
  if (!selectExistente) return;
  // Alimentar el select oculto y disparar su lógica de relleno de specs
  selectExistente.value = value;
  selectExistente.dispatchEvent(new Event("change"));

  if (searchModelInput) searchModelInput.value = "";
  if (modelResultsList) renderModelResults("");

  if (modelSeleccionadoLabel) {
    modelSeleccionadoLabel.style.display = "block";
    if (value === "NUEVO") {
      modelSeleccionadoLabel.textContent = "✏️ Modelo nuevo: ingresa todos los datos abajo.";
    } else {
      modelSeleccionadoLabel.textContent = `✓ Modelo seleccionado: ${label}`;
    }
  }
}

if (searchModelInput) {
  searchModelInput.addEventListener("input", () => {
    renderModelResults(searchModelInput.value);
  });
}

if (modelResultsList) {
  modelResultsList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.id === "btnRegistrarNuevo") {
      seleccionarModelo("NUEVO", "");
      return;
    }

    const opcion = target.closest(".model-suggestion");
    if (!opcion) return;
    seleccionarModelo(opcion.getAttribute("data-value"), opcion.getAttribute("data-label"));
  });
}

if (selectExistente) {
  selectExistente.addEventListener("change", async () => {
    const isExisting = selectExistente.value !== "NUEVO";
    
    if (isExisting) {
      if (wrapperNombreModelo) wrapperNombreModelo.style.display = "none";
      if (wrapperStorage) wrapperStorage.style.display = "none";
      if (wrapperRam) wrapperRam.style.display = "none";
      if (specsEspecificasContainer) specsEspecificasContainer.style.display = "none";
      
      const prodNameOpt = document.getElementById("prodName");
      const prodStorageOpt = document.getElementById("prodStorage");
      const prodRamOpt = document.getElementById("prodRam");
      
      if (prodNameOpt) prodNameOpt.required = false;
      if (prodStorageOpt) prodStorageOpt.required = false;
      if (prodRamOpt) prodRamOpt.required = false;

      try {
        const response = await fetch(`${API_BASE_URL}/inventory`);
        const inventory = await response.json();
        const referenceItem = inventory.find(item => `${item.name}|${item.almacenamiento}|${item.ram}` === selectExistente.value);
        if (referenceItem && prodPriceUSD) {
          prodPriceUSD.value = referenceItem.priceUSD || (referenceItem.price / (referenceItem.exchangeRate || 6.96)).toFixed(2);
          calcularPrecioFormulario();
        }
      } catch (error) {
        console.error(error);
      }

    } else {
      if (wrapperNombreModelo) wrapperNombreModelo.style.display = "block";
      if (wrapperStorage) wrapperStorage.style.display = "block";
      if (wrapperRam) wrapperRam.style.display = "block";
      if (specsEspecificasContainer) specsEspecificasContainer.style.display = "block";
      
      const prodNameOpt = document.getElementById("prodName");
      const prodStorageOpt = document.getElementById("prodStorage");
      const prodRamOpt = document.getElementById("prodRam");

      if (prodNameOpt) prodNameOpt.required = true;
      if (prodStorageOpt) prodStorageOpt.required = true;
      if (prodRamOpt) prodRamOpt.required = true;
      
      if (prodPriceUSD) prodPriceUSD.value = "";
      if (prodPriceBOB) prodPriceBOB.value = "Bs. 0";
    }
  });
}

// ============================================================
//  REGISTRO DE VENTAS (lista de ventas consolidadas)
// ============================================================

// Pide las ventas al backend, las ordena de la más reciente a la más antigua y las pinta
async function renderSalesHistoryView() {
  if (!salesListContainer) return;
  try {
    const response = await fetch(`${API_BASE_URL}/sales`);
    const salesData = await response.json();

    if (salesData.length === 0) {
      salesListContainer.innerHTML = `<p style="text-align:center; padding:20px; background:var(--bg-elev-2); border-radius:8px;">No existen registros de ventas consolidadas.</p>`;
      return;
    }

    const filterText = searchSalesInput ? searchSalesInput.value.trim().toLowerCase() : "";

    const filteredSales = salesData
      .filter(sale => {
        if (!filterText) return true;
        return sale.products.some(p => p.name.toLowerCase().includes(filterText));
      })
      .sort((a, b) => b.id - a.id); // Más reciente primero

    if (filteredSales.length === 0) {
      salesListContainer.innerHTML = `<p style="text-align:center; padding:20px; background:var(--bg-elev-2); border-radius:8px;">Ningún registro de venta coincide con el modelo buscado.</p>`;
      return;
    }

    salesListContainer.innerHTML = filteredSales
      .map((sale) => {
        const productsHTML = sale.products
          .map(p => `
            <div style="padding: 8px; background: rgba(255,255,255,0.04); border-radius: 6px; display: flex; flex-wrap: wrap; justify-content: space-between; font-size: 0.9rem; border-left: 3px solid var(--red); color: var(--gray-700);">
              <div><strong style="color: var(--gray-900);">${p.name}</strong> (${p.color}) - <span style="font-family: monospace;">Nro/ID: ${p.imei}</span></div>
              <div>Var: ${p.almacenamiento} / ${p.ram} | <strong style="color:var(--red-neon);">${currencyFormatter.format(p.price)}</strong></div>
            </div>
          `).join("");

        return `
          <div style="background: var(--bg-elev-2); padding: 18px; border-radius: var(--radius-md); box-shadow: var(--soft-shadow); border: 1px solid var(--border-line);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px dashed var(--gray-200); padding-bottom: 8px;">
              <div>
                <span style="background: linear-gradient(145deg, var(--red), var(--red-dark)); color: var(--white); padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 0.85rem;">REGISTRO # ${sale.id}</span>
                <span style="margin-left: 10px; font-size: 0.9rem; color: var(--gray-500);">${sale.datetime}</span>
              </div>
              <div style="font-size: 1.1rem; font-weight: 700; color: var(--gray-900);">Total: <span style="color:var(--red-neon);">${currencyFormatter.format(sale.totalPrice)}</span></div>
            </div>
            <div style="font-size:0.9rem; margin-bottom:8px; color: var(--gray-700);"><strong style="color: var(--gray-900);">Responsable de Operación:</strong> ${sale.seller}</div>
            <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px;">
              <div style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gray-500); font-weight:700;">Artículos incluidos en el Registro:</div>
              ${productsHTML}
            </div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    console.error(error);
  }
}

if (searchSalesInput) {
  searchSalesInput.addEventListener("input", renderSalesHistoryView);
}

// ============================================================
//  CARRITO DE VENTA GLOBAL (IMEIs seleccionados a vender)
// ============================================================

// Actualiza el contador del carrito y refresca la vista previa
function updateCartButtonUI() {
  const totalUnits = globalCart.reduce((sum, item) => sum + item.qty, 0);
  if (cartCount) cartCount.textContent = totalUnits;
  renderCartPreview();
}

function renderCartPreview() {
  if (!cartPreviewPanel || !cartPreviewList) return;

  if (globalCart.length === 0) {
    cartPreviewPanel.style.display = "none";
    cartPreviewList.innerHTML = "";
    return;
  }

  cartPreviewPanel.style.display = "block";
  cartPreviewList.innerHTML = globalCart
    .map(item => {
      const partes = (item.groupKey || "").split("|");
      const almacenamiento = partes[1] || "";
      const ram = partes[2] || "";
      const specs = [almacenamiento, ram].filter(Boolean).join(" · ");
      return `
      <span style="display:inline-flex; align-items:center; gap:8px; background:#ffffff; color:#1b4965; border-radius:20px; padding:5px 8px 5px 12px; font-size:0.8rem; font-family:monospace; font-weight:700; box-shadow:0 2px 6px rgba(0,0,0,0.15);">
        ${item.name} (${item.color})${specs ? ` · ${specs}` : ""} — ${item.imeiElegido}
        <button type="button" data-remove-imei="${item.imeiElegido}" title="Quitar del carrito" style="background:#ef233c; color:white; border:none; border-radius:50%; width:18px; height:18px; font-weight:700; cursor:pointer; padding:0; line-height:1; font-size:0.75rem; display:flex; align-items:center; justify-content:center;">×</button>
      </span>
    `;
    })
    .join("");
}

if (cartPreviewList) {
  cartPreviewList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches("[data-remove-imei]")) {
      const imeiToRemove = target.getAttribute("data-remove-imei");
      globalCart = globalCart.filter(item => item.imeiElegido !== imeiToRemove);
      updateCartButtonUI();
    }
  });
}

if (btnProcessBulkSale) {
  btnProcessBulkSale.addEventListener("click", async () => {
    if (globalCart.length === 0) {
      alert("El carrito global está vacío. Añade cantidades desde la Ficha Técnica de los modelos.");
      return;
    }

    const summaryText = globalCart.map(i => `- ${i.name}: ${i.qty} unidad(es)`).join("\n");
    if (!confirm(`¿Deseas liquidar el registro de venta con los siguientes modelos?\n\n${summaryText}`)) {
      return;
    }

    const seller = sessionStorage.getItem("sellerName") || "Admin";

    try {
      const response = await fetch(`${API_BASE_URL}/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartItems: globalCart, seller })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(data.message);
        globalCart = [];
        updateCartButtonUI();
        await renderInventory();
        await renderDashboard();
        return;
      }
      alert(data.message || "Ocurrió un error al procesar el lote.");
    } catch (error) {
      alert("Error de conexión con el servidor.");
    }
  });
}

// ---- MODAL DE FICHA TÉCNICA / VENTA DE UN MODELO ----
// Abre el modal con los datos del modelo y su lista de IMEIs disponibles
async function openProductModalByGroup(groupKey) {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory`);
    const inventory = await response.json();

    const matchingUnits = inventory.filter(item => `${item.name}|${item.almacenamiento}|${item.ram}` === groupKey);

    if (matchingUnits.length === 0) return;

    const baseItem = matchingUnits[0];
    const availableUnits = matchingUnits.filter(i => i.status === "Disponible");
    
    currentActiveGroupKey = groupKey;
    currentMaxAvailable = availableUnits.length;
    if (sellMessage) sellMessage.textContent = "";

    if (modalTitle) modalTitle.textContent = baseItem.name;
    
    const opcionesImeis = availableUnits.map(i => 
      `<option value="${i.imei}" data-color="${i.color}">[Color: ${i.color}] — Nro: ${i.imei}</option>`
    ).join("");

    const selectImeiHTML = availableUnits.length > 0 
      ? `<select id="selectImeiVenta" class="form-control" style="width:100%; padding:8px; border-radius:6px; font-family:monospace; border:1px solid var(--gray-300);">${opcionesImeis}</select>`
      : `<span style="color:#ef233c; font-weight:700;">No hay unidades disponibles para seleccionar</span>`;

    const imeisListHTML = matchingUnits.map(i => 
      `<span style="font-family:monospace; font-size:0.85rem; padding:2px 6px; border-radius:4px; color:white; background:${i.status === 'Disponible' ? '#2a9d8f' : '#ef233c'}">${i.imei} (${i.color})</span>`
    ).join(" ");

    const usdVal = baseItem.priceUSD || (baseItem.price / (baseItem.exchangeRate || 6.96));
    const liveBOB = redondearCostoComercial(usdVal, currentGlobalExchangeRate);

    const uniqueColors = [...new Set(matchingUnits.filter(i => i.status === "Disponible").map(i => i.color))];

    if (modalBody) {
      modalBody.innerHTML = `
        <p><strong>Colores Disponibles:</strong> ${uniqueColors.join(", ") || "Ninguno"}</p>
        <p><strong>Configuración:</strong> ${baseItem.almacenamiento} / ${baseItem.ram}</p>
        <p><strong>Ficha de Pantalla:</strong> ${baseItem.specs.pantalla}</p>
        <p><strong>Cámara:</strong> ${baseItem.specs.camara}</p>
        <p><strong>Batería:</strong> ${baseItem.specs.bateria}</p>
        <p><strong>Precio del Terminal:</strong> <strong style="color:var(--red-neon); font-size:1.1rem;">${currencyFormatter.format(liveBOB)} BOB</strong> (${usdFormatter.format(usdVal)} USD)</p>
        <p style="margin-bottom:4px;"><strong>Stock Neto Disponible:</strong> <span style="font-weight:700; color:#3ddc84;">${currentMaxAvailable} unidades</span></p>
        
        <div style="margin: 12px 0; padding: 10px; background: rgba(255,42,61,0.08); border-radius: 6px; border-left: 4px solid var(--red);">
          <label for="selectImeiVenta" style="display:block; font-weight:700; font-size:0.85rem; margin-bottom:4px; color:var(--gray-700);">SELECCIONAR IDENTIFICADOR (IMEI/SERIAL) A VENDER:</label>
          ${selectImeiHTML}
        </div>

        <div style="display:flex; flex-direction:column; gap:6px; background:rgba(255,255,255,0.04); padding:10px; border-radius:6px;">
          <strong style="font-size:0.8rem; color:var(--gray-500);">Trazabilidad de Identificadores vinculados a este modelo:</strong>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">${imeisListHTML}</div>
        </div>
      `;
    }

    if (modalActionContainer) {
      if (currentMaxAvailable <= 0) {
        modalActionContainer.style.display = "none";
      } else {
        modalActionContainer.style.display = "block";
      }
    }

    if (detailModal) {
      detailModal.classList.add("is-open");
      detailModal.setAttribute("aria-hidden", "false");
    }
  } catch (error) {
    console.error(error);
  }
}

if (btnAddToCart) {
  btnAddToCart.addEventListener("click", () => {
    if (!sellMessage) return;

    const modelName = modalTitle ? modalTitle.textContent : "";
    const selectImeiEl = document.getElementById("selectImeiVenta");
    const imeiSeleccionado = selectImeiEl ? selectImeiEl.value : null;
    const opcionSeleccionada = selectImeiEl ? selectImeiEl.options[selectImeiEl.selectedIndex] : null;
    const colorSeleccionado = opcionSeleccionada ? opcionSeleccionada.getAttribute("data-color") : "";

    if (!imeiSeleccionado) {
      sellMessage.style.color = "red";
      sellMessage.textContent = "Debes seleccionar un IMEI válido.";
      return;
    }

    const existingIndex = globalCart.findIndex(i => i.imeiElegido === imeiSeleccionado);

    if (existingIndex !== -1) {
      sellMessage.style.color = "red";
      sellMessage.textContent = "Ese IMEI ya está en el carrito.";
      return;
    }

    globalCart.push({
      groupKey: currentActiveGroupKey,
      name: modelName,
      color: colorSeleccionado,
      qty: 1,
      imeiElegido: imeiSeleccionado
    });

    updateCartButtonUI();
    sellMessage.style.color = "green";
    sellMessage.textContent = "¡Unidad añadida al carrito de forma exitosa!";

    setTimeout(() => {
      closeProductModal();
    }, 900);
  });
}

// ============================================================
//  AUTENTICACIÓN (login / logout) Y CIERRE DE MODALES
// ============================================================

// Muestra la pantalla de login y oculta la app
function showLogin() {
  if (loginOverlay) loginOverlay.classList.remove("is-hidden");
  if (appShell) appShell.classList.add("is-hidden");
}

function closeProductModal() {
  if (detailModal) {
    detailModal.classList.remove("is-open");
    detailModal.setAttribute("aria-hidden", "true");
  }
  currentActiveGroupKey = null;
  currentMaxAvailable = 0;
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const username = formData.get("username").toString().trim();
    const password = formData.get("password").toString().trim();

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        sessionStorage.setItem("sellerName", data.user.name);
        sessionStorage.setItem("userRole", data.user.role); 
        
        aplicarPermisosPorRol(); 
        
        if (loginOverlay) loginOverlay.classList.add("is-hidden");
        if (appShell) appShell.classList.remove("is-hidden");
        if (loginError) loginError.textContent = "";
        loginForm.reset();
        return;
      }

      if (loginError) loginError.textContent = data.message || "Credenciales incorrectas.";
    } catch (error) {
      if (loginError) loginError.textContent = "Error de conexión con el servidor.";
    }
  });
}

navLinks.forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    closeProductModal();
    sessionStorage.clear();
    globalCart = [];
    updateCartButtonUI();
    showLogin();
    showView("inicio");
  });
}

if (inventoryGrid) {
  inventoryGrid.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches("[data-group-key]")) {
      const key = target.getAttribute("data-group-key");
      openProductModalByGroup(key);
      return;
    }

    if (target.matches("[data-delete-model]")) {
      const modelKey = target.getAttribute("data-delete-model");
      const partes = (modelKey || "").split("|");
      const [name, almacenamiento, ram] = partes;

      if (!confirm(`¿Eliminar el modelo "${name}" (${almacenamiento}/${ram}) del catálogo?\n\nDejará de mostrarse, pero las ventas e historial pasados se conservan.`)) {
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/inventory/hide-model`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, almacenamiento, ram })
        });
        const data = await response.json();

        if (response.ok && data.success) {
          await renderInventory();
          await renderDashboard();
        } else {
          alert(data.message || "No se pudo eliminar el modelo.");
        }
      } catch (error) {
        alert("Error de conexión con el servidor.");
      }
    }
  });
}

if (openAddModalBtn) {
  openAddModalBtn.addEventListener("click", async () => {
    if (addProductMessage) addProductMessage.textContent = "";
    const searchModelInputEl = document.getElementById("searchModelInput");
    if (searchModelInputEl) searchModelInputEl.value = "";
    const modelSeleccionadoLabelEl = document.getElementById("modelSeleccionadoLabel");
    if (modelSeleccionadoLabelEl) modelSeleccionadoLabelEl.style.display = "none";

    await populateModelsSelector();
    renderModelResults("");
    if (selectExistente) {
      selectExistente.value = "NUEVO";
      selectExistente.dispatchEvent(new Event("change"));
    }

    const selectorTipo = document.getElementById("prodTipoIdentificador");
    const labelIdentificador = document.getElementById("labelIdentificador");
    const inputImei = document.getElementById("prodImei");

    if (selectorTipo && labelIdentificador && inputImei) {
      selectorTipo.value = "IMEI";
      labelIdentificador.textContent = "Código IMEI (Único)";
      inputImei.placeholder = "Solo números";
      inputImei.setAttribute("pattern", "[0-9]+");

      selectorTipo.addEventListener("change", (e) => {
        if (e.target.value === "SERIAL") {
          labelIdentificador.textContent = "Número de Serial (Único)";
          inputImei.placeholder = "Ej: SN123XYZ";
          inputImei.removeAttribute("pattern"); 
        } else {
          labelIdentificador.textContent = "Código IMEI (Único)";
          inputImei.placeholder = "Solo números";
          inputImei.setAttribute("pattern", "[0-9]+"); 
        }
      });
    }

    if (addModal) {
      addModal.classList.add("is-open");
      addModal.setAttribute("aria-hidden", "false");
    }
  });
}

if (closeAddModalBtn) {
  closeAddModalBtn.addEventListener("click", () => {
    if (addModal) {
      addModal.classList.remove("is-open");
      addModal.setAttribute("aria-hidden", "true");
    }
    if (addProductForm) addProductForm.reset();
    detenerEscaner(); // apagar la cámara si quedó abierta
  });
}

if (addProductForm) {
  addProductForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(addProductForm);
    const isExisting = selectExistente ? selectExistente.value !== "NUEVO" : false;

    let rawStorage = formData.get("almacenamiento") ? formData.get("almacenamiento").toString().trim() : "";
    let rawRam = formData.get("ram") ? formData.get("ram").toString().trim() : "";
    let rawBateria = formData.get("bateria") ? formData.get("bateria").toString().trim() : "";

    if (rawStorage && !rawStorage.toUpperCase().includes("GB")) rawStorage += " GB";
    if (rawRam && !rawRam.toUpperCase().includes("RAM") && !rawRam.toUpperCase().includes("GB")) rawRam += " RAM";
    if (rawBateria && !rawBateria.toUpperCase().includes("MAH")) rawBateria += " mAh";

    const payload = {
      isExisting,
      existingKey: selectExistente ? selectExistente.value : "",
      name: formData.get("name") ? formData.get("name").toString().trim() : "",
      priceUSD: formData.get("priceUSD"),
      imei: formData.get("imei").toString().trim(),
      color: formData.get("color").toString().trim(),
      almacenamiento: rawStorage,
      ram: rawRam,
      pantalla: formData.get("pantalla") ? formData.get("pantalla").toString().trim() : "",
      camara: formData.get("camara") ? formData.get("camara").toString().trim() : "",
      bateria: rawBateria
    };

    try {
      const response = await fetch(`${API_BASE_URL}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (response.ok && data.success) {
        if (addProductMessage) {
          addProductMessage.style.color = "green";
          addProductMessage.textContent = data.message;
        }
        await renderInventory();
        await renderDashboard();
        addProductForm.reset();
        
        setTimeout(() => {
          if (closeAddModalBtn) closeAddModalBtn.click();
        }, 1000);
        return;
      }
      if (addProductMessage) {
        addProductMessage.style.color = "red";
        addProductMessage.textContent = data.message || "Error al guardar el equipo.";
      }
    } catch (error) {
      if (addProductMessage) {
        addProductMessage.style.color = "red";
        addProductMessage.textContent = "Error de conexión con el servidor.";
      }
    }
  });
}

// ============================================================
//  GESTIÓN DE USUARIOS (listar, registrar, eliminar)
// ============================================================

// Pide los usuarios activos al backend y los pinta con su botón de eliminar
async function renderUsers() {
  if (!usersList) return;
  try {
    const response = await fetch(`${API_BASE_URL}/users`);
    const registeredUsers = await response.json();

    usersList.innerHTML = registeredUsers
      .map(
        (user) => `
          <li style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
            <span>
              <strong>${user.name}</strong><br />
              ${user.email}<br />
              Rol: ${user.role}
            </span>
            <button type="button" class="btn" data-delete-user="${user._id}" data-user-name="${user.name}"
              style="background:#ef233c; color:white; border:none; border-radius:6px; padding:6px 12px; font-size:0.8rem; font-weight:700; cursor:pointer; white-space:nowrap;">
              Eliminar
            </button>
          </li>
        `
      )
      .join("");
  } catch (error) {
    console.error(error);
  }
}

if (usersList) {
  usersList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches("[data-delete-user]")) return;

    const userId = target.getAttribute("data-delete-user");
    const userName = target.getAttribute("data-user-name") || "este usuario";

    if (!confirm(`¿Seguro que deseas eliminar a ${userName}? El usuario quedará desactivado y no podrá iniciar sesión.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}`, { method: "DELETE" });
      const data = await response.json();

      if (response.ok && data.success) {
        await renderUsers();
        if (userMessage) {
          userMessage.style.color = "green";
          userMessage.textContent = data.message;
        }
      } else {
        if (userMessage) {
          userMessage.style.color = "red";
          userMessage.textContent = data.message || "No se pudo eliminar el usuario.";
        }
      }
    } catch (error) {
      if (userMessage) {
        userMessage.style.color = "red";
        userMessage.textContent = "Error de conexión con el servidor.";
      }
    }
  });
}

if (closeModalBtn) closeModalBtn.addEventListener("click", closeProductModal);
if (detailModal) {
  detailModal.addEventListener("click", (event) => {
    if (event.target === detailModal) {
      closeProductModal();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeProductModal();
    if (addModal) {
      addModal.classList.remove("is-open");
      addModal.setAttribute("aria-hidden", "true");
    }
  }
});

if (userForm) {
  userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(userForm);
    const fullName = formData.get("fullName").toString().trim();
    const username = formData.get("newUsername").toString().trim(); 
    const email = formData.get("email").toString().trim();
    const password = formData.get("newPassword").toString().trim(); 
    const role = formData.get("role").toString();

    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fullName, username, email, password, role }) 
      });

      const data = await response.json();
      if (!response.ok) {
        if (userMessage) {
          userMessage.style.color = "red";
          userMessage.textContent = data.message;
        }
        return;
      }
      await renderUsers();
      userForm.reset();
      if (userMessage) {
        userMessage.style.color = "green";
        userMessage.textContent = data.message;
      }
    } catch (error) {
      if (userMessage) {
        userMessage.style.color = "red";
        userMessage.textContent = "Error al conectar con el servidor.";
      }
    }
  });
}

// ============================================================
//  INICIALIZACIÓN DEL SISTEMA (arranque y permisos por rol)
// ============================================================

// Carga todos los datos iniciales al entrar a la app, en orden
async function inicializarSistema() {
  await fetchAndApplyExchangeRate();
  await initDashboardCalendar();
  await renderDashboard();
  await renderInventory();
  await renderUsers();  
  aplicarPermisosPorRol();  
  showView("inicio");
}

// Oculta o muestra opciones según el rol (Vendedor ve menos que Administrador)
function aplicarPermisosPorRol() {
  const rol = sessionStorage.getItem("userRole");
  const navUsuarios = document.querySelector('.nav-link[data-view="usuarios"]');
  const navHistorial = document.querySelector('.nav-link[data-view="historial"]');
  const btnAgregarImei = document.getElementById("openAddModalBtn");
  const inputCambio = document.getElementById("globalExchangeInput");
  const btnGuardarCambio = document.getElementById("btnSaveExchange");

  if (rol === "Vendedor") {
    if (navUsuarios) navUsuarios.style.display = "none";
    if (navHistorial) navHistorial.style.display = "none";
    if (btnAgregarImei) btnAgregarImei.style.display = "none";
    if (inputCambio) inputCambio.disabled = true;
    if (btnGuardarCambio) btnGuardarCambio.style.display = "none";

  } else {
    if (navUsuarios) navUsuarios.style.display = "block";
    if (navHistorial) navHistorial.style.display = "block";
    if (btnAgregarImei) btnAgregarImei.style.display = "block";
    if (inputCambio) inputCambio.disabled = false;
    if (btnGuardarCambio) btnGuardarCambio.style.display = "block";
  }
}

// Punto de entrada: al cargar la página, decide si mostrar login o la app
document.addEventListener("DOMContentLoaded", () => {
  const isLogged = sessionStorage.getItem("sellerName");
  if (isLogged) {
    if (loginOverlay) loginOverlay.classList.add("is-hidden");
    if (appShell) appShell.classList.remove("is-hidden");
    aplicarPermisosPorRol();
  } else {
    showLogin();
  }
});

inicializarSistema();

// ============================================================
//  ESCÁNER DE CÓDIGO DE BARRAS (cámara -> rellena el IMEI)
// ============================================================

// Guarda la instancia del escáner activo para poder detenerlo después
let html5QrScanner = null;

// Abre la cámara a pantalla completa y empieza a buscar un código de barras
async function iniciarEscaner() {
  const scannerOverlay = document.getElementById("scannerOverlay");
  const scannerMsg = document.getElementById("scannerMsg");
  const inputImei = document.getElementById("prodImei");

  if (typeof Html5Qrcode === "undefined") {
    if (scannerMsg) scannerMsg.textContent = "No se pudo cargar el lector. Revisa tu conexión.";
    if (scannerOverlay) scannerOverlay.style.display = "block";
    return;
  }

  if (scannerOverlay) scannerOverlay.style.display = "block";
  if (scannerMsg) scannerMsg.textContent = "Alinea el código de barras con la línea roja";

  html5QrScanner = new Html5Qrcode("scannerView");

  try {
    await html5QrScanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        // Franja angosta y horizontal: solo lee lo que cruza la zona central (la línea)
        qrbox: (anchoVista, altoVista) => {
          const ancho = Math.floor(Math.min(anchoVista, 460) * 0.9);
          return { width: ancho, height: 130 };
        },
        aspectRatio: window.innerHeight / window.innerWidth
      },
      (textoLeido) => {
        if (inputImei) inputImei.value = textoLeido.replace(/\D/g, "");
        if (scannerMsg) scannerMsg.textContent = `✓ Código leído: ${textoLeido}`;
        detenerEscaner();
      },
      () => {}
    );
  } catch (error) {
    if (scannerMsg) scannerMsg.textContent = "No se pudo abrir la cámara. Revisa los permisos del navegador.";
  }
}

// Detiene la cámara y cierra el overlay de pantalla completa
async function detenerEscaner() {
  const scannerOverlay = document.getElementById("scannerOverlay");
  if (html5QrScanner) {
    try {
      await html5QrScanner.stop();
      await html5QrScanner.clear();
    } catch (error) {
      // Si ya estaba detenido, no pasa nada
    }
    html5QrScanner = null;
  }
  if (scannerOverlay) {
    setTimeout(() => { scannerOverlay.style.display = "none"; }, 900);
  }
}

const btnEscanearImei = document.getElementById("btnEscanearImei");
if (btnEscanearImei) {
  btnEscanearImei.addEventListener("click", iniciarEscaner);
}

const btnCerrarScanner = document.getElementById("btnCerrarScanner");
if (btnCerrarScanner) {
  btnCerrarScanner.addEventListener("click", detenerEscaner);
}