import { db, authReady } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

authReady.then(() => {
    const ITEM_NAME = "Cheques pendiente de cobro";
    const SUBCOLLECTION_NAME = "cheques_detalle_pendientes";
    const ITEM_TYPE = "activo";

    const detailTableContainer = document.getElementById('detail-table-container');
    const dataForm = document.getElementById('data-form');
    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    async function acreditarCheque(chequeId, chequeData) {
        if (!confirm(`¿Confirmas que el cheque de ${chequeData.librador} por ${formatCurrency(chequeData.monto)} se ha acreditado en tu cuenta bancaria?`)) return;

        try {
            await runTransaction(db, async (transaction) => {
                const itemsRef = collection(db, 'items');
                
                // 1. Referencias de origen
                const pendientesQuery = query(itemsRef, where("nombre", "==", ITEM_NAME));
                const pendientesSnap = await getDocs(pendientesQuery);
                if (pendientesSnap.empty) throw new Error("No se encontró la categoría 'Cheques pendiente de cobro'");
                const pendientesDocRef = pendientesSnap.docs[0].ref;
                const sourceChequeRef = doc(db, pendientesDocRef.path, SUBCOLLECTION_NAME, chequeId);

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
                const pendientesDoc = await transaction.get(pendientesDocRef);
                const bancosDoc = await transaction.get(bancosDocRef);

                // 4. Calcular nuevos totales
                const monto = chequeData.monto;
                const newPendientesTotal = (pendientesDoc.data().valor || 0) - monto;
                const newBancosTotal = (bancosDoc.data().valor || 0) + monto;

                // 5. Preparar nuevo movimiento bancario
                const newMovimientoData = {
                    fecha: new Date().toISOString().split('T')[0], // Fecha de hoy
                    descripcion: `Acreditación cheque N°${chequeData.numero_cheque} de ${chequeData.librador}`,
                    monto: monto
                };

                // 6. Ejecutar escrituras
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

    function renderDetails(docs) {
        if (docs.length === 0) {
            detailTableContainer.innerHTML = '<p class="text-center text-gray-500">No hay cheques pendientes de cobro.</p>';
            return;
        }
        detailTableContainer.innerHTML = '<div class="details-grid"></div>';
        const grid = detailTableContainer.querySelector('.details-grid');
        docs.forEach(doc => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'detail-card';
            const statusClass = { 'Pendiente de cobro': 'status-pendiente', 'Acreditado': 'status-acreditado', 'Rechazado': 'status-rechazado', 'Depositado': 'status-depositado' }[data.estado] || 'status-pendiente';
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
                ${data.estado === 'Depositado' ? `
                <div class="card-footer">
                    <button class="action-button success acreditar-cheque-btn" data-id="${doc.id}" data-cheque='${JSON.stringify(data)}'>Acreditar</button>
                </div>` : ''}
            `;
            grid.appendChild(card);
        });

        detailTableContainer.querySelectorAll('.acreditar-cheque-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const chequeId = e.currentTarget.dataset.id;
                const chequeData = JSON.parse(e.currentTarget.dataset.cheque);
                acreditarCheque(chequeId, chequeData);
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
    initializePage();
});
