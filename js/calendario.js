import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- ELEMENTOS DEL DOM ---
const calendarGrid = document.getElementById('calendar-grid');
const monthYearDisplay = document.getElementById('month-year');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');

// --- ESTADO ---
let currentDate = new Date();

const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

// --- LÓGICA DE DATOS ---
async function fetchAllFinancialEvents() {
    const itemsRef = collection(db, 'items');
    const itemsSnapshot = await getDocs(itemsRef);
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
            const subcollectionRef = collection(db, 'items', parentDoc.id, config.sub);
            const eventsSnapshot = await getDocs(subcollectionRef);
            eventsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data[config.dateField] && data[config.amountField] > 0) {
                    allEvents.push({
                        date: data[config.dateField],
                        amount: data[config.amountField],
                        type: config.type
                    });
                }
            });
        }
    }
    return allEvents;
}

function aggregateEventsByDay(events) {
    const dailyTotals = {};
    events.forEach(event => {
        const date = event.date;
        if (!dailyTotals[date]) {
            dailyTotals[date] = { ingresos: 0, egresos: 0 };
        }
        if (event.type === 'ingreso') {
            dailyTotals[date].ingresos += event.amount;
        } else {
            dailyTotals[date].egresos += event.amount;
        }
    });
    return dailyTotals;
}

// --- LÓGICA DE RENDERIZADO DEL CALENDARIO ---
async function renderCalendar() {
    calendarGrid.innerHTML = '<div class="col-span-7 text-center py-10">Cargando datos...</div>';
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthYearDisplay.textContent = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentDate);
    
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const allEvents = await fetchAllFinancialEvents();
    const dailyTotals = aggregateEventsByDay(allEvents);

    calendarGrid.innerHTML = '';

    // Días del mes anterior
    for (let i = 0; i < firstDayOfMonth; i++) {
        calendarGrid.innerHTML += `<div class="calendar-day other-month"></div>`;
    }

    // Días del mes actual
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const today = new Date();
        const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        
        const totals = dailyTotals[dateStr] || { ingresos: 0, egresos: 0 };
        
        let dayHtml = `<div class="calendar-day ${isToday ? 'today' : ''}">
            <div class="day-number">${day}</div>
            <div class="day-content">`;
        
        if (totals.ingresos > 0) {
            dayHtml += `<div class="day-event income">+ ${formatCurrency(totals.ingresos)}</div>`;
        }
        if (totals.egresos > 0) {
            dayHtml += `<div class="day-event expense">- ${formatCurrency(totals.egresos)}</div>`;
        }
        
        dayHtml += `</div></div>`;
        calendarGrid.innerHTML += dayHtml;
    }
}

// --- NAVEGACIÓN ---
prevMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
});

nextMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
});

// --- INICIALIZACIÓN ---
renderCalendar();
