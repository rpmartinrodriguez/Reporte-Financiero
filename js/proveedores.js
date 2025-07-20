import { db } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const ITEM_NAME = "Proveedores a pagar";
const SUBCOLLECTION_NAME = "facturas_proveedores";
const ITEM_TYPE = "pasivo";

const detailTableContainer = document.getElementById('detail-table-container');
const dataForm = document.getElementById('data-form');
const paymentModal = document.getElementById('payment-modal');
const closePaymentModalButton = document.getElementById('close-payment-modal');
const paymentForm = document.getElementById('payment-form');
const invoiceIdInput = document.getElementById('invoice-id');
const invoiceAmountInput = document.getElementById('invoice-amount');

const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

function renderDetails(docs) {
    if (docs.length === 0) {
        detailTableContainer.innerHTML = '<p class="text-center text-gray-500">No hay facturas de proveedores pendientes.</p>';
        return;
    }
    detailTableContainer.innerHTML = '<div class="details-grid"></div>';
    const grid = detailTableContainer.querySelector('.details-grid');
    docs.forEach(doc => {
        const data = doc.data();
        const card = document.createElement('div');
        card.className = 'detail-card';
        const statusClass = { 'Pendiente': 'status-pendiente', 'Pagada': 'status-pagada' }[data.estado] || 'status-pendiente';
        card.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">${data.proveedor}</h3>
                <span class="status-badge ${statusClass}">${data.estado}</span>
            </div>
            <div class="card-body">
                <div class="card-main-info">
                    <p class="card-main-label">Saldo a Pagar</p>
                    <p class="card-amount negative">${formatCurrency(data.saldo)}</p>
                </div>
                <div class="card-secondary-info">
                    <div class="info-item">
                        <p class="info-label">Fecha Factura</p>
                        <p class="info-value">${data.fecha_factura}</p>
                    </div>
                    <div class="info-item">
                        <p class="info-label">Nº Factura</p>
                        <p class="info-value font-mono">${data.numero_factura}</p>
                    </div>
                    <div class="info-item">
                        <p class="info-label">Vencimiento</p>
                        <p class="info-value">${data.fecha_vencimiento}</p>
                    </div>
                </div>
            </div>
            ${data.estado !== 'Pagada' ? `
            <div class="card-footer">
                <button class="pay-invoice-btn text-sm bg-green-100 text-green-800 font-semibold py-1 px-3 rounded-full hover:bg-green-200" 
                        data-id="${doc.id}" data-saldo="${data.saldo}">
                    Pagar con Cheque
                </button>
            </div>` : ''}
        `;
        grid.appendChild(card);
    });
    grid.querySelectorAll('.pay-invoice-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            invoiceIdInput.value = e.currentTarget.dataset.id;
            invoiceAmountInput.value = e.currentTarget.dataset.saldo;
            paymentModal.classList.remove('hidden');
            paymentModal.classList.add('flex');
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
        const newDocData = { estado: "Pendiente" };
        for (const [key, value] of formData.entries()) {
            newDocData[key] = dataForm.elements[key].type === 'number' ? parseFloat(value) : value;
        }
        const amountToUpdate = newDocData.saldo || 0;
        await runTransaction(db, async (t) => {
            const mainDoc = await t.get(mainDocRef);
            const newTotal = (mainDoc.data().valor || 0) + amountToUpdate;
            t.update(mainDocRef, { valor: newTotal });
            t.set(doc(subcollectionRef), newDocData);
        });
        dataForm.reset();
    });
    closePaymentModalButton.addEventListener('click', () => paymentModal.classList.add('hidden'));
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const invoiceId = invoiceIdInput.value;
        const invoiceAmount = parseFloat(invoiceAmountInput.value);
        const paymentFormData = new FormData(paymentForm);
        const chequeData = { monto: invoiceAmount, estado: "Emitido", destinatario: 'N/A' };
        for (const [key, value] of paymentFormData.entries()) {
            if (key !== 'invoice-id' && key !== 'invoice-amount') chequeData[key] = value;
        }
        try {
            await runTransaction(db, async (t) => {
                const chequesPagarQuery = query(itemsRef, where("nombre", "==", "Cheques a pagar"));
                let chequesPagarSnap = await getDocs(chequesPagarQuery);
                let chequesPagarDocRef;
                if (chequesPagarSnap.empty) {
                    const newChequesDoc = await addDoc(itemsRef, { nombre: "Cheques a pagar", valor: 0, tipo: "pasivo" });
                    chequesPagarDocRef = doc(db, 'items', newChequesDoc.id);
                } else {
                    chequesPagarDocRef = chequesPagarSnap.docs[0].ref;
                }
                const invoiceDocRef = doc(db, 'items', mainDocRef.id, SUBCOLLECTION_NAME, invoiceId);
                const newChequeDocRef = doc(collection(chequesPagarDocRef, "cheques_emitidos"));
                const proveedoresDoc = await t.get(mainDocRef);
                const chequesPagarDoc = await t.get(chequesPagarDocRef);
                const newProveedoresTotal = (proveedoresDoc.data().valor || 0) - invoiceAmount;
                const newChequesTotal = (chequesPagarDoc.data()?.valor || 0) + invoiceAmount;
                t.update(mainDocRef, { valor: newProveedoresTotal });
                t.update(invoiceDocRef, { estado: "Pagada", saldo: 0 });
                t.update(chequesPagarDocRef, { valor: newChequesTotal });
                t.set(newChequeDocRef, chequeData);
            });
            alert("¡Pago registrado y cheque emitido con éxito!");
            paymentForm.reset();
            paymentModal.classList.add('hidden');
        } catch (error) {
            console.error("Error en la transacción de pago: ", error);
            alert("Hubo un error al procesar el pago.");
        }
    });
}
initializePage();
