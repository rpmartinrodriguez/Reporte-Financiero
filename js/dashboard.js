import { db } from './firebase-config.js';
import { collection, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- ELEMENTOS DEL DOM ---
const totalActivosEl = document.getElementById('total-activos');
const totalPasivosEl = document.getElementById('total-pasivos');
const activosListEl = document.getElementById('activos-list');
const pasivosListEl = document.getElementById('pasivos-list');
const calendarGrid = document.getElementById('calendar-grid');
const monthYearDisplay = document.getElementById('month-year');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');

let currentDate = new Date();
const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

// --- LÓGICA DEL DASHBOARD (TOTALES Y LISTAS) ---
const pageMapping = {
    "Clientes a Cobrar": "clientes.html",
    "Cheques en cartera": "cheques-cartera.html",
    "Cheques pendiente de cobro": "cheques-pendientes.html",
    "Proveedores a pagar": "proveedores.html",
    "Cheques a pagar": "cheques-pagar.html"
};
const itemsCollection = collection(db, 'items');
onSnapshot(itemsCollection, (snapshot) => {
    let totalActivos = 0, totalPasivos = 0;
    activosListEl.innerHTML = '';
    pasivosListEl.innerHTML = '';
    const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    itemsData.forEach(item => {
        const href = pageMapping[item.nombre] || '#';
        const card = document.createElement('a');
        card.href = href;
        card.className = 'detail-card-link';
        card.innerHTML = `<div class="flex justify-between items-center"><span class="text-lg font-medium text-gray-800">${item.nombre}</span><div class="flex items-center space-x-2"><span class="text-xl font-semibold text-gray-900">${formatCurrency(item.valor)}</span><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg></div></div>`;
        if (item.tipo === 'activo') {
            totalActivos += item.valor;
            activosListEl.appendChild(card);
        } else if (item.tipo === 'pasivo') {
            totalPasivos += item.valor;
            pasivosListEl.appendChild(card);
        }
    });
    totalActivosEl.textContent = formatCurrency(totalActivos);
    totalPasivosEl.textContent = formatCurrency(totalPasivos);
    if (activosListEl.innerHTML === '') activosListEl.innerHTML = '<p class="text-gray-500">No hay cuentas de activo.</p>';
    if (pasivosListEl.innerHTML === '') pasivosListEl.innerHTML = '<p class="text-gray-500">No hay cuentas de pasivo.</p>';
});

// --- LÓGICA DEL WIDGET DE CALENDARIO ---
const calendarFormat = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
async function renderCalendarWidget() {
    if (!calendarGrid) return;
    calendarGrid.innerHTML = '<div class="col-span-7 text-center py-10">Cargando...</div>';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    monthYearDisplay.textContent = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentDate);
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const itemsSnapshot = await getDocs(collection(db, 'items'));
    const allEvents = [];
    const itemConfigs = [
        { name: "Clientes a Cobrar", sub: "facturas", dateField: "fecha_vencimiento", amountField: "saldo_neto", type: "ingreso" },
        { name: "Cheques en cartera", sub: "cheques_detalle_cartera", dateField: "fecha_cobro", amountField: "monto", type: "ingreso" },
        { name: "Cheques pendiente de cobro", sub: "cheques_detalle_pendientes", dateField: "fecha_cobro", amountField: "monto", type: "ingreso" },
        { name: "Proveedores a pagar", sub: "facturas_proveedores", dateField: "fecha_vencimiento", amountField: "saldo", type: "egreso" },
        { name: "Cheques a pagar", sub: "cheques_emitidos", dateField: "fecha_emision", amountField: "monto", type: "egreso" }
    ];
    for (const config of itemConfigs) {
        const parentDoc = itemsSnapshot.docs.find(doc => doc.data().nombre === config.name);
        if (parentDoc) {
            const subSnapshot = await getDocs(collection(db, 'items', parentDoc.id, config.sub));
            subSnapshot.forEach(doc => {
                const data = doc.data();
                if (data[config.dateField] && data[config.amountField] > 0) {
                    allEvents.push({ date: data[config.dateField], amount: data[config.amountField], type: config.type });
                }
            });
        }
    }
    const dailyTotals = allEvents.reduce((acc, event) => {
        if (!acc[event.date]) acc[event.date] = { ingresos: 0, egresos: 0 };
        if (event.type === 'ingreso') acc[event.date].ingresos += event.amount;
        else acc[event.date].egresos += event.amount;
        return acc;
    }, {});
    calendarGrid.innerHTML = '';
    for (let i = 0; i < firstDayOfMonth; i++) calendarGrid.innerHTML += `<div class="calendar-day other-month"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const today = new Date();
        const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        const totals = dailyTotals[dateStr] || { ingresos: 0, egresos: 0 };
        let dayHtml = `<a href="calendario.html?date=${dateStr}" class="calendar-day-link ${isToday ? 'today' : ''}">
            <div class="day-number">${day}</div>
            <div class="day-content">`;
        if (totals.ingresos > 0) dayHtml += `<div class="day-event income">+ ${calendarFormat(totals.ingresos)}</div>`;
        if (totals.egresos > 0) dayHtml += `<div class="day-event expense">- ${calendarFormat(totals.egresos)}</div>`;
        dayHtml += `</div></a>`;
        calendarGrid.innerHTML += dayHtml;
    }
}
if (prevMonthBtn && nextMonthBtn) {
    prevMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendarWidget(); });
    nextMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendarWidget(); });
}
renderCalendarWidget();
