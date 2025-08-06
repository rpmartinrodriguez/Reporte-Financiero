import { db, authReady } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

authReady.then(() => {
    const ITEM_NAME = "Saldo Efectivo";
    const SUBCOLLECTION_NAME = "movimientos_caja";
    const ITEM_TYPE = "activo";

    const detailTableContainer = document.getElementById('detail-table-container');
    const dataForm = document.getElementById('data-form');
    const paginationContainer = document.getElementById('pagination-container');
    const saldoCaja1El = document.getElementById('saldo-caja-1');
    const saldoCaja2El = document.getElementById('saldo-caja-2');
    
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
        // Por ahora no hay filtros, solo paginación
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
                        <th class="th-style text-right">Ingreso Caja 1</th>
                        <th class="th-style text-right">Egreso Caja 1</th>
                        <th class="th-style text-right">Ingreso Caja 2</th>
                        <th class="th-style text-right">Egreso Caja 2</th>
                    </tr></thead>
                    <tbody class="bg-white divide-y divide-gray-200"></tbody>
                </table>
            </div>`;
        const tbody = detailTableContainer.querySelector('tbody');
        pageDocs.forEach(doc => {
            const data = doc.data();
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="td-style">${data.fecha}</td>
                <td class="td-style">${data.observaciones}</td>
                <td class="td-style text-right text-green-600">${data.monto_caja_1 > 0 ? formatCurrency(data.monto_caja_1) : '-'}</td>
                <td class="td-style text-right text-red-600">${data.monto_caja_1 < 0 ? formatCurrency(Math.abs(data.monto_caja_1)) : '-'}</td>
                <td class="td-style text-right text-green-600">${data.monto_caja_2 > 0 ? formatCurrency(data.monto_caja_2) : '-'}</td>
                <td class="td-style text-right text-red-600">${data.monto_caja_2 < 0 ? formatCurrency(Math.abs(data.monto_caja_2)) : '-'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    async function initializePage() {
        const mainDocRef = await getOrCreateMainItemRef(ITEM_NAME, ITEM_TYPE);
        const subcollectionRef = collection(mainDocRef, SUBCOLLECTION_NAME);

        onSnapshot(subcollectionRef, (snapshot) => {
            allDocs = snapshot.docs.sort((a, b) => new Date(b.data().fecha) - new Date(a.data().fecha));
            
            let saldoCaja1 = 0;
            let saldoCaja2 = 0;
            allDocs.forEach(doc => {
                saldoCaja1 += doc.data().monto_caja_1 || 0;
                saldoCaja2 += doc.data().monto_caja_2 || 0;
            });
            saldoCaja1El.textContent = formatCurrency(saldoCaja1);
            saldoCaja2El.textContent = formatCurrency(saldoCaja2);

            applyFiltersAndPagination();
        });

        dataForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const ingreso1 = parseFloat(document.getElementById('ingreso_caja_1').value) || 0;
            const egreso1 = parseFloat(document.getElementById('egreso_caja_1').value) || 0;
            const ingreso2 = parseFloat(document.getElementById('ingreso_caja_2').value) || 0;
            const egreso2 = parseFloat(document.getElementById('egreso_caja_2').value) || 0;

            const newDocData = {
                fecha: document.getElementById('fecha').value,
                observaciones: document.getElementById('observaciones').value,
                monto_caja_1: ingreso1 - egreso1,
                monto_caja_2: ingreso2 - egreso2,
            };

            const totalChange = newDocData.monto_caja_1 + newDocData.monto_caja_2;

            await runTransaction(db, async (t) => {
                const mainDoc = await t.get(mainDocRef);
                const newTotal = (mainDoc.data().valor || 0) + totalChange;
                t.update(mainDocRef, { valor: newTotal });
                t.set(doc(subcollectionRef), newDocData);
            });
            dataForm.reset();
        });
    }
    initializePage();
});
