import { db, authReady } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

authReady.then(() => {
    const ITEM_NAME = "Saldo Efectivo";
    const SUBCOLLECTION_NAME = "movimientos_caja";
    const ITEM_TYPE = "activo";

    const detailTableContainer = document.getElementById('detail-table-container');
    const dataForm = document.getElementById('data-form');
    const paginationContainer = document.getElementById('pagination-container');
    const saldoCajaAdminEl = document.getElementById('saldo-caja-admin');
    const saldoCajaOpEl = document.getElementById('saldo-caja-op');
    const editModal = document.getElementById('edit-modal');
    const closeEditModalButton = document.getElementById('close-edit-modal');
    const editForm = document.getElementById('edit-form');
    const deleteMovimientoBtn = document.getElementById('delete-movimiento-btn');
    
    let allDocs = [];
    let currentPage = 1;
    const ITEMS_PER_PAGE = 10;

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

    function applyFiltersAndPagination() {
        renderDetails(allDocs);
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
            detailTableContainer.innerHTML = '<p class="text-center text-gray-500">No hay movimientos de caja registrados.</p>';
            return;
        }
        detailTableContainer.innerHTML = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead><tr>
                        <th class="th-style">Fecha</th>
                        <th class="th-style">Observaciones</th>
                        <th class="th-style text-right">Ingreso Caja Admin.</th>
                        <th class="th-style text-right">Egreso Caja Admin.</th>
                        <th class="th-style text-right">Ingreso Caja Op.</th>
                        <th class="th-style text-right">Egreso Caja Op.</th>
                        <th class="th-style text-right">Acciones</th>
                    </tr></thead>
                    <tbody class="bg-white divide-y divide-gray-200"></tbody>
                </table>
            </div>`;
        const tbody = detailTableContainer.querySelector('tbody');
        pageDocs.forEach(docSnap => {
            const data = docSnap.data();
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="td-style">${data.fecha}</td>
                <td class="td-style">${data.observaciones}</td>
                <td class="td-style text-right text-green-600">${data.monto_caja_admin > 0 ? formatCurrency(data.monto_caja_admin) : '-'}</td>
                <td class="td-style text-right text-red-600">${data.monto_caja_admin < 0 ? formatCurrency(Math.abs(data.monto_caja_admin)) : '-'}</td>
                <td class="td-style text-right text-green-600">${data.monto_caja_op > 0 ? formatCurrency(data.monto_caja_op) : '-'}</td>
                <td class="td-style text-right text-red-600">${data.monto_caja_op < 0 ? formatCurrency(Math.abs(data.monto_caja_op)) : '-'}</td>
                <td class="td-style text-right">
                    <button class="action-button secondary edit-movimiento-btn" data-id="${docSnap.id}" data-movimiento='${JSON.stringify(data)}'>Editar</button>
                </td>
            `;
            tbody.appendChild(row);
        });
        assignActionListeners();
    }

    function assignActionListeners() {
        detailTableContainer.querySelectorAll('.edit-movimiento-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const data = JSON.parse(e.currentTarget.dataset.movimiento);
                document.getElementById('edit-movimiento-id').value = id;
                document.getElementById('edit-original-monto-admin').value = data.monto_caja_admin;
                document.getElementById('edit-original-monto-op').value = data.monto_caja_op;
                document.getElementById('edit-fecha').value = data.fecha;
                document.getElementById('edit-observaciones').value = data.observaciones;
                document.getElementById('edit-ingreso_caja_admin').value = data.monto_caja_admin > 0 ? data.monto_caja_admin : '';
                document.getElementById('edit-egreso_caja_admin').value = data.monto_caja_admin < 0 ? -data.monto_caja_admin : '';
                document.getElementById('edit-ingreso_caja_op').value = data.monto_caja_op > 0 ? data.monto_caja_op : '';
                document.getElementById('edit-egreso_caja_op').value = data.monto_caja_op < 0 ? -data.monto_caja_op : '';
                editModal.classList.remove('hidden');
                editModal.classList.add('flex');
            });
        });
    }

    async function initializePage() {
        const mainDocRef = await getOrCreateMainItemRef(ITEM_NAME, ITEM_TYPE);
        const subcollectionRef = collection(mainDocRef, SUBCOLLECTION_NAME);

        onSnapshot(subcollectionRef, (snapshot) => {
            allDocs = snapshot.docs.sort((a, b) => new Date(b.data().fecha) - new Date(a.data().fecha));
            let saldoCajaAdmin = 0;
            let saldoCajaOp = 0;
            allDocs.forEach(doc => {
                saldoCajaAdmin += doc.data().monto_caja_admin || 0;
                saldoCajaOp += doc.data().monto_caja_op || 0;
            });
            saldoCajaAdminEl.textContent = formatCurrency(saldoCajaAdmin);
            saldoCajaOpEl.textContent = formatCurrency(saldoCajaOp);
            applyFiltersAndPagination();
        });

        dataForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const ingreso1 = parseFloat(document.getElementById('ingreso_caja_admin').value) || 0;
            const egreso1 = parseFloat(document.getElementById('egreso_caja_admin').value) || 0;
            const ingreso2 = parseFloat(document.getElementById('ingreso_caja_op').value) || 0;
            const egreso2 = parseFloat(document.getElementById('egreso_caja_op').value) || 0;
            const newDocData = {
                fecha: document.getElementById('fecha').value,
                observaciones: document.getElementById('observaciones').value,
                monto_caja_admin: ingreso1 - egreso1,
                monto_caja_op: ingreso2 - egreso2,
            };
            const totalChange = newDocData.monto_caja_admin + newDocData.monto_caja_op;
            await runTransaction(db, async (t) => {
                const mainDoc = await t.get(mainDocRef);
                const newTotal = (mainDoc.data().valor || 0) + totalChange;
                t.update(mainDocRef, { valor: newTotal });
                t.set(doc(subcollectionRef), newDocData);
            });
            dataForm.reset();
        });

        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-movimiento-id').value;
            const originalMontoAdmin = parseFloat(document.getElementById('edit-original-monto-admin').value);
            const originalMontoOp = parseFloat(document.getElementById('edit-original-monto-op').value);
            
            const ingreso1 = parseFloat(document.getElementById('edit-ingreso_caja_admin').value) || 0;
            const egreso1 = parseFloat(document.getElementById('edit-egreso_caja_admin').value) || 0;
            const ingreso2 = parseFloat(document.getElementById('edit-ingreso_caja_op').value) || 0;
            const egreso2 = parseFloat(document.getElementById('edit-egreso_caja_op').value) || 0;

            const updatedData = {
                fecha: document.getElementById('edit-fecha').value,
                observaciones: document.getElementById('edit-observaciones').value,
                monto_caja_admin: ingreso1 - egreso1,
                monto_caja_op: ingreso2 - egreso2,
            };

            const originalTotal = originalMontoAdmin + originalMontoOp;
            const newTotalMovimiento = updatedData.monto_caja_admin + updatedData.monto_caja_op;
            const difference = newTotalMovimiento - originalTotal;

            const movimientoRef = doc(db, mainDocRef.path, SUBCOLLECTION_NAME, id);
            await runTransaction(db, async (t) => {
                const mainDoc = await t.get(mainDocRef);
                const newTotal = (mainDoc.data().valor || 0) + difference;
                t.update(mainDocRef, { valor: newTotal });
                t.update(movimientoRef, updatedData);
            });
            alert("Movimiento actualizado con éxito.");
            editModal.classList.add('hidden');
        });

        deleteMovimientoBtn.addEventListener('click', async () => {
            const id = document.getElementById('edit-movimiento-id').value;
            const originalMontoAdmin = parseFloat(document.getElementById('edit-original-monto-admin').value);
            const originalMontoOp = parseFloat(document.getElementById('edit-original-monto-op').value);
            const totalToDelete = originalMontoAdmin + originalMontoOp;

            if (confirm("¿Estás seguro de que quieres eliminar este movimiento permanentemente?")) {
                const movimientoRef = doc(db, mainDocRef.path, SUBCOLLECTION_NAME, id);
                await runTransaction(db, async (t) => {
                    const mainDoc = await t.get(mainDocRef);
                    const newTotal = (mainDoc.data().valor || 0) - totalToDelete;
                    t.update(mainDocRef, { valor: newTotal });
                    t.delete(movimientoRef);
                });
                alert("Movimiento eliminado con éxito.");
                editModal.classList.add('hidden');
            }
        });
    }
    
    closeEditModalButton.addEventListener('click', () => editModal.classList.add('hidden'));
    initializePage();
});
