import { db, authReady } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

authReady.then(() => {
    const ITEM_NAME = "Cheques a pagar";
    const SUBCOLLECTION_NAME = "cheques_emitidos";
    const ITEM_TYPE = "pasivo";

    const detailTableContainer = document.getElementById('detail-table-container');
    const dataForm = document.getElementById('data-form');
    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    async function debitarCheque(chequeId, chequeData) {
        if (!confirm(`¿Confirmas que el cheque N°${chequeData.numero_cheque} por ${formatCurrency(chequeData.monto)} ha sido debitado de tu cuenta?`)) return;

        try {
            await runTransaction(db, async (transaction) => {
                const itemsRef = collection(db, 'items');
                
                // 1. Referencias de origen
                const chequesPagarQuery = query(itemsRef, where("nombre", "==", ITEM_NAME));
                const chequesPagarSnap = await getDocs(chequesPagarQuery);
                if (chequesPagarSnap.empty) throw new Error("No se encontró la categoría 'Cheques a pagar'");
                const chequesPagarDocRef = chequesPagarSnap.docs[0].ref;
                const sourceChequeRef = doc(db, chequesPagarDocRef.path, SUBCOLLECTION_NAME, chequeId);

                // 2. Referencias de destino (Saldo Bancario)
                const bancosQuery = query(itemsRef, where("nombre", "==", "Saldo Bancario"));
                let bancosSnap = await getDocs(bancosQuery);
                let bancosDocRef;
                if (bancosSnap.empty) {
                    const newBancoDoc = await addDoc(itemsRef, { nombre: "Saldo Bancario", valor: 0, tipo: "activo" });
                    bancosDocRef = newBancoDoc.ref;
                } else {
                    bancosDocRef = bancosSnap.docs[0].ref;
                }
                const newMovimientoRef = doc(collection(bancosDocRef, "movimientos_bancarios"));

                // 3. Leer totales
                const chequesPagarDoc = await transaction.get(chequesPagarDocRef);
                const bancosDoc = await transaction.get(bancosDocRef);

                // 4. Calcular nuevos totales
                const monto = chequeData.monto;
                const newChequesPagarTotal = (chequesPagarDoc.data().valor || 0) - monto;
                const newBancosTotal = (bancosDoc.data().valor || 0) - monto; // Restamos porque es un egreso

                // 5. Preparar nuevo movimiento bancario
                const newMovimientoData = {
                    fecha: new Date().toISOString().split('T')[0], // Fecha de hoy
                    descripcion: `Débito cheque N°${chequeData.numero_cheque} para ${chequeData.destinatario}`,
                    monto: -monto // Monto negativo
                };

                // 6. Ejecutar escrituras
                transaction.update(chequesPagarDocRef, { valor: newChequesPagarTotal });
                transaction.update(bancosDocRef, { valor: newBancosTotal });
                transaction.delete(sourceChequeRef);
                transaction.set(newMovimientoRef, newMovimientoData);
            });
            alert("¡Cheque debitado con éxito! El saldo bancario ha sido actualizado.");
        } catch (error) {
            console.error("Error al debitar el cheque:", error);
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
        docs.forEach(doc => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'detail-card';
            const statusClass = { 'Emitido': 'status-emitido' }[data.estado] || 'status-emitido';
            card.innerHTML = `
                <div class="card-header"><h3 class="card-title">${data.destinatario || data.proveedor || 'N/A'}</h3><span class="status-badge ${statusClass}">${data.estado}</span></div>
                <div class="card-body">
                    <div class="card-main-info"><p class="card-main-label">Monto del Cheque</p><p class="card-amount negative">${formatCurrency(data.monto)}</p></div>
                    <div class="card-secondary-info">
                        <div class="info-item"><p class="info-label">Fecha Emisión</p><p class="info-value">${data.fecha_emision}</p></div>
                        <div class="info-item"><p class="info-label">Nº Cheque</p><p class="info-value font-mono">${data.numero_cheque}</p></div>
                        <div class="info-item"><p class="info-label">Banco</p><p class="info-value">${data.banco}</p></div>
                    </div>
                </div>
                ${data.estado === 'Emitido' ? `
                <div class="card-footer">
                    <button class="action-button danger debitar-cheque-btn" data-id="${doc.id}" data-cheque='${JSON.stringify(data)}'>Marcar como Debitado</button>
                </div>` : ''}
            `;
            grid.appendChild(card);
        });

        detailTableContainer.querySelectorAll('.debitar-cheque-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const chequeId = e.currentTarget.dataset.id;
                const chequeData = JSON.parse(e.currentTarget.dataset.cheque);
                debitarCheque(chequeId, chequeData);
            });
        });
    }

    async function initializePage() {
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
        onSnapshot(subcollectionRef, (snapshot) => renderDetails(snapshot.docs));
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
    initializePage();
});
