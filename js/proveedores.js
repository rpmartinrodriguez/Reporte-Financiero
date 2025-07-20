import { db } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURACIÓN ---
const ITEM_NAME = "Proveedores a pagar";
const SUBCOLLECTION_NAME = "facturas_proveedores";
const ITEM_TYPE = "pasivo";

// --- ELEMENTOS DEL DOM ---
const detailTableContainer = document.getElementById('detail-table-container');
const dataForm = document.getElementById('data-form');
const paymentModal = document.getElementById('payment-modal');
const closePaymentModalButton = document.getElementById('close-payment-modal');
const paymentForm = document.getElementById('payment-form');
const invoiceIdInput = document.getElementById('invoice-id');
const invoiceAmountInput = document.getElementById('invoice-amount');
const invoiceProveedorInput = document.getElementById('invoice-proveedor');

const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

// --- RENDERIZADO DE LA VISTA DE TARJETAS (ACTUALIZADO) ---
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
        const isPaid = data.estado === 'Pagada';
        const statusClass = isPaid ? 'status-pagada' : 'status-pendiente';

        card.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">${data.proveedor}</h3>
                <span class="status-badge ${statusClass}">${data.estado}</span>
            </div>
            <div class="card-body">
                <div class="card-main-info">
                    <p class="card-main-label">${isPaid ? 'Monto Original' : 'Saldo a Pagar'}</p>
                    <p class="card-amount negative">${formatCurrency(data.saldo_original || data.saldo)}</p>
                </div>
                <div class="card-secondary-info">
                    <div class="info-item"><p class="info-label">Fecha Factura</p><p class="info-value">${data.fecha_factura}</p></div>
                    <div class="info-item"><p class="info-label">Nº Factura</p><p class="info-value font-mono">${data.numero_factura}</p></div>
                    <div class="info-item"><p class="info-label">Vencimiento</p><p class="info-value">${data.fecha_vencimiento}</p></div>
                </div>
                ${isPaid && data.pago_info ? `
                <div class="mt-4 text-center text-sm text-gray-600 bg-gray-50 p-2 rounded-md">
                    ${data.pago_info}
                </div>` : ''}
            </div>
            ${!isPaid ? `
            <div class="card-footer">
                <button class="pay-invoice-btn text-sm bg-green-100 text-green-800 font-semibold py-1 px-3 rounded-full hover:bg-green-200" 
                        data-id="${doc.id}" data-saldo="${data.saldo}" data-proveedor="${data.proveedor}">
                    Pagar con Cheque
                </button>
            </div>` : ''}
        `;
        grid.appendChild(card);
    });
}

// --- LÓGICA DE LA PÁGINA (ACTUALIZADO) ---
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

    // Cargar nueva factura de proveedor
    dataForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(dataForm);
        const newDocData = { estado: "Pendiente" };
        for (const [key, value] of formData.entries()) {
            newDocData[key] = dataForm.elements[key].type === 'number' ? parseFloat(value) : value;
        }
        newDocData.saldo_original = newDocData.saldo; // Guardamos el monto original
        const amountToUpdate = newDocData.saldo || 0;
        await runTransaction(db, async (t) => {
            const mainDoc = await t.get(mainDocRef);
            const newTotal = (mainDoc.data().valor || 0) + amountToUpdate;
            t.update(mainDocRef, { valor: newTotal });
            t.set(doc(subcollectionRef), newDocData);
        });
        dataForm.reset();
    });

    // Abrir modal de pago y pasar datos
    detailTableContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('pay-invoice-btn')) {
            const button = e.target;
            invoiceIdInput.value = button.dataset.id;
            invoiceAmountInput.value = button.dataset.saldo;
            invoiceProveedorInput.value = button.dataset.proveedor; // Pasamos el nombre del proveedor
            paymentModal.classList.remove('hidden');
            paymentModal.classList.add('flex');
        }
    });

    closePaymentModalButton.addEventListener('click', () => paymentModal.classList.add('hidden'));

    // Procesar pago con cheque (LÓGICA ACTUALIZADA)
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const invoiceId = invoiceIdInput.value;
        const invoiceAmount = parseFloat(invoiceAmountInput.value);
        const proveedorName = invoiceProveedorInput.value; // Obtenemos el nombre del proveedor
        const paymentFormData = new FormData(paymentForm);
        const numeroCheque = paymentFormData.get('numero_cheque');

        const chequeData = {
            monto: invoiceAmount,
            estado: "Emitido",
            destinatario: proveedorName // Asignamos el proveedor como destinatario
        };
        for (const [key, value] of paymentFormData.entries()) {
            if (!['invoice-id', 'invoice-amount', 'invoice-proveedor'].includes(key)) {
                chequeData[key] = value;
            }
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

                // Actualizaciones clave
                t.update(mainDocRef, { valor: newProveedoresTotal });
                t.update(invoiceDocRef, { 
                    estado: "Pagada", 
                    saldo: 0, 
                    pago_info: `CANCELADO CON CHEQUE Nro. ${numeroCheque}` 
                });
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
