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
    const analyzeFlowBtn = document.getElementById('analyze-flow-btn');
    const aiAnalysisModal = document.getElementById('ai-analysis-modal');
    const closeAiModalBtn = document.getElementById('close-ai-modal');
    const aiModalContent = document.getElementById('ai-modal-content');
    
    let totalsChart;
    let assetCompositionChart;
    let currentDate = new Date();
    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
    const calendarFormat = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
    
    const pageMapping = { 
        "Saldo Bancario": "bancos.html",
        "Saldo Efectivo": "efectivo.html",
        "Clientes a Cobrar": "clientes.html", 
        "Cheques en cartera": "cheques-cartera.html", 
        "Cheques pendiente de cobro": "cheques-pendientes.html", 
        "Proveedores a pagar": "proveedores.html", 
        "Cheques a pagar": "cheques-pagar.html",
        "Gastos Fijos": "gastos-fijos.html"
    };
    
    // --- LÓGICA DE IA (GEMINI) ---
    async function analyzeCashFlow() {
        if (!aiAnalysisModal || !aiModalContent) return;
        aiAnalysisModal.classList.remove('hidden');
        aiAnalysisModal.classList.add('flex');
        aiModalContent.innerHTML = '<p class="text-center py-8">Recolectando y analizando datos financieros...</p>';

        const apiKey = window.VITE_GEMINI_API_KEY;
        if (!apiKey || apiKey.startsWith("%VITE_")) {
            aiModalContent.innerHTML = '<p class="text-red-500 text-center">Error: La clave de API de Gemini no está configurada. Por favor, añádela a las variables de entorno en Netlify y vuelve a desplegar el sitio.</p>';
            return;
        }

        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + 30);
        
        const { allEvents, saldoInicial } = await getFinancialDataForRange(null, futureDate);
        
        const dailyTotals = allEvents.reduce((acc, event) => {
            const date = event.date;
            if (!acc[date]) { acc[date] = { ingresos: 0, egresos: 0 }; }
            if (event.amount > 0) { acc[date].ingresos += event.amount; }
            else { acc[date].egresos += Math.abs(event.amount); }
            return acc;
        }, {});

        let runningBalance = saldoInicial;
        let projectionText = `Saldo inicial: ${formatCurrency(saldoInicial)}.\nProyección de flujo de caja para los próximos 30 días:\n`;
        
        for (let i = 0; i < 30; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const totals = dailyTotals[dateStr] || { ingresos: 0, egresos: 0 };
            runningBalance += totals.ingresos - totals.egresos;
            if (totals.ingresos !== 0 || totals.egresos !== 0) {
                projectionText += `- ${dateStr}: Ingresos: ${formatCurrency(totals.ingresos)}, Egresos: ${formatCurrency(totals.egresos)}, Saldo Proyectado: ${formatCurrency(runningBalance)}\n`;
            }
        }

        const prompt = `Actúa como un asesor financiero experto para una pequeña empresa. Analiza los siguientes datos de flujo de caja proyectado para los próximos 30 días. Tu tarea es identificar riesgos, resaltar oportunidades y dar recomendaciones claras y accionables. El análisis debe ser fácil de entender para alguien sin conocimientos financieros profundos.

        Datos del Flujo de Caja:
        ${projectionText}

        Tu respuesta debe estar formateada en HTML simple (usa p, h4, ul, li, strong) y debe incluir:
        1.  Un **Resumen General** de la situación financiera.
        2.  Una sección de **⚠️ Riesgos Potenciales** donde identifiques los días o semanas con mayor riesgo de falta de liquidez (cuando el saldo se acerca a cero o es negativo).
        3.  Una sección de **💡 Oportunidades y Sugerencias** con acciones concretas que el usuario puede tomar. Por ejemplo, si ves un pago grande a un proveedor antes de un cobro importante, sugiere negociar la fecha de pago. Si ves cheques por cobrar, sugiere contactar a los clientes. Sé específico.`;

        try {
            aiModalContent.innerHTML = '<p class="text-center py-8">La IA está pensando... Esto puede tardar unos segundos.</p>';
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`Error de red: ${response.statusText}`);
            const result = await response.json();
            if (result.candidates && result.candidates.length > 0) {
                aiModalContent.innerHTML = result.candidates[0].content.parts[0].text;
            } else { throw new Error("No se recibió una respuesta válida de la IA."); }
        } catch (error) {
            console.error("Error llamando a la API de Gemini:", error);
            aiModalContent.innerHTML = '<p class="text-red-500">Hubo un error al generar el análisis. Por favor, intenta de nuevo.</p>';
        }
    }

    // --- LÓGICA DE DATOS GENERAL ---
    async function getFinancialDataForRange(startDate, endDate) {
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
                    const eventDate = new Date(data[config.dateField] + 'T00:00:00');
                    if (data[config.dateField] && data[config.amountField] !== 0 && (!startDate || eventDate >= startDate) && (!endDate || eventDate <= endDate)) {
                        allEvents.push({ date: data[config.dateField], amount: data[config.amountField] * config.sign });
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
        return { allEvents, saldoInicial };
    }
    
    // --- LÓGICA DE NOTIFICACIONES ---
    async function renderNotifications() {
        if (!notificationsListEl) return;
        notificationsListEl.innerHTML = '<p class="text-gray-500">Buscando vencimientos...</p>';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysFromNow = new Date(today);
        sevenDaysFromNow.setDate(today.getDate() + 7);
        const itemsSnapshot = await getDocs(collection(db, 'items'));
        const allNotifications = [];
        const notificationConfigs = [ { name: "Clientes a Cobrar", sub: "facturas", dateField: "fecha_vencimiento", descField: "nombre", amountField: "saldo_neto", type: "cobro" }, { name: "Cheques en cartera", sub: "cheques_detalle_cartera", dateField: "fecha_cobro", descField: "librador", amountField: "monto", type: "deposito" }, { name: "Proveedores a pagar", sub: "facturas_proveedores", dateField: "fecha_vencimiento", descField: "proveedor", amountField: "saldo", type: "pago" } ];
        for (const config of notificationConfigs) {
            const parentDoc = itemsSnapshot.docs.find(doc => doc.data().nombre === config.name);
            if (parentDoc) {
                const subSnapshot = await getDocs(collection(db, 'items', parentDoc.id, config.sub));
                subSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.estado === "Pendiente" || data.estado === "En cartera") {
                        const eventDate = new Date(data[config.dateField] + 'T00:00:00');
                        if (eventDate <= sevenDaysFromNow) { allNotifications.push({ ...data, type: config.type, date: eventDate, desc: data[config.descField], amount: data[config.amountField] }); }
                    }
                });
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
            const iconClass = item.type === 'pago' ? 'overdue' : (isOverdue ? 'overdue' : (item.type === 'deposito' ? 'deposit' : 'upcoming'));
            const iconSVG = { pago: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>', cobro: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01"></path></svg>', deposito: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>' }[item.type];
            const text = { pago: `Pagar factura a <strong>${item.desc}</strong> por <strong>${formatCurrency(item.amount)}</strong>.`, cobro: `Cobrar factura a <strong>${item.desc}</strong> por <strong>${formatCurrency(item.amount)}</strong>.`, deposito: `Depositar cheque de <strong>${item.desc}</strong> por <strong>${formatCurrency(item.amount)}</strong>.` }[item.type];
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
                totalPasivos += finalDisplayValue;
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
        const { allEvents, saldoInicial } = await getFinancialDataForRange(null, null);
        const dailyTotals = allEvents.reduce((acc, event) => {
            if (!acc[event.date]) acc[event.date] = { netChange: 0 };
            acc[event.date].netChange += event.amount;
            return acc;
        }, {});
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

    analyzeFlowBtn.addEventListener('click', analyzeCashFlow);
    closeAiModalBtn.addEventListener('click', () => {
        aiAnalysisModal.classList.add('hidden');
        aiAnalysisModal.classList.remove('flex');
    });

    renderCalendarWidget();
});
