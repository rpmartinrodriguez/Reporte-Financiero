import { db, authReady } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

authReady.then(() => {
    const ITEM_NAME = "Cheques a pagar";
    const SUBCOLLECTION_NAME = "cheques_emitidos";
    const ITEM_TYPE = "pasivo";

    const detailTableContainer = document.getElementById('detail-table-container');
    const dataForm = document.getElementById('data-form');
    const debitModal = document.getElementById('debit-modal');
    const closeDebitModalButton = document.getElementById('close-debit-modal');
    const debitForm = document.getElementById('debit-form');
    
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

    async function processDebit(e) {
        e.preventDefault();
        const chequeId = document.getElementById('debit-cheque-id').value;
        const chequeData = JSON.parse(document.getElementById('debit-cheque-data').value);
        const comisiones = parseFloat(document.getElementById('comisiones').value) || 0;

        try {
            await runTransaction(db, async (transaction) => {
                const chequesPagarDocRef = await getOrCreateMainItemRef(ITEM_NAME, ITEM_TYPE);
                const sourceChequeRef = doc(db, chequesPagarDocRef.path, SUBCOLLECTION_NAME, chequeId);
                const bancosDocRef = await getOrCreateMainItemRef("Saldo Bancario", "activo");

                const chequesPagarDoc = await transaction.get(chequesPagarDocRef);
                const bancosDoc = await transaction.get(bancosDocRef);

                if (!chequesPagarDoc.exists()) throw new Error("Categoría 'Cheques a pagar' no encontrada.");

                const montoCheque = chequeData.monto;
                const newChequesPagarTotal = (chequesPagarDoc.data().valor || 0) - montoCheque;
                const newBancosTotal = (bancosDoc.data()?.valor || 0) - montoCheque - comisiones;
                
                const today = new Date().toISOString().split('T')[0];
                const updatedChequeData = { 
                    ...chequeData, 
                    estado: "Debitado",
                    debito_info: {
                        fecha_debito: today,
                        comisiones: comisiones
                    }
                };
                
                const movimientoChequeData = { fecha: today, descripcion: `Débito cheque N°${chequeData.numero_cheque} a ${chequeData.destinatario}`, monto: -montoCheque };
                
                transaction.update(chequesPagarDocRef, { valor: newChequesPagarTotal });
                transaction.update(bancosDocRef, { valor: newBancosTotal });
                transaction.update(sourceChequeRef, updatedChequeData);
                transaction.set(doc(collection(bancosDocRef, "movimientos_bancarios")), movimientoChequeData);

                if (comisiones > 0) {
                    const movimientoComisionData = { fecha: today, descripcion: `Comisiones cheque N°${chequeData.numero_cheque}`, monto: -comisiones };
                    transaction.set(doc(collection(bancosDocRef, "movimientos_bancarios")), movimientoComisionData);
                }
            });
            alert("¡Débito registrado con éxito! El saldo bancario ha sido actualizado.");
            debitModal.classList.add('hidden');
        } catch (error) {
            console.error("Error al registrar el débito:", error);
            alert("Hubo un error al procesar el débito.");
        }
    }

    function renderDetails(docs) {
        if (docs.length === 0) {
            detailTableContainer.innerHTML = '<p class="text-center text-gray-500">No hay cheques emitidos.</p>';
            return;
        }
        detailTableContainer.innerHTML = '<div class="details-grid"></div>';
        const grid = detailTableContainer.querySelector('.details-grid');
        docs.forEach(docSnap => {
            const data = docSnap.data();
            const card = document.createElement('div');
            card.className = 'detail-card';
            const isDebitado = data.estado === 'Debitado';
            const statusClass = isDebitado ? 'status-pagada' : 'status-emitido';
            card.innerHTML = `
                <div class="card-header"><h3 class="card-title">${data.destinatario || data.proveedor || 'N/A'}</h3><span class="status-badge ${statusClass}">${data.estado}</span></div>
                <div class="card-body">
                    <div class="card-main-info"><p class="card-main-label">Monto del Cheque</p><p class="card-amount negative">${formatCurrency(data.monto)}</p></div>
                    <div class="card-secondary-info">
                        <div class="info-item"><p class="info-label">Fecha Emisión</p><p class="info-value">${data.fecha_emision}</p></div>
                        <div class="info-item"><p class="info-label">Nº Cheque</p><p class="info-value font-mono">${data.numero_cheque}</p></div>
                        <div class="info-item"><p class="info-label">Banco</p><p class="info-value">${data.banco}</p></div>
                    </div>
                    ${isDebitado && data.debito_info ? `<div class="mt-4 text-center text-sm text-gray-600 bg-gray-50 p-2 rounded-md">Debitado el ${data.debito_info.fecha_debito} con comisiones de ${formatCurrency(data.debito_info.comisiones)}</div>` : ''}
                </div>
                ${!isDebitado ? `
                <div class="card-footer">
                    <button class="action-button danger debitar-cheque-btn" data-id="${docSnap.id}" data-cheque='${JSON.stringify(data)}'>Marcar como Debitado</button>
                </div>` : ''}
            `;
            grid.appendChild(card);
        });

        detailTableContainer.querySelectorAll('.debitar-cheque-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const chequeId = e.currentTarget.dataset.id;
                const chequeData = JSON.parse(e.currentTarget.dataset.cheque);
                document.getElementById('debit-cheque-id').value = chequeId;
                document.getElementById('debit-cheque-data').value = JSON.stringify(chequeData);
                document.getElementById('debit-cheque-numero').textContent = chequeData.numero_cheque;
                document.getElementById('debit-destinatario').textContent = chequeData.destinatario;
                document.getElementById('debit-monto').textContent = formatCurrency(chequeData.monto);
                document.getElementById('comisiones').value = '';
                debitModal.classList.remove('hidden');
                debitModal.classList.add('flex');
            });
        });
    }

    async function initializePage() {
        const mainDocRef = await getOrCreateMainItemRef(ITEM_NAME, ITEM_TYPE);
        const subcollectionRef = collection(mainDocRef, SUBCOLLECTION_NAME);

        onSnapshot(subcollectionRef, (snapshot) => {
            renderDetails(snapshot.docs.sort((a, b) => new Date(b.data().fecha_emision) - new Date(a.data().fecha_emision)));
        });

        dataForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(dataForm);
            const newDocData = { estado: "Emitido" };
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
    }
    
    closeDebitModalButton.addEventListener('click', () => debitModal.classList.add('hidden'));
    debitForm.addEventListener('submit', processDebit);
    initializePage();
});
