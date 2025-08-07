import { db, authReady } from './firebase-config.js';
import { collection, onSnapshot, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

authReady.then(() => {
    // --- ELEMENTOS DEL DOM ---
    const totalActivosEl = document.getElementById('total-activos');
    const totalPasivosEl = document.getElementById('total-pasivos');
    const activosListEl = document.getElementById('activos-list');
    const pasivosListEl = document.getElementById('pasivos-list');
    const notificationsListEl = document.getElementById('notifications-list');
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearDisplay = document.getElementById('month-year');
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    const totalsChartCtx = document.getElementById('totals-chart')?.getContext('2d');
    const assetCompositionChartCtx = document.getElementById('asset-composition-chart')?.getContext('2d');
    const weeklySummaryBtn = document.getElementById('weekly-summary-btn');
    const summaryModal = document.getElementById('summary-modal');
    const closeSummaryModalBtn = document.getElementById('close-summary-modal');
    const summaryModalContent = document.getElementById('summary-modal-content');
    
    let totalsChart;
    let assetCompositionChart;
    let currentDate = new Date();
    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
    const calendarFormat = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
    
    const pageMapping = { "Saldo Bancario": "bancos.html", "Saldo Efectivo": "efectivo.html", "Clientes a Cobrar": "clientes.html", "Cheques en cartera": "cheques-cartera.html", "Cheques pendiente de cobro": "cheques-pendientes.html", "Proveedores a pagar": "proveedores.html", "Cheques a pagar": "cheques-pagar.html", "Gastos Fijos": "gastos-fijos.html" };
    
    // --- LÓGICA DEL RESUMEN SEMANAL ---
    async function generateWeeklySummary() {
        if (!summaryModal || !summaryModalContent) return;
        summaryModal.classList.remove('hidden');
        summaryModal.classList.add('flex');
        summaryModalContent.innerHTML = '<p class="text-center py-8">Calculando resumen...</p>';

        const today = new Date();
        today.setHours(0,0,0,0);
        const futureDate = new Date(today);
        futureDate.setDate(today.getDate() + 7);
        
        const { allEvents, saldoInicial } = await getFinancialDataForRange();
        
        let runningBalance = saldoInicial;
        for (const dateStr in allEvents) {
            if (new Date(dateStr + 'T00:00:00') < today) {
                runningBalance += allEvents[dateStr].netChange;
            }
        }

        let weeklyIngresos = 0;
        let weeklyEgresos = 0;
        let dayWithHighestIncome = { date: null, amount: -Infinity };
        let dayWithHighestExpense = { date: null, amount: -Infinity };
        let dayWithLowestBalance = { date: null, balance: runningBalance };

        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const totals = allEvents[dateStr] || { netChange: 0, ingresos: 0, egresos: 0 };
            
            weeklyIngresos += totals.ingresos;
            weeklyEgresos += totals.egresos;
            runningBalance += totals.netChange;

            if (totals.ingresos > dayWithHighestIncome.amount) {
                dayWithHighestIncome = { date: dateStr, amount: totals.ingresos };
            }
            if (totals.egresos > dayWithHighestExpense.amount) {
                dayWithHighestExpense = { date: dateStr, amount: totals.egresos };
            }
            if (runningBalance < dayWithLowestBalance.balance) {
                dayWithLowestBalance = { date: dateStr, balance: runningBalance };
            }
        }

        const weeklyNeto = weeklyIngresos - weeklyEgresos;

        summaryModalContent.innerHTML = `
            <div class="space-y-4">
                <div class="summary-item"><span class="summary-label">Total Ingresos Próximos 7 Días:</span><span class="summary-value text-green-600">${formatCurrency(weeklyIngresos)}</span></div>
                <div class="summary-item"><span class="summary-label">Total Egresos Próximos 7 Días:</span><span class="summary-value text-red-600">${formatCurrency(weeklyEgresos)}</span></div>
                <div class="summary-item font-bold"><span class="summary-label">Saldo Neto de la Semana:</span><span class="summary-value ${weeklyNeto >= 0 ? 'text-blue-600' : 'text-red-600'}">${formatCurrency(weeklyNeto)}</span></div>
                <div class="pt-4 border-t">
                    <div class="summary-item"><span class="summary-label">📈 Día de Mayor Ingreso:</span><span class="summary-value">${dayWithHighestIncome.amount > 0 ? `${dayWithHighestIncome.date} (${formatCurrency(dayWithHighestIncome.amount)})` : 'N/A'}</span></div>
                    <div class="summary-item"><span class="summary-label">📉 Día de Mayor Egreso:</span><span class="summary-value">${dayWithHighestExpense.amount > 0 ? `${dayWithHighestExpense.date} (${formatCurrency(dayWithHighestExpense.amount)})` : 'N/A'}</span></div>
                    <div class="summary-item"><span class="summary-label">⚠️ Día con Saldo Proyectado más Bajo:</span><span class="summary-value">${dayWithLowestBalance.date ? `${dayWithLowestBalance.date} (${formatCurrency(dayWithLowestBalance.balance)})` : 'N/A'}</span></div>
                </div>
            </div>
        `;
    }

    async function getFinancialDataForRange() {
        const balanceRef = doc(db, 'config', 'initial_balances');
        const balanceSnap = await getDoc(balanceRef);
        const saldoInicial = balanceSnap.exists() ? balanceSnap.data().saldo_bancario_inicial : 0;
        const itemsSnapshot = await getDocs(collection(db, 'items'));
        const allEvents = [];
        const itemConfigs = [ { name: "Saldo Bancario", sub: "movimientos_bancarios", dateField: "fecha", amountField: "monto", sign: 1 }, { name: "Saldo Efectivo", sub: "movimientos_caja", dateField: "fecha", amountField: "monto_caja_1", sign: 1 }, { name: "Saldo Efectivo", sub: "movimientos_caja", dateField: "fecha", amountField: "monto_caja_2", sign: 1 }, { name: "Clientes a Cobrar", sub: "facturas", dateField: "fecha_vencimiento", amountField: "saldo_neto", sign: 1 }, { name: "Cheques en cartera", sub: "cheques_detalle_cartera", dateField: "fecha_cobro", amountField: "monto", sign: 1 }, { name: "Cheques pendiente de cobro", sub: "cheques_detalle_pendientes", dateField: "fecha_cobro", amountField: "monto", sign: 1 }, { name: "Proveedores a pagar", sub: "facturas_proveedores", dateField: "fecha_vencimiento", amountField: "saldo", sign: -1 }, { name: "Cheques a pagar", sub: "cheques_emitidos", dateField: "fecha_emision", amountField: "monto", sign: -1 } ];
        for (const config of itemConfigs) {
            const parentDoc = itemsSnapshot.docs.find(doc => doc.data().nombre === config.name);
            if (parentDoc) {
                const subSnapshot = await getDocs(collection(db, 'items', parentDoc.id, config.sub));
                subSnapshot.forEach(doc => {
                    const data = doc.data();
                    const amount = data[config.amountField] || 0;
                    if (data[config.dateField] && amount !== 0) {
                        allEvents.push({ date: data[config.dateField], amount: amount * config.sign });
                    }
                });
            }
        }
        const gastosFijosParentDoc = itemsSnapshot.docs.find(doc => doc.data().nombre === "Gastos Fijos");
        if (gastosFijosParentDoc) {
            const gastosFijosSnap = await getDocs(collection(db, 'items', gastosFijosParentDoc.id, 'gastos_detalle'));
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1;
            const monthId = `${year}-${String(month).padStart(2, '0')}`;
            for (const gastoDoc of gastosFijosSnap.docs) {
                const gastoData = gastoDoc.data();
                const paymentRef = doc(db, gastoDoc.ref.path, 'pagos_realizados', monthId);
                const paymentSnap = await getDoc(paymentRef);
                if (!paymentSnap.exists()) {
                    const eventDate = `${year}-${String(month).padStart(2, '0')}-${String(gastoData.dia_vencimiento).padStart(2, '0')}`;
                    allEvents.push({ date: eventDate, amount: -gastoData.monto });
                }
            }
        }
        
        const dailyTotals = allEvents.reduce((acc, event) => {
            if (!acc[event.date]) acc[event.date] = { netChange: 0, ingresos: 0, egresos: 0 };
            acc[event.date].netChange += event.amount;
            if (event.amount > 0) acc[event.date].ingresos += event.amount;
            else acc[event.date].egresos += Math.abs(event.amount);
            return acc;
        }, {});

        return { allEvents: dailyTotals, saldoInicial };
    }
    
    // --- LÓGICA DE NOTIFICACIONES (ACTUALIZADA) ---
    async function renderNotifications() {
        if (!notificationsListEl) return;
        notificationsListEl.innerHTML = '<p class="text-gray-500">Buscando vencimientos...</p>';
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysFromNow = new Date(today);
        sevenDaysFromNow.setDate(today.getDate() + 7);

        const itemsSnapshot = await getDocs(collection(db, 'items'));
        const allNotifications = [];
        const notificationConfigs = [
            { name: "Clientes a Cobrar", sub: "facturas", dateField: "fecha_vencimiento", descField: "nombre", amountField: "saldo_neto", type: "cobro", status: ["Pendiente"] },
            { name: "Cheques en cartera", sub: "cheques_detalle_cartera", dateField: "fecha_cobro", descField: "librador", amountField: "monto", type: "deposito", status: ["En cartera"] },
            { name: "Proveedores a pagar", sub: "facturas_proveedores", dateField: "fecha_vencimiento", descField: "proveedor", amountField: "saldo", type: "pago", status: ["Pendiente"] },
            { name: "Cheques a pagar", sub: "cheques_emitidos", dateField: "fecha_emision", descField: "destinatario", amountField: "monto", type: "pago_cheque", status: ["Emitido"] }
        ];

        for (const config of notificationConfigs) {
            const parentDoc = itemsSnapshot.docs.find(doc => doc.data().nombre === config.name);
            if (parentDoc) {
                const subSnapshot = await getDocs(collection(db, 'items', parentDoc.id, config.sub));
                subSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (config.status.includes(data.estado)) {
                        const eventDate = new Date(data[config.dateField] + 'T00:00:00');
                        if (eventDate <= sevenDaysFromNow) {
                            allNotifications.push({ ...data, type: config.type, date: eventDate, desc: data[config.descField], amount: data[config.amountField] });
                        }
                    }
                });
            }
        }

        const gastosFijosParentDoc = itemsSnapshot.docs.find(doc => doc.data().nombre === "Gastos Fijos");
        if (gastosFijosParentDoc) {
            const gastosFijosSnap = await getDocs(collection(db, 'items', gastosFijosParentDoc.id, 'gastos_detalle'));
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth();
            const monthId = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
            
            for (const gastoDoc of gastosFijosSnap.docs) {
                const gastoData = gastoDoc.data();
                const dueDate = new Date(currentYear, currentMonth, gastoData.dia_vencimiento);
                if (dueDate <= sevenDaysFromNow && dueDate >= today) {
                    const paymentRef = doc(db, gastoDoc.ref.path, 'pagos_realizados', monthId);
                    const paymentSnap = await getDoc(paymentRef);
                    if (!paymentSnap.exists()) {
                        allNotifications.push({ type: 'pago', date: dueDate, desc: gastoData.descripcion, amount: gastoData.monto });
                    }
                }
            }
        }

        allNotifications.sort((a, b) => a.date - b.date);

        if (allNotifications.length === 0) {
            notificationsListEl.innerHTML = '<p class="text-gray-500">No hay vencimientos próximos en los siguientes 7 días.</p>';
            return;
        }

        notificationsListEl.innerHTML = '';
        allNotifications.forEach(item => {
            const isOverdue = item.date < today;
            const iconClass = item.type.includes('pago') ? 'overdue' : (isOverdue ? 'overdue' : (item.type === 'deposito' ? 'deposit' : 'upcoming'));
            const iconSVG = {
                pago: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>',
                cobro: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01"></path></svg>',
                deposito: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>',
                pago_cheque: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z"></path></svg>'
            }[item.type];

            const text = {
                pago: `Pagar <strong>${item.desc}</strong> por <strong>${formatCurrency(item.amount)}</strong>.`,
                cobro: `Cobrar factura a <strong>${item.desc}</strong> por <strong>${formatCurrency(item.amount)}</strong>.`,
                deposito: `Depositar cheque de <strong>${item.desc}</strong> por <strong>${formatCurrency(item.amount)}</strong>.`,
                pago_cheque: `Cheque emitido a <strong>${item.desc}</strong> por <strong>${formatCurrency(item.amount)}</strong>.`
            }[item.type];
            
            const dateText = isOverdue ? `Venció el ${item.date.toLocaleDateString('es-ES')}` : `Vence el ${item.date.toLocaleDateString('es-ES')}`;

            const notificationEl = document.createElement('div');
            notificationEl.className = 'notification-item';
            notificationEl.innerHTML = `<div class="notification-icon ${iconClass}">${iconSVG}</div><div class="notification-content"><p class="notification-text">${text}</p><p class="notification-date">${dateText}</p></div>`;
            notificationsListEl.appendChild(notificationEl);
        });
    }

    // --- LÓGICA PRINCIPAL DEL DASHBOARD ---
    onSnapshot(collection(db, 'items'), async (snapshot) => {
        let totalActivos = 0, totalPasivos = 0;
        activosListEl.innerHTML = ''; pasivosListEl.innerHTML = '';
        const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), ref: doc.ref }));
        const activosDataForChart = [];
        for (const item of itemsData) {
            let valueToSumAndDisplay = item.valor;
            if (item.nombre === "Gastos Fijos") {
                const gastosSnap = await getDocs(collection(item.ref, 'gastos_detalle'));
                valueToSumAndDisplay = gastosSnap.docs.reduce((sum, doc) => sum + doc.data().monto, 0);
            }
            const finalDisplayValue = item.tipo === 'activo' ? Math.max(0, valueToSumAndDisplay) : valueToSumAndDisplay;
            if (item.tipo === 'activo') {
                totalActivos += finalDisplayValue;
                activosListEl.appendChild(createDetailCard(item, finalDisplayValue));
                if (finalDisplayValue > 0) { activosDataForChart.push({ label: item.nombre, value: finalDisplayValue }); }
            } else if (item.tipo === 'pasivo') {
                totalPasivos += valueToSumAndDisplay;
                pasivosListEl.appendChild(createDetailCard(item, finalDisplayValue));
            }
        }
        totalActivosEl.textContent = formatCurrency(totalActivos);
        totalPasivosEl.textContent = formatCurrency(totalPasivos);
        updateTotalsChart(totalActivos, totalPasivos);
        updateAssetCompositionChart(activosDataForChart);
        if (activosListEl.innerHTML === '') activosListEl.innerHTML = '<p class="text-gray-500">No hay cuentas de activo.</p>';
        if (pasivosListEl.innerHTML === '') pasivosListEl.innerHTML = '<p class="text-gray-500">No hay cuentas de pasivo.</p>';
        renderNotifications();
    });

    function createDetailCard(item, displayValue) {
        const href = pageMapping[item.nombre] || '#';
        const card = document.createElement('a');
        card.href = href;
        card.className = 'detail-card-link';
        card.innerHTML = `<div class="flex justify-between items-center"><span class="text-lg font-medium text-gray-800">${item.nombre}</span><div class="flex items-center space-x-2"><span class="text-xl font-semibold text-gray-900">${formatCurrency(displayValue)}</span><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg></div></div>`;
        return card;
    }

    function updateTotalsChart(activos, pasivos) {
        if (!totalsChartCtx) return;
        if (totalsChart) totalsChart.destroy();
        totalsChart = new Chart(totalsChartCtx, { type: 'bar', data: { labels: ['Finanzas'], datasets: [ { label: 'Activos', data: [activos], backgroundColor: 'rgba(34, 197, 94, 0.6)', borderColor: 'rgba(34, 197, 94, 1)', borderWidth: 1 }, { label: 'Pasivos', data: [pasivos], backgroundColor: 'rgba(239, 68, 68, 0.6)', borderColor: 'rgba(239, 68, 68, 1)', borderWidth: 1 } ] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } } });
    }

    function updateAssetCompositionChart(data) {
        if (!assetCompositionChartCtx) return;
        if (assetCompositionChart) assetCompositionChart.destroy();
        assetCompositionChart = new Chart(assetCompositionChartCtx, { type: 'doughnut', data: { labels: data.map(d => d.label), datasets: [{ label: 'Composición de Activos', data: data.map(d => d.value), backgroundColor: [ 'rgba(59, 130, 246, 0.7)', 'rgba(16, 185, 129, 0.7)', 'rgba(249, 115, 22, 0.7)', 'rgba(139, 92, 246, 0.7)', 'rgba(236, 72, 153, 0.7)', ], borderColor: '#ffffff', borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
    }

    async function renderCalendarWidget() {
        if (!calendarGrid) return;
        calendarGrid.innerHTML = '<div class="col-span-7 text-center py-10">Calculando flujo de caja...</div>';
        const { allEvents, saldoInicial } = await getFinancialDataForRange();
        const dailyTotals = allEvents;
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        monthYearDisplay.textContent = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentDate);
        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let runningBalance = saldoInicial;
        for (const dateStr in dailyTotals) { if (new Date(dateStr + 'T00:00:00') < firstDayOfMonth) { runningBalance += dailyTotals[dateStr].netChange; } }
        calendarGrid.innerHTML = '';
        for (let i = 0; i < firstDayOfMonth.getDay(); i++) calendarGrid.innerHTML += `<div class="calendar-day other-month"></div>`;
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const totals = dailyTotals[dateStr] || { netChange: 0 };
            runningBalance += totals.netChange;
            const isToday = new Date(dateStr+'T00:00:00').toDateString() === new Date().toDateString();
            const balanceClass = runningBalance >= 0 ? 'positive-balance' : 'negative-balance';
            let dayHtml = `<a href="calendario.html?date=${dateStr}" class="calendar-day-link ${isToday ? 'today' : ''} ${balanceClass}"><div class="day-number">${day}</div><div class="day-content"><div class="day-balance">${calendarFormat(runningBalance)}</div></div></a>`;
            calendarGrid.innerHTML += dayHtml;
        }
    }
    
    if (prevMonthBtn && nextMonthBtn) {
        prevMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendarWidget(); });
        nextMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendarWidget(); });
    }

    weeklySummaryBtn.addEventListener('click', generateWeeklySummary);
    closeSummaryModalBtn.addEventListener('click', () => {
        summaryModal.classList.add('hidden');
        summaryModal.classList.remove('flex');
    });

    renderCalendarWidget();
});
