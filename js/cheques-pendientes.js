import { db, authReady } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

authReady.then(() => {
    const ITEM_NAME = "Cheques pendiente de cobro";
    const SUBCOLLECTION_NAME = "cheques_detalle_pendientes";
    const ITEM_TYPE = "activo";

    const detailTableContainer = document.getElementById('detail-table-container');
    const dataForm = document.getElementById('data-form');
    const searchInput = document.getElementById('search-input');
    const statusFilter = document.getElementById('status-filter');
    const paginationContainer = document.getElementById('pagination-container');
    const editModal = document.getElementById('edit-modal');
    const closeEditModalButton = document.getElementById('close-edit-modal');
    const editForm = document.getElementById('edit-form');
    const deleteChequeBtn = document.getElementById('delete-cheque-btn');
    const editEstadoSelect = document.getElementById('edit-estado');
    const editVentaFields = document.getElementById('edit-venta-fields');
    const editMontoAcreditadoInput = document.getElementById('edit-monto-acreditado');
    const editDescuentoInput = document.getElementById('edit-descuento');
    const editMontoInput = document.getElementById('edit-monto');

    let allDocs = [];
    let currentPage = 1;
    const ITEMS_PER_PAGE = 5;

    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    async function getOrCreateMainItemRef(itemName, itemType) {
        const itemsRef = collection(db, 'items');
        const q = query(itemsRef, where("nombre", "==", itemName));
        let snapshot = await getDocs(q);
        if (snapshot.empty) {
            const newDoc = await addDoc(itemsRef, { nombre: itemName, valor: 0, tipo: itemType });
            return doc(db, 'items', newDoc.id);
        } else {
            return snapshot.docs[0].ref;
        }
    }

    async function acreditarCheque(chequeId, chequeData) {
        if (!confirm(`¿Confirmas que el cheque de ${chequeData.librador} por ${formatCurrency(chequeData.monto)} se ha acreditado en tu cuenta bancaria?`)) return;
        try {
            await runTransaction(db, async (transaction) => {
                const pendientesDocRef = await getOrCreateMainItemRef(ITEM_NAME, ITEM_TYPE);
                const sourceChequeRef = doc(db, pendientesDocRef.path, SUBCOLLECTION_NAME, chequeId);
                const bancosDocRef = await getOrCreateMainItemRef("Saldo Bancario", "activo");
                const newMovimientoRef = doc(collection(bancosDocRef, "movimientos_bancarios"));
                const pendientesDoc = await transaction.get(pendientesDocRef);
                const bancosDoc = await transaction.get(bancosDocRef);
                const monto = chequeData.monto;
                const newPendientesTotal = (pendientesDoc.data().valor || 0) - monto;
                const newBancosTotal = (bancosDoc.data()?.valor || 0) + monto;
                const newMovimientoData = {
                    fecha: new Date().toISOString().split('T')[0],
                    descripcion: `Acreditación cheque N°${chequeData.numero_cheque} de ${chequeData.librador}`,
                    monto: monto
                };
                transaction.update(pendientesDocRef, { valor: newPendientesTotal });
                transaction.update(bancosDocRef, { valor: newBancosTotal });
                transaction.delete(sourceChequeRef);
                transaction.set(newMovimientoRef, newMovimientoData);
            });
            alert("¡Cheque acreditado con éxito! El saldo bancario ha sido actualizado.");
        } catch (error) {
            console.error("Error al acreditar el cheque:", error);
            alert("Hubo un error al procesar la acreditación.");
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
            const statusClass = { 'Pendiente de cobro': 'status-pendiente', 'Acreditado': 'status-acreditado', 'Rechazado': 'status-rechazado', 'Depositado': 'status-depositado', 'Vendido': 'status-vencido' }[data.estado] || 'status-pendiente';
            card.innerHTML = `
                <div class="card-header"><h3 class="card-title">${data.librador}</h3><span class="status-badge ${statusClass}">${data.estado}</span></div>
                <div class="card-body">
                    <div class="card-main-info"><p class="card-main-label">Monto del Cheque</p><p class="card-amount positive">${formatCurrency(data.monto)}</p></div>
                    <div class="card-secondary-info">
                        <div class="info-item"><p class="info-label">Fecha Cobro</p><p class="info-value">${data.fecha_cobro}</p></div>
                        <div class="info-item"><p class="info-label">Nº Cheque</p><p class="info-value font-mono">${data.numero_cheque}</p></div>
                        <div class="info-item"><p class="info-label">Banco</p><p class="info-value">${data.banco}</p></div>
                    </div>
                    ${data.estado === 'Vendido' && data.venta_info ? `<div class="mt-4 text-center text-sm text-gray-600 bg-gray-50 p-2 rounded-md">Vendido a ${data.venta_info.vendido_a} por ${formatCurrency(data.venta_info.monto_acreditado)}</div>` : ''}
                </div>
                <div class="card-footer">
                    <button class="action-button secondary edit-cheque-btn" data-id="${doc.id}" data-cheque='${JSON.stringify(data)}'>Editar</button>
                    ${data.estado === 'Depositado' ? `<button class="action-button success acreditar-cheque-btn" data-id="${doc.id}" data-cheque='${JSON.stringify(data)}'>Acreditar</button>` : ''}
                </div>
            `;
            grid.appendChild(card);
        });

        assignActionListeners();
    }

    function assignActionListeners() {
        detailTableContainer.querySelectorAll('.acreditar-cheque-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const chequeId = e.currentTarget.dataset.id;
                const chequeData = JSON.parse(e.currentTarget.dataset.cheque);
                acreditarCheque(chequeId, chequeData);
            });
        });

        detailTableContainer.querySelectorAll('.edit-cheque-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const chequeId = e.currentTarget.dataset.id;
                const chequeData = JSON.parse(e.currentTarget.dataset.cheque);
                document.getElementById('edit-cheque-id').value = chequeId;
                document.getElementById('edit-cheque-original-monto').value = chequeData.monto;
                document.getElementById('edit-fecha_emision').value = chequeData.fecha_emision;
                document.getElementById('edit-fecha_cobro').value = chequeData.fecha_cobro;
                document.getElementById('edit-numero_cheque').value = chequeData.numero_cheque;
                document.getElementById('edit-librador').value = chequeData.librador;
                document.getElementById('edit-banco').value = chequeData.banco;
                editMontoInput.value = chequeData.monto;
                editEstadoSelect.value = chequeData.estado;

                // Reset and hide venta fields initially
                editVentaFields.classList.add('hidden');
                editMontoAcreditadoInput.value = '';
                editDescuentoInput.value = '';
                document.getElementById('edit-vendido-a').value = '';

                editModal.classList.remove('hidden');
                editModal.classList.add('flex');
            });
        });
    }

    async function initializePage() {
        searchInput.addEventListener('input', () => { currentPage = 1; applyFiltersAndPagination(); });
        statusFilter.addEventListener('change', () => { currentPage = 1; applyFiltersAndPagination(); });
        
        const mainDocRef = await getOrCreateMainItemRef(ITEM_NAME, ITEM_TYPE);
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
                const newTotal = (mainDoc.data().valor || 0) + amountToUpdate;
                t.update(mainDocRef, { valor: newTotal });
                t.set(doc(subcollectionRef), newDocData);
            });
            dataForm.reset();
        });

        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const chequeId = document.getElementById('edit-cheque-id').value;
            const originalMonto = parseFloat(document.getElementById('edit-cheque-original-monto').value);
            const newStatus = editEstadoSelect.value;
            
            try {
                await runTransaction(db, async (transaction) => {
                    const chequeRef = doc(db, mainDocRef.path, SUBCOLLECTION_NAME, chequeId);
                    const mainDoc = await transaction.get(mainDocRef);
                    if (!mainDoc.exists()) throw "El documento principal no existe.";

                    if (newStatus === 'Vendido') {
                        const montoAcreditado = parseFloat(editMontoAcreditadoInput.value);
                        const descuento = originalMonto - montoAcreditado;
                        const vendidoA = document.getElementById('edit-vendido-a').value;

                        const bancosDocRef = await getOrCreateMainItemRef("Saldo Bancario", "activo");
                        const bancosDoc = await transaction.get(bancosDocRef);

                        const newPendientesTotal = (mainDoc.data().valor || 0) - originalMonto;
                        const newBancoTotal = (bancosDoc.data()?.valor || 0) + montoAcreditado - descuento;
                        
                        transaction.update(mainDocRef, { valor: newPendientesTotal });
                        transaction.update(bancosDocRef, { valor: newBancoTotal });
                        
                        const today = new Date().toISOString().split('T')[0];
                        const ingresoData = { fecha: today, descripcion: `Venta cheque N°${document.getElementById('edit-numero_cheque').value}`, monto: montoAcreditado };
                        const gastoData = { fecha: today, descripcion: `Gastos venta cheque N°${document.getElementById('edit-numero_cheque').value}`, monto: -descuento };
                        transaction.set(doc(collection(bancosDocRef, "movimientos_bancarios")), ingresoData);
                        transaction.set(doc(collection(bancosDocRef, "movimientos_bancarios")), gastoData);
                        
                        const updatedData = { estado: 'Vendido', venta_info: { vendido_a: vendidoA, monto_acreditado: montoAcreditado, descuento: descuento } };
                        transaction.update(chequeRef, updatedData);

                    } else { // Handle regular edits
                        const updatedData = {
                            fecha_emision: document.getElementById('edit-fecha_emision').value,
                            fecha_cobro: document.getElementById('edit-fecha_cobro').value,
                            numero_cheque: document.getElementById('edit-numero_cheque').value,
                            librador: document.getElementById('edit-librador').value,
                            banco: document.getElementById('edit-banco').value,
                            monto: parseFloat(editMontoInput.value),
                            estado: newStatus
                        };
                        const montoDifference = updatedData.monto - originalMonto;
                        const newTotal = (mainDoc.data().valor || 0) + montoDifference;
                        transaction.update(mainDocRef, { valor: newTotal });
                        transaction.update(chequeRef, updatedData);
                    }
                });
                alert("Cheque actualizado con éxito.");
                editModal.classList.add('hidden');
            } catch (error) {
                console.error("Error al actualizar el cheque:", error);
                alert("Hubo un error al guardar los cambios.");
            }
        });

        deleteChequeBtn.addEventListener('click', async () => {
            const chequeId = document.getElementById('edit-cheque-id').value;
            const monto = parseFloat(document.getElementById('edit-cheque-original-monto').value);
            if (confirm("¿Estás seguro de que quieres eliminar este cheque permanentemente?")) {
                try {
                    const chequeRef = doc(db, mainDocRef.path, SUBCOLLECTION_NAME, chequeId);
                    await runTransaction(db, async (transaction) => {
                        const mainDoc = await transaction.get(mainDocRef);
                        if (!mainDoc.exists()) throw "El documento principal no existe.";
                        const newTotal = (mainDoc.data().valor || 0) - monto;
                        transaction.update(mainDocRef, { valor: newTotal });
                        transaction.delete(chequeRef);
                    });
                    alert("Cheque eliminado con éxito.");
                    editModal.classList.add('hidden');
                } catch (error) {
                    console.error("Error al eliminar el cheque:", error);
                    alert("Hubo un error al eliminar el cheque.");
                }
            }
        });

        editEstadoSelect.addEventListener('change', () => {
            editVentaFields.classList.toggle('hidden', editEstadoSelect.value !== 'Vendido');
        });

        editMontoAcreditadoInput.addEventListener('input', () => {
            const originalMonto = parseFloat(document.getElementById('edit-cheque-original-monto').value);
            const montoAcreditado = parseFloat(editMontoAcreditadoInput.value) || 0;
            editDescuentoInput.value = (originalMonto - montoAcreditado).toFixed(2);
        });
    }

    closeEditModalButton.addEventListener('click', () => editModal.classList.add('hidden'));
    initializePage();
});
