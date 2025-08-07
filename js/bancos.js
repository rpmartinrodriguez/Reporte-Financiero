import { db, authReady } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

authReady.then(() => {
    const ITEM_NAME = "Saldo Bancario";
    const SUBCOLLECTION_NAME = "movimientos_bancarios";
    const ITEM_TYPE = "activo";

    const detailTableContainer = document.getElementById('detail-table-container');
    const dataForm = document.getElementById('data-form');
    const paginationContainer = document.getElementById('pagination-container');
    const totalBancoEl = document.getElementById('total-banco');
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
            detailTableContainer.innerHTML = '<p class="text-center text-gray-500">No hay movimientos bancarios registrados.</p>';
            return;
        }
        detailTableContainer.innerHTML = '<div class="details-grid"></div>';
        const grid = detailTableContainer.querySelector('.details-grid');
        pageDocs.forEach(docSnap => {
            const data = docSnap.data();
            const card = document.createElement('div');
            card.className = 'detail-card';
            const isPositive = data.monto >= 0;
            card.innerHTML = `
                <div class="card-header">
                    <h3 class="card-title">${data.descripcion}</h3>
                    <span class="info-value">${data.fecha}</span>
                </div>
                <div class="card-body">
                    <div class="card-main-info">
                        <p class="card-main-label">Monto del Movimiento</p>
                        <p class="card-amount ${isPositive ? 'positive' : 'negative'}">${formatCurrency(data.monto)}</p>
                    </div>
                </div>
                <div class="card-footer">
                    <button class="action-button secondary edit-movimiento-btn" data-id="${docSnap.id}" data-movimiento='${JSON.stringify(data)}'>Editar</button>
                </div>
            `;
            grid.appendChild(card);
        });
        assignActionListeners();
    }

    function assignActionListeners() {
        detailTableContainer.querySelectorAll('.edit-movimiento-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const data = JSON.parse(e.currentTarget.dataset.movimiento);
                document.getElementById('edit-movimiento-id').value = id;
                document.getElementById('edit-original-monto').value = data.monto;
                document.getElementById('edit-fecha').value = data.fecha;
                document.getElementById('edit-descripcion').value = data.descripcion;
                document.getElementById('edit-monto').value = data.monto;
                editModal.classList.remove('hidden');
                editModal.classList.add('flex');
            });
        });
    }

    async function initializePage() {
        const mainDocRef = await getOrCreateMainItemRef(ITEM_NAME, ITEM_TYPE);
        
        onSnapshot(mainDocRef, (doc) => {
            totalBancoEl.textContent = formatCurrency(doc.data()?.valor || 0);
        });

        const subcollectionRef = collection(mainDocRef, SUBCOLLECTION_NAME);
        onSnapshot(subcollectionRef, (snapshot) => {
            allDocs = snapshot.docs.sort((a, b) => new Date(b.data().fecha) - new Date(a.data().fecha));
            applyFiltersAndPagination();
        });

        dataForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newDocData = {
                fecha: document.getElementById('fecha').value,
                descripcion: document.getElementById('descripcion').value,
                monto: parseFloat(document.getElementById('monto').value) || 0
            };
            const amountToUpdate = newDocData.monto;
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
            const id = document.getElementById('edit-movimiento-id').value;
            const originalMonto = parseFloat(document.getElementById('edit-original-monto').value);
            const updatedData = {
                fecha: document.getElementById('edit-fecha').value,
                descripcion: document.getElementById('edit-descripcion').value,
                monto: parseFloat(document.getElementById('edit-monto').value) || 0
            };
            const difference = updatedData.monto - originalMonto;
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
            const montoToDelete = parseFloat(document.getElementById('edit-original-monto').value);
            if (confirm("¿Estás seguro de que quieres eliminar este movimiento permanentemente?")) {
                const movimientoRef = doc(db, mainDocRef.path, SUBCOLLECTION_NAME, id);
                await runTransaction(db, async (t) => {
                    const mainDoc = await t.get(mainDocRef);
                    const newTotal = (mainDoc.data().valor || 0) - montoToDelete;
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
