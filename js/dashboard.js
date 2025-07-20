import { db } from './firebase-config.js';
import { collection, onSnapshot, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- ELEMENTOS DEL DOM ---
const totalActivosEl = document.getElementById('total-activos');
const totalPasivosEl = document.getElementById('total-pasivos');
const activosListEl = document.getElementById('activos-list');
const pasivosListEl = document.getElementById('pasivos-list');
const calendarGrid = document.getElementById('calendar-grid');
const monthYearDisplay = document.getElementById('month-year');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');

// --- ESTADO Y FUNCIONES AUXILIARES ---
let currentDate = new Date();
const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
const calendarFormat = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

// --- LÓGICA DEL DASHBOARD (TOTALES Y LISTAS DE CUENTAS) ---
const pageMapping = {
    "Saldo Bancario": "bancos.html",
    "Clientes a Cobrar": "clientes.html",
    "Cheques en cartera": "cheques-cartera.html",
    "Cheques pendiente de cobro": "cheques-pendientes.html",
    "Proveedores a pagar": "proveedores.html",
    "Cheques a pagar": "cheques-pagar.html"
};
const itemsCollection = collection(db, 'items');

onSnapshot(itemsCollection, (snapshot) => {
    let totalActivos = 0;
    let totalPasivos = 0;
    
    activosListEl.innerHTML = '';
    pasivosListEl.innerHTML = '';

    const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    itemsData.forEach(item => {
        const href = pageMapping[item.nombre] || '#';
        const card = document.createElement('a');
        card.href = href;
        card.className = 'detail-card-link';
        
        card.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="text-lg font-medium text-gray-800">${item.nombre}</span>
                <div class="flex items-center space-x-2">
                    <span class="text-xl font-semibold text-gray-900">${formatCurrency(item.valor)}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>
                </div>
            </div>
        `;

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

    if (activosListEl.innerHTML === '') {
        activosListEl.innerHTML = '<p class="text-gray-500">No hay cuentas de activo.</p>';
    }
    if (pasivosListEl.innerHTML === '') {
        pasivosListEl.innerHTML = '<p class="text-gray-500">No hay cuentas de pasivo.</p>';
    }
});


// --- LÓGICA DEL WIDGET DE CALENDARIO CON SALDO ACUMULATIVO ---
async function renderCalendarWidget() {
    if (!calendarGrid) return;
    calendarGrid.innerHTML = '<div class="col-span-7 text-center py-10">Calculando flujo de caja...</div>';
    
    // 1. Obtener el saldo inicial de la configuración
    const balanceRef = doc(db, 'config', 'initial_balances');
    const balanceSnap = await getDoc(balanceRef);
    const saldoInicial = balanceSnap.exists() ? balanceSnap.data().saldo_bancario_inicial : 0;

    // 2. Obtener todos los eventos financieros (ingresos y egresos)
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

    // 3. Renderizar el calendario con saldo acumulativo
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    monthYearDisplay.textContent = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentDate);
    
    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Calcular saldo acumulado hasta el día anterior al inicio del mes
    let runningBalance = saldoInicial;
    for (const dateStr in dailyTotals) {
        // Sumar/restar todos los eventos históricos ANTERIORES al primer día del mes que se muestra
        if (new Date(dateStr + 'T00:00:00') < firstDayOfMonth) {
            runningBalance += dailyTotals[dateStr].ingresos - dailyTotals[dateStr].egresos;
        }
    }
    
    calendarGrid.innerHTML = '';
    // Rellenar días del mes anterior
    for (let i = 0; i < firstDayOfMonth.getDay(); i++) {
        calendarGrid.innerHTML += `<div class="calendar-day other-month"></div>`;
    }

    // Renderizar cada día del mes
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const totals = dailyTotals[dateStr] || { ingresos: 0, egresos: 0 };
        
        // El saldo corriente se actualiza con los movimientos DEL DÍA
        runningBalance += totals.ingresos - totals.egresos;

        const isToday = new Date(dateStr+'T00:00:00').toDateString() === new Date().toDateString();
        const balanceClass = runningBalance >= 0 ? 'positive-balance' : 'negative-balance';
        
        let dayHtml = `<a href="calendario.html?date=${dateStr}" class="calendar-day-link ${isToday ? 'today' : ''} ${balanceClass}">
            <div class="day-number">${day}</div>
            <div class="day-content">
                <div class="day-balance">${calendarFormat(runningBalance)}</div>
            </div>
        </a>`;
        calendarGrid.innerHTML += dayHtml;
    }
}

// --- NAVEGACIÓN DEL CALENDARIO ---
if (prevMonthBtn && nextMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendarWidget();
    });
    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendarWidget();
    });
}

// --- INICIALIZACIÓN ---
renderCalendarWidget();
