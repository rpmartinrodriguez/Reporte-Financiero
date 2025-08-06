import { db, authReady } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs, updateDoc, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

authReady.then(() => {
    const ITEM_NAME = "Gastos Fijos";
    const SUBCOLLECTION_NAME = "gastos_detalle";
    const ITEM_TYPE = "pasivo";

    const detailTableContainer = document.getElementById('detail-table-container');
    const dataForm = document.getElementById('data-form');
    // Modals
    const paymentModal = document.getElementById('payment-modal');
    const closePaymentModalButton = document.getElementById('close-payment-modal');
    const paymentForm = document.getElementById('payment-form');
    const editModal = document.getElementById('edit-modal');
    const closeEditModalButton = document.getElementById('close-edit-modal');
    const editForm = document.getElementById('edit-form');
    const deleteExpenseBtn = document.getElementById('delete-expense-btn');

    let allDocs = [];
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
    
    function renderDetails(docs) {
        if (docs.length === 0) {
            detailTableContainer.innerHTML = '<p class="text-center text-gray-500">No hay gastos fijos cargados.</p>';
            return;
        }
        detailTableContainer.innerHTML = '<div class="details-grid"></div>';
        const grid = detailTableContainer.querySelector('.details-grid');
        const currentMonthId = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

        docs.forEach(async (docSnap) => {
            const data = docSnap.data();
            const card = document.createElement('div');
            card.className = 'detail-card';
            
            const paymentRef = doc(db, docSnap.ref.path, 'pagos_realizados', currentMonthId);
            const paymentSnap = await getDoc(paymentRef);
            const isPaidThisMonth = paymentSnap.exists();
            const statusClass = isPaidThisMonth ? 'status-pagada' : 'status-pendiente';

            card.innerHTML = `
                <div class="card-header">
                    <h3 class="card-title">${data.descripcion}</h3>
                    <span class="status-badge ${statusClass}">${isPaidThisMonth ? 'Pagado este mes' : 'Pendiente este mes'}</span>
                </div>
                <div class="card-body">
                    <div class="card-main-info">
                        <p class="card-main-label">Monto Mensual</p>
                        <p class="card-amount negative">${formatCurrency(data.monto)}</p>
                    </div>
                    <div class="card-secondary-info">
                        <div class="info-item">
                            <p class="info-label">Día de Vencimiento</p>
                            <p class="info-value">Día ${data.dia_vencimiento} de cada mes</p>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <button class="action-button secondary edit-expense-btn" data-id="${docSnap.id}" data-expense='${JSON.stringify(data)}'>Editar</button>
                    ${!isPaidThisMonth ? `<button class="action-button success pay-expense-btn" data-id="${docSnap.id}" data-expense='${JSON.stringify(data)}'>Pagar este mes</button>` : ''}
                </div>
            `;
            grid.appendChild(card);
        });

        // Add event listeners AFTER rendering all cards
        grid.querySelectorAll('.edit-expense-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const expenseId = e.currentTarget.dataset.id;
                const expenseData = JSON.parse(e.currentTarget.dataset.expense);
                document.getElementById('edit-expense-id').value = expenseId;
                document.getElementById('edit-descripcion').value = expenseData.descripcion;
                document.getElementById('edit-monto').value = expenseData.monto;
                document.getElementById('edit-dia_vencimiento').value = expenseData.dia_vencimiento;
                editModal.classList.remove('hidden');
                editModal.classList.add('flex');
            });
        });

        grid.querySelectorAll('.pay-expense-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const expenseId = e.currentTarget.dataset.id;
                const expenseData = JSON.parse(e.currentTarget.dataset.expense);
                document.getElementById('expense-id').value = expenseId;
                document.getElementById('expense-data').value = JSON.stringify(expenseData);
                document.getElementById('payment-expense-name').textContent = expenseData.descripcion;
                const monthName = new Date().toLocaleString('es-ES', { month: 'long' });
                document.getElementById('payment-month-name').textContent = monthName;
                paymentModal.classList.remove('hidden');
                paymentModal.classList.add('flex');
            });
        });
    }

    async function initializePage() {
        const mainDocRef = await getOrCreateMainItemRef(ITEM_NAME, ITEM_TYPE);
        const subcollectionRef = collection(mainDocRef, SUBCOLLECTION_NAME);

        onSnapshot(subcollectionRef, (snapshot) => {
            allDocs = snapshot.docs;
            renderDetails(allDocs);
        });

        dataForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(dataForm);
            const newDocData = {};
            for (const [key, value] of formData.entries()) {
                newDocData[key] = dataForm.elements[key].type === 'number' ? parseFloat(value) : value;
            }
            await addDoc(subcollectionRef, newDocData);
            dataForm.reset();
        });

        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const expenseId = document.getElementById('edit-expense-id').value;
            const updatedData = {
                descripcion: document.getElementById('edit-descripcion').value,
                monto: parseFloat(document.getElementById('edit-monto').value),
                dia_vencimiento: parseInt(document.getElementById('edit-dia_vencimiento').value)
            };
            const expenseRef = doc(db, mainDocRef.path, SUBCOLLECTION_NAME, expenseId);
            await updateDoc(expenseRef, updatedData);
            editModal.classList.add('hidden');
            alert("Gasto fijo actualizado.");
        });

        deleteExpenseBtn.addEventListener('click', async () => {
            const expenseId = document.getElementById('edit-expense-id').value;
            if (confirm("¿Estás seguro de que quieres eliminar este gasto fijo permanentemente?")) {
                const expenseRef = doc(db, mainDocRef.path, SUBCOLLECTION_NAME, expenseId);
                await deleteDoc(expenseRef);
                editModal.classList.add('hidden');
                alert("Gasto fijo eliminado.");
            }
        });

        paymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const expenseId = document.getElementById('expense-id').value;
            const expenseData = JSON.parse(document.getElementById('expense-data').value);
            const metodo = document.getElementById('metodo_pago').value;
            const today = new Date();
            const currentMonthId = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

            try {
                await runTransaction(db, async (transaction) => {
                    const targetItemName = metodo === "Efectivo" ? "Saldo Efectivo" : "Saldo Bancario";
                    const targetSubcollection = metodo === "Efectivo" ? "movimientos_caja" : "movimientos_bancarios";
                    const targetDocRef = await getOrCreateMainItemRef(targetItemName, "activo");

                    const targetDoc = await transaction.get(targetDocRef);
                    const newTotal = (targetDoc.data()?.valor || 0) - expenseData.monto;
                    transaction.update(targetDocRef, { valor: newTotal });

                    const movimientoData = {
                        fecha: today.toISOString().split('T')[0],
                        descripcion: `Pago gasto fijo: ${expenseData.descripcion}`,
                        monto: -expenseData.monto
                    };
                    transaction.set(doc(collection(targetDocRef, targetSubcollection)), movimientoData);

                    const paymentRef = doc(db, mainDocRef.path, SUBCOLLECTION_NAME, expenseId, 'pagos_realizados', currentMonthId);
                    transaction.set(paymentRef, { fecha_pago: today, metodo: metodo });
                });
                alert("Pago registrado con éxito.");
                paymentModal.classList.add('hidden');
            } catch (error) {
                console.error("Error al registrar el pago:", error);
                alert("Hubo un error al registrar el pago.");
            }
        });
    }

    closePaymentModalButton.addEventListener('click', () => paymentModal.classList.add('hidden'));
    closeEditModalButton.addEventListener('click', () => editModal.classList.add('hidden'));
    initializePage();
});
