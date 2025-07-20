import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- ELEMENTOS DEL DOM ---
const detailDateEl = document.getElementById('detail-date');
const summaryCardsEl = document.getElementById('summary-cards');
const ingresosListEl = document.getElementById('ingresos-list');
const egresosListEl = document.getElementById('egresos-list');

const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

// --- LÓGICA DE DATOS ---
async function fetchEventsForDate(dateStr) {
    const itemsRef = collection(db, 'items');
    const itemsSnapshot = await getDocs(itemsRef);
    const dailyEvents = { ingresos: [], egresos: [] };
    let totalIngresos = 0;
    let totalEgresos = 0;

    const itemConfigs = [
        { name: "Clientes a Cobrar", sub: "facturas", dateField: "fecha_vencimiento", amountField: "saldo_neto", type: "ingreso", descField: "nombre" },
        { name: "Cheques en cartera", sub: "cheques_detalle_cartera", dateField: "fecha_cobro", amountField: "monto", type: "ingreso", descField: "librador" },
        { name: "Cheques pendiente de cobro", sub: "cheques_detalle_pendientes", dateField: "fecha_cobro", amountField: "monto", type: "ingreso", descField: "librador" },
        { name: "Proveedores a pagar", sub: "facturas_proveedores", dateField: "fecha_vencimiento", amountField: "saldo", type: "egreso", descField: "proveedor" },
        { name: "Cheques a pagar", sub: "cheques_emitidos", dateField: "fecha_emision", amountField: "monto", type: "egreso", descField: "destinatario" }
    ];

    for (const config of itemConfigs) {
        const parentDoc = itemsSnapshot.docs.find(doc => doc.data().nombre === config.name);
        if (parentDoc) {
            const subcollectionRef = collection(db, 'items', parentDoc.id, config.sub);
            const eventsSnapshot = await getDocs(subcollectionRef);
            eventsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data[config.dateField] === dateStr && data[config.amountField] > 0) {
                    const eventDetail = {
                        descripcion: `${config.name}: ${data[config.descField] || ''}`,
                        monto: data[config.amountField]
                    };
                    if (config.type === 'ingreso') {
                        dailyEvents.ingresos.push(eventDetail);
                        totalIngresos += eventDetail.monto;
                    } else {
                        dailyEvents.egresos.push(eventDetail);
                        totalEgresos += eventDetail.monto;
                    }
                }
            });
        }
    }
    return { dailyEvents, totalIngresos, totalEgresos };
}

// --- LÓGICA DE RENDERIZADO ---
function renderDetails(dateStr, data) {
    const { dailyEvents, totalIngresos, totalEgresos } = data;
    const saldoNeto = totalIngresos - totalEgresos;

    const dateObj = new Date(dateStr + 'T00:00:00');
    detailDateEl.textContent = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' }).format(dateObj);

    // Renderizar tarjetas de resumen
    summaryCardsEl.innerHTML = `
        <div class="summary-card bg-white p-6 rounded-xl shadow-md"><h2 class="text-lg font-semibold text-gray-500">Total Ingresos</h2><p class="text-3xl font-bold text-green-600 mt-2">${formatCurrency(totalIngresos)}</p></div>
        <div class="summary-card bg-white p-6 rounded-xl shadow-md"><h2 class="text-lg font-semibold text-gray-500">Total Egresos</h2><p class="text-3xl font-bold text-red-600 mt-2">${formatCurrency(totalEgresos)}</p></div>
        <div class="summary-card bg-white p-6 rounded-xl shadow-md"><h2 class="text-lg font-semibold text-gray-500">Saldo Neto del Día</h2><p class="text-3xl font-bold ${saldoNeto >= 0 ? 'text-blue-600' : 'text-red-600'} mt-2">${formatCurrency(saldoNeto)}</p></div>
    `;

    // Renderizar lista de ingresos
    ingresosListEl.innerHTML = '';
    if (dailyEvents.ingresos.length > 0) {
        dailyEvents.ingresos.forEach(item => {
            ingresosListEl.innerHTML += `<div class="detail-item"><span class="item-desc">${item.descripcion}</span><span class="item-amount positive">+ ${formatCurrency(item.monto)}</span></div>`;
        });
    } else {
        ingresosListEl.innerHTML = '<p class="text-gray-500">No hay ingresos programados para hoy.</p>';
    }

    // Renderizar lista de egresos
    egresosListEl.innerHTML = '';
    if (dailyEvents.egresos.length > 0) {
        dailyEvents.egresos.forEach(item => {
            egresosListEl.innerHTML += `<div class="detail-item"><span class="item-desc">${item.descripcion}</span><span class="item-amount negative">- ${formatCurrency(item.monto)}</span></div>`;
        });
    } else {
        egresosListEl.innerHTML = '<p class="text-gray-500">No hay egresos programados para hoy.</p>';
    }
}

// --- INICIALIZACIÓN ---
async function initialize() {
    const params = new URLSearchParams(window.location.search);
    let dateStr = params.get('date');

    if (!dateStr || dateStr === 'today') {
        const today = new Date();
        dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    const data = await fetchEventsForDate(dateStr);
    renderDetails(dateStr, data);
}

initialize();
