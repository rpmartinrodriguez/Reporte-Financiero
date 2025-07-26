import { db, authReady } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

authReady.then(() => {
    // --- CONFIGURACIÓN Y CONSTANTES ---
    const ITEM_NAME = "Cheques en cartera";
    const SUBCOLLECTION_NAME = "cheques_detalle_cartera";
    const ITEM_TYPE = "activo";

    // --- ELEMENTOS DEL DOM ---
    const detailTableContainer = document.getElementById('detail-table-container');
    const dataForm = document.getElementById('data-form');
    const searchInput = document.getElementById('search-input');
    const statusFilter = document.getElementById('status-filter');
    const paginationContainer = document.getElementById('pagination-container');
    // Modal de IA
    const reminderModal = document.getElementById('reminder-modal');
    const closeModalButton = document.getElementById('close-modal-button');
    const reminderText = document.getElementById('reminder-text');
    const copyButton = document.getElementById('copy-button');
    const loadingAI = document.getElementById('loading-ai');
    // Modal de Depósito
    const depositModal = document.getElementById('deposit-modal');
    const closeDepositModalButton = document.getElementById('close-deposit-modal');
    const depositForm = document.getElementById('deposit-form');
    const ventaChequeFields = document.getElementById('venta-cheque-fields');
    const confirmDepositBtn = document.getElementById('confirm-deposit-btn');
    
    // --- ESTADO GLOBAL DE LA PÁGINA ---
    let allDocs = [];
    let currentPage = 1;
    const ITEMS_PER_PAGE = 5;

    // --- FUNCIONES AUXILIARES ---
    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    // --- LÓGICA DE IA (GEMINI) ---
    async function generateReminder(librador, monto, fechaCobro) {
        reminderModal.classList.remove('hidden');
        reminderModal.classList.add('flex');
        loadingAI.classList.remove('hidden');
        reminderText.classList.add('hidden');
        copyButton.classList.add('hidden');
        const prompt = `Escribe un recordatorio amigable y profesional para enviar por WhatsApp a nuestro cliente. El nombre del cliente es '${librador}'. El motivo es recordarle que tenemos un cheque suyo por un monto de ${formatCurrency(monto)} con fecha de cobro el ${fechaCobro}. El tono debe ser cordial pero claro, para asegurar que tenga los fondos disponibles en su cuenta en esa fecha. No incluyas placeholders como "[Tu Nombre]".`;
        try {
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=`;
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`Error de red: ${response.statusText}`);
            const result = await response.json();
            if (result.candidates && result.candidates.length > 0) {
                reminderText.value = result.candidates[0].content.parts[0].text;
                loadingAI.classList.add('hidden');
                reminderText.classList.remove('hidden');
                copyButton.classList.remove('hidden');
            } else { throw new Error("No se recibió una respuesta válida de la IA."); }
        } catch (error) {
            console.error("Error llamando a la API de Gemini:", error);
            reminderText.value = "Hubo un error al generar el recordatorio.";
            loadingAI.classList.add('hidden');
            reminderText.classList.remove('hidden');
        }
    }

    // --- LÓGICA DE NEGOCIO (FLUJOS DE TRABAJO) ---
    async function processDeposit(e) {
        e.preventDefault();
        const chequeId = document.getElementById('deposit-cheque-id').value;
        const chequeData = JSON.parse(document.getElementById('deposit-cheque-data').value);
        const reason = depositForm.querySelector('input[name="deposit_reason"]:checked').value;

        try {
            await runTransaction(db, async (transaction) => {
                const itemsRef = collection(db, 'items');
                
                const carteraQuery = query(itemsRef, where("nombre", "==", "Cheques en cartera"));
                const carteraSnap = await getDocs(carteraQuery);
                if (carteraSnap.empty) throw new Error("Categoría 'Cheques en cartera' no encontrada.");
                const carteraDocRef = carteraSnap.docs[0].ref;
                const sourceChequeRef = doc(db, carteraDocRef.path, "cheques_detalle_cartera", chequeId);

                const carteraDoc = await transaction.get(carteraDocRef);
                const newCarteraTotal = (carteraDoc.data().valor || 0) - chequeData.monto;
                
                transaction.update(carteraDocRef, { valor: newCarteraTotal });
                transaction.delete(sourceChequeRef);

                if (reason === 'cobrar') {
                    const pendientesQuery = query(itemsRef, where("nombre", "==", "Cheques pendiente de cobro"));
                    let pendientesSnap = await getDocs(pendientesQuery);
                    let pendientesDocRef;
                    if (pendientesSnap.empty) {
                        const newDoc = await addDoc(itemsRef, { nombre: "Cheques pendiente de cobro", valor: 0, tipo: "activo" });
                        pendientesDocRef = doc(db, 'items', newDoc.id);
                    } else {
                        pendientesDocRef = pendientesSnap.docs[0].ref;
                    }
                    const pendientesDoc = await transaction.get(pendientesDocRef);
                    const newPendientesTotal = (pendientesDoc.data()?.valor || 0) + chequeData.monto;
                    const newChequeData = { ...chequeData, estado: "Depositado" };
                    transaction.update(pendientesDocRef, { valor: newPendientesTotal });
                    transaction.set(doc(collection(pendientesDocRef, "cheques_detalle_pendientes")), newChequeData);
                } else if (reason === 'venta') {
                    const montoAcreditar = parseFloat(document.getElementById('venta-monto-acreditar').value);
                    const gastosVenta = chequeData.monto - montoAcreditar;

                    const bancosQuery = query(itemsRef, where("nombre", "==", "Saldo Bancario"));
                    let bancosSnap = await getDocs(bancosQuery);
                    let bancosDocRef;
                    if (bancosSnap.empty) {
                        const newDoc = await addDoc(itemsRef, { nombre: "Saldo Bancario", valor: 0, tipo: "activo" });
                        bancosDocRef = doc(db, 'items', newDoc.id);
                    } else {
                        bancosDocRef = bancosSnap.docs[0].ref;
                    }
                    const bancosDoc = await transaction.get(bancosDocRef);
                    const newBancoTotal = (bancosDoc.data()?.valor || 0) + montoAcreditar - gastosVenta;
                    transaction.update(bancosDocRef, { valor: newBancoTotal });
                    
                    const today = new Date().toISOString().split('T')[0];
                    const ingresoData = { fecha: today, descripcion: `Venta cheque N°${chequeData.numero_cheque}`, monto: montoAcreditar };
                    const gastoData = { fecha: today, descripcion: `Gastos venta cheque N°${chequeData.numero_cheque}`, monto: -gastosVenta };
                    
                    transaction.set(doc(collection(bancosDocRef, "movimientos_bancarios")), ingresoData);
                    transaction.set(doc(collection(bancosDocRef, "movimientos_bancarios")), gastoData);
                }
            });
            alert("¡Operación completada con éxito!");
            depositModal.classList.add('hidden');
        } catch (error) {
            console.error("Error en la transacción:", error);
            alert("Hubo un error al procesar la operación.");
        }
    }

    // --- LÓGICA DE RENDERIZADO Y FILTROS ---
    function applyFiltersAndPagination() {
        const searchTerm = searchInput.value.toLowerCase();
        const status = statusFilter.value;
        const filteredDocs = allDocs.filter(doc => {
            const data = doc.data();
            const matchesSearch = searchTerm === '' || Object.values(data).some(value => String(value).toLowerCase().includes(searchTerm));
            const matchesStatus = status === 'todos' || data.estado === status;
            return matchesSearch && matchesStatus;
        });
        renderDetails(filteredDocs);
    }

    function renderPagination(totalItems) {
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        if (totalPages <= 1) return;
        const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
        const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);
        paginationContainer.innerHTML = `
            <div class="pagination-info">Mostrando ${startItem}-${endItem} de ${totalItems}</div>
            <div class="pagination-buttons">
                <button id="prev-page" class="pagination-button" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>
                <button id="next-page" class="pagination-button" ${currentPage === totalPages ? 'disabled' : ''}>Siguiente</button>
            </div>
        `;
        document.getElementById('prev-page')?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; applyFiltersAndPagination(); } });
        document.getElementById('next-page')?.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; applyFiltersAndPagination(); } });
    }

    function renderDetails(docs) {
        renderPagination(docs.length);
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const pageDocs = docs.slice(startIndex, endIndex);

        if (pageDocs.length === 0) {
            detailTableContainer.innerHTML = '<p class="text-center text-gray-500">No se encontraron resultados.</p>';
            return;
        }
        detailTableContainer.innerHTML = '<div class="details-grid"></div>';
        const grid = detailTableContainer.querySelector('.details-grid');
        pageDocs.forEach(doc => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'detail-card';
            const statusClass = { 'En cartera': 'status-en-cartera', 'Depositado': 'status-depositado' }[data.estado] || 'status-en-cartera';
            card.innerHTML = `
                <div class="card-header"><h3 class="card-title">${data.librador}</h3><span class="status-badge ${statusClass}">${data.estado}</span></div>
                <div class="card-body">
                    <div class="card-main-info"><p class="card-main-label">Monto del Cheque</p><p class="card-amount positive">${formatCurrency(data.monto)}</p></div>
                    <div class="card-secondary-info">
                        <div class="info-item"><p class="info-label">Fecha Cobro</p><p class="info-value">${data.fecha_cobro}</p></div>
                        <div class="info-item"><p class="info-label">Nº Cheque</p><p class="info-value font-mono">${data.numero_cheque}</p></div>
                        <div class="info-item"><p class="info-label">Banco</p><p class="info-value">${data.banco}</p></div>
                    </div>
                </div>
                <div class="card-footer">
                    <button class="action-button secondary deposit-cheque-btn" data-id="${doc.id}" data-cheque='${JSON.stringify(data)}'>Depositar</button>
                    <button class="action-button primary generate-reminder-btn" data-librador="${data.librador}" data-monto="${data.monto}" data-fecha="${data.fecha_cobro}">✨ Recordatorio</button>
                </div>
            `;
            grid.appendChild(card);
        });
        
        detailTableContainer.querySelectorAll('.generate-reminder-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const { librador, monto, fecha } = e.currentTarget.dataset;
                generateReminder(librador, monto, fecha);
            });
        });
        detailTableContainer.querySelectorAll('.deposit-cheque-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const chequeId = e.currentTarget.dataset.id;
                const chequeData = JSON.parse(e.currentTarget.dataset.cheque);
                document.getElementById('deposit-cheque-id').value = chequeId;
                document.getElementById('deposit-cheque-data').value = JSON.stringify(chequeData);
                document.getElementById('deposit-librador').textContent = chequeData.librador;
                document.getElementById('deposit-monto').textContent = formatCurrency(chequeData.monto);
                const montoAcreditarInput = document.getElementById('venta-monto-acreditar');
                montoAcreditarInput.value = chequeData.monto.toFixed(2);
                document.getElementById('venta-gastos').value = '0.00';
                montoAcreditarInput.oninput = () => {
                    const gastos = chequeData.monto - (parseFloat(montoAcreditarInput.value) || 0);
                    document.getElementById('venta-gastos').value = gastos.toFixed(2);
                };
                depositModal.classList.remove('hidden');
                depositModal.classList.add('flex');
            });
        });
    }

    async function initializePage() {
        searchInput.addEventListener('input', () => { currentPage = 1; applyFiltersAndPagination(); });
        statusFilter.addEventListener('change', () => { currentPage = 1; applyFiltersAndPagination(); });
        const itemsRef = collection(db, 'items');
        let mainDocRef;
        const q = query(itemsRef, where("nombre", "==", ITEM_NAME));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            const newMainDoc = await addDoc(itemsRef, { nombre: ITEM_NAME, valor: 0, tipo: ITEM_TYPE });
            mainDocRef = doc(db, 'items', newMainDoc.id);
        } else {
            mainDocRef = querySnapshot.docs[0].ref;
        }
        const subcollectionRef = collection(mainDocRef, SUBCOLLECTION_NAME);
        onSnapshot(subcollectionRef, (snapshot) => {
            allDocs = snapshot.docs.sort((a, b) => new Date(b.data().fecha_cobro) - new Date(a.data().fecha_cobro));
            applyFiltersAndPagination();
        });
        dataForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(dataForm);
            const newDocData = {};
            for (const [key, value] of formData.entries()) {
                newDocData[key] = dataForm.elements[key].type === 'number' ? parseFloat(value) : value;
            }
            const amountToUpdate = newDocData.monto || 0;
            await runTransaction(db, async (t) => {
                const mainDoc = await t.get(mainDocRef);
                if (!mainDoc.exists()) throw "Doc principal no existe!";
                const newTotal = (mainDoc.data().valor || 0) + amountToUpdate;
                t.update(mainDocRef, { valor: newTotal });
                t.set(doc(subcollectionRef), newDocData);
            });
            dataForm.reset();
        });
    }

    closeModalButton.addEventListener('click', () => reminderModal.classList.add('hidden'));
    copyButton.addEventListener('click', () => {
        reminderText.select();
        document.execCommand('copy');
        copyButton.textContent = '¡Copiado!';
        setTimeout(() => { copyButton.textContent = 'Copiar Texto'; }, 2000);
    });
    closeDepositModalButton.addEventListener('click', () => depositModal.classList.add('hidden'));
    depositForm.addEventListener('submit', processDeposit);
    depositForm.querySelectorAll('input[name="deposit_reason"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isVenta = e.target.value === 'venta';
            ventaChequeFields.classList.toggle('hidden', !isVenta);
            confirmDepositBtn.textContent = isVenta ? 'Confirmar Venta' : 'Confirmar Depósito';
        });
    });

    initializePage();
});
