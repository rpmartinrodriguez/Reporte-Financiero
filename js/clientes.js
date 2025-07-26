import { db, authReady } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

authReady.then(() => {
    // --- CONFIGURACIÓN Y CONSTANTES ---
    const ITEM_NAME = "Clientes a Cobrar";
    const SUBCOLLECTION_NAME = "facturas";
    const ITEM_TYPE = "activo";

    // --- ELEMENTOS DEL DOM ---
    const detailTableContainer = document.getElementById('detail-table-container');
    const dataForm = document.getElementById('data-form');
    const searchInput = document.getElementById('search-input');
    const statusFilter = document.getElementById('status-filter');
    const paginationContainer = document.getElementById('pagination-container');
    const paymentModal = document.getElementById('payment-modal');
    const closePaymentModalButton = document.getElementById('close-payment-modal');
    const paymentForm = document.getElementById('payment-form');
    const addPaymentMethodButton = document.getElementById('add-payment-method');
    const paymentMethodsContainer = document.getElementById('payment-methods-container');
    const invoiceTotalDisplay = document.getElementById('invoice-total-display');
    const coveredTotalDisplay = document.getElementById('covered-total-display');
    const remainingTotalDisplay = document.getElementById('remaining-total-display');
    const confirmPaymentBtn = document.getElementById('confirm-payment-btn');
    
    // --- ESTADO GLOBAL DE LA PÁGINA ---
    let allDocs = [];
    let currentPage = 1;
    const ITEMS_PER_PAGE = 5;
    let paymentMethodCounter = 0;

    // --- FUNCIONES AUXILIARES ---
    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    // --- LÓGICA DEL FORMULARIO DE CARGA DE FACTURAS ---
    const saldoBrutoInput = dataForm.elements.saldo_bruto;
    const ivaInput = dataForm.elements.iva;
    const saldoNetoInput = dataForm.elements.saldo_neto;
    saldoBrutoInput.addEventListener('input', () => {
        const bruto = parseFloat(saldoBrutoInput.value) || 0;
        const iva = bruto * 0.21;
        const neto = bruto + iva;
        ivaInput.value = iva.toFixed(2);
        saldoNetoInput.value = neto.toFixed(2);
    });

    // --- LÓGICA DEL MODAL DE PAGO MÚLTIPLE ---
    function addPaymentRow() {
        paymentMethodCounter++;
        const row = document.createElement('div');
        row.className = 'payment-method-row border p-3 rounded-lg';
        row.innerHTML = `
            <div class="flex justify-end mb-2"><button type="button" class="remove-payment-row text-red-500 text-xs">&times; Quitar</button></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="form-label">Método</label>
                    <select name="metodo_${paymentMethodCounter}" class="form-input payment-method-select">
                        <option value="Efectivo">Efectivo</option><option value="Transferencia">Transferencia</option><option value="Cheque">Cheque</option>
                    </select>
                </div>
                <div><label class="form-label">Monto</label><input type="number" name="monto_${paymentMethodCounter}" class="form-input payment-amount-input" step="0.01" required></div>
            </div>
            <div class="cheque-fields-dynamic hidden space-y-2 mt-2 border-t pt-2">
                <div><label class="form-label text-xs">Nº Cheque</label><input type="text" name="cheque_numero_${paymentMethodCounter}" class="form-input text-sm"></div>
                <div><label class="form-label text-xs">Banco</label><input type="text" name="cheque_banco_${paymentMethodCounter}" class="form-input text-sm"></div>
                <div><label class="form-label text-xs">Fecha Cobro</label><input type="date" name="cheque_fecha_cobro_${paymentMethodCounter}" class="form-input text-sm"></div>
            </div>
        `;
        paymentMethodsContainer.appendChild(row);
    }

    function updatePaymentTotals() {
        const totalInvoice = parseFloat(invoiceTotalDisplay.dataset.rawAmount) || 0;
        let totalCovered = 0;
        paymentMethodsContainer.querySelectorAll('.payment-amount-input').forEach(input => {
            totalCovered += parseFloat(input.value) || 0;
        });
        const remaining = totalInvoice - totalCovered;
        coveredTotalDisplay.textContent = formatCurrency(totalCovered);
        remainingTotalDisplay.textContent = formatCurrency(remaining);
        if (Math.abs(remaining) < 0.01) {
            remainingTotalDisplay.classList.remove('text-red-600');
            remainingTotalDisplay.classList.add('text-green-600');
            confirmPaymentBtn.disabled = false;
        } else {
            remainingTotalDisplay.classList.add('text-red-600');
            remainingTotalDisplay.classList.remove('text-green-600');
            confirmPaymentBtn.disabled = true;
        }
    }

    paymentMethodsContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('payment-method-select')) {
            const chequeFields = e.target.closest('.payment-method-row').querySelector('.cheque-fields-dynamic');
            chequeFields.classList.toggle('hidden', e.target.value !== 'Cheque');
        }
    });
    paymentMethodsContainer.addEventListener('input', (e) => { if (e.target.classList.contains('payment-amount-input')) { updatePaymentTotals(); } });
    paymentMethodsContainer.addEventListener('click', (e) => { if (e.target.classList.contains('remove-payment-row')) { e.target.closest('.payment-method-row').remove(); updatePaymentTotals(); } });
    addPaymentMethodButton.addEventListener('click', addPaymentRow);

    async function registerPayment(e) {
        e.preventDefault();
        const invoiceId = document.getElementById('invoice-id').value;
        const clientName = document.getElementById('invoice-client').value;
        const totalAmount = parseFloat(invoiceTotalDisplay.dataset.rawAmount);
        const paymentMethods = [];
        let paymentSummary = [];
        paymentMethodsContainer.querySelectorAll('.payment-method-row').forEach(row => {
            const method = row.querySelector('.payment-method-select').value;
            const amount = parseFloat(row.querySelector('.payment-amount-input').value);
            paymentSummary.push(`${method}: ${formatCurrency(amount)}`);
            const payment = { method, amount };
            if (method === 'Cheque') {
                payment.numero = row.querySelector('input[name^="cheque_numero"]').value;
                payment.banco = row.querySelector('input[name^="cheque_banco"]').value;
                payment.fecha_cobro = row.querySelector('input[name^="cheque_fecha_cobro"]').value;
            }
            paymentMethods.push(payment);
        });
        try {
            await runTransaction(db, async (transaction) => {
                const itemsRef = collection(db, 'items');
                const clientesQuery = query(itemsRef, where("nombre", "==", ITEM_NAME));
                const clientesSnap = await getDocs(clientesQuery);
                if (clientesSnap.empty) throw new Error("Categoría 'Clientes a Cobrar' no encontrada.");
                const clientesDocRef = clientesSnap.docs[0].ref;
                const invoiceRef = doc(db, clientesDocRef.path, SUBCOLLECTION_NAME, invoiceId);
                transaction.update(invoiceRef, { estado: "Cobrado", pago_info: `Cobrado (${paymentSummary.join(', ')})` });
                const clientesDoc = await transaction.get(clientesDocRef);
                const newClientesTotal = (clientesDoc.data().valor || 0) - totalAmount;
                transaction.update(clientesDocRef, { valor: newClientesTotal });
                const today = new Date().toISOString().split('T')[0];
                for (const payment of paymentMethods) {
                    if (payment.method === "Cheque") {
                        const chequesCarteraQuery = query(itemsRef, where("nombre", "==", "Cheques en cartera"));
                        let chequesCarteraSnap = await getDocs(chequesCarteraQuery);
                        let chequesCarteraDocRef;
                        if (chequesCarteraSnap.empty) {
                            const newDoc = await addDoc(itemsRef, { nombre: "Cheques en cartera", valor: 0, tipo: "activo" });
                            chequesCarteraDocRef = doc(db, 'items', newDoc.id);
                        } else { chequesCarteraDocRef = chequesCarteraSnap.docs[0].ref; }
                        const chequeData = { fecha_emision: today, fecha_cobro: payment.fecha_cobro, numero_cheque: payment.numero, banco: payment.banco, librador: clientName, monto: payment.amount, estado: "En cartera" };
                        const chequesCarteraDoc = await transaction.get(chequesCarteraDocRef);
                        const newChequesTotal = (chequesCarteraDoc.data()?.valor || 0) + payment.amount;
                        transaction.update(chequesCarteraDocRef, { valor: newChequesTotal });
                        transaction.set(doc(collection(chequesCarteraDocRef, "cheques_detalle_cartera")), chequeData);
                    } else {
                        const targetItemName = payment.method === "Efectivo" ? "Saldo Efectivo" : "Saldo Bancario";
                        const targetSubcollection = payment.method === "Efectivo" ? "movimientos_caja" : "movimientos_bancarios";
                        const targetQuery = query(itemsRef, where("nombre", "==", targetItemName));
                        let targetSnap = await getDocs(targetQuery);
                        let targetDocRef;
                        if (targetSnap.empty) {
                            const newDoc = await addDoc(itemsRef, { nombre: targetItemName, valor: 0, tipo: "activo" });
                            targetDocRef = doc(db, 'items', newDoc.id);
                        } else { targetDocRef = targetSnap.docs[0].ref; }
                        const movimientoData = { fecha: today, descripcion: `Cobro factura a ${clientName}`, monto: payment.amount };
                        const targetDoc = await transaction.get(targetDocRef);
                        const newTotal = (targetDoc.data()?.valor || 0) + payment.amount;
                        transaction.update(targetDocRef, { valor: newTotal });
                        transaction.set(doc(collection(targetDocRef, targetSubcollection)), movimientoData);
                    }
                }
            });
            alert("¡Cobro registrado con éxito!");
            paymentModal.classList.add('hidden');
        } catch (error) {
            console.error("Error al registrar el cobro:", error);
            alert("Hubo un error al procesar el cobro.");
        }
    }

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
            const isPaid = data.estado === 'Cobrado';
            const statusClass = { 'Pendiente': 'status-pendiente', 'Cobrado': 'status-cobrado', 'Vencido': 'status-vencido' }[data.estado] || 'status-pendiente';
            card.innerHTML = `
                <div class="card-header"><h3 class="card-title">${data.nombre}</h3><span class="status-badge ${statusClass}">${data.estado}</span></div>
                <div class="card-body">
                    <div class="card-main-info"><p class="card-main-label">Monto a Cobrar</p><p class="card-amount positive">${formatCurrency(data.saldo_neto)}</p></div>
                    <div class="card-secondary-info">
                        <div class="info-item"><p class="info-label">Fecha Factura</p><p class="info-value">${data.fecha}</p></div>
                        <div class="info-item"><p class="info-label">Nº Factura</p><p class="info-value font-mono">${data.numero_factura}</p></div>
                        <div class="info-item"><p class="info-label">Vencimiento</p><p class="info-value">${data.fecha_vencimiento}</p></div>
                    </div>
                    ${isPaid && data.pago_info ? `<div class="mt-4 text-center text-sm text-gray-600 bg-gray-50 p-2 rounded-md">${data.pago_info}</div>` : ''}
                </div>
                ${!isPaid ? `
                <div class="card-footer">
                    <button class="action-button success cobrar-btn" data-id="${doc.id}" data-amount="${data.saldo_neto}" data-client="${data.nombre}">Cobrar</button>
                </div>` : ''}
            `;
            grid.appendChild(card);
        });
        detailTableContainer.querySelectorAll('.cobrar-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const btn = e.currentTarget;
                document.getElementById('invoice-id').value = btn.dataset.id;
                document.getElementById('invoice-client').value = btn.dataset.client;
                const amount = parseFloat(btn.dataset.amount);
                invoiceTotalDisplay.textContent = formatCurrency(amount);
                invoiceTotalDisplay.dataset.rawAmount = amount;
                paymentMethodsContainer.innerHTML = '';
                addPaymentRow();
                paymentMethodsContainer.querySelector('.payment-amount-input').value = amount.toFixed(2);
                updatePaymentTotals();
                paymentModal.classList.remove('hidden');
                paymentModal.classList.add('flex');
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
            allDocs = snapshot.docs.sort((a, b) => new Date(b.data().fecha) - new Date(a.data().fecha));
            applyFiltersAndPagination();
        });
        dataForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(dataForm);
            const newDocData = {};
            for (const [key, value] of formData.entries()) {
                newDocData[key] = dataForm.elements[key].type === 'number' ? parseFloat(value) : value;
            }
            const amountToUpdate = newDocData.saldo_neto || 0;
            await runTransaction(db, async (t) => {
                const mainDoc = await t.get(mainDocRef);
                if (!mainDoc.exists()) throw "Doc principal no existe!";
                const newTotal = (mainDoc.data().valor || 0) + amountToUpdate;
                t.update(mainDocRef, { valor: newTotal });
                t.set(doc(subcollectionRef), newDocData);
            });
            dataForm.reset();
            ivaInput.value = '';
            saldoNetoInput.value = '';
        });
    }
    
    closePaymentModalButton.addEventListener('click', () => paymentModal.classList.add('hidden'));
    paymentForm.addEventListener('submit', registerPayment);
    initializePage();
});
