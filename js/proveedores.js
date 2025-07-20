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

const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

// --- RENDERIZADO DE LA TABLA ---
function renderTable(docs) {
    let tableHTML = '<div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-200"><thead><tr>';
    if (docs.length === 0) {
        detailTableContainer.innerHTML = '<p>No hay facturas de proveedores pendientes.</p>';
        return;
    }
    const headers = [...Object.keys(docs[0].data()), 'acciones'];
    headers.forEach(h => tableHTML += `<th class="th-style">${h.replace(/_/g, ' ')}</th>`);
    tableHTML += '</tr></thead><tbody class="bg-white divide-y divide-gray-200">';

    docs.forEach(doc => {
        const data = doc.data();
        tableHTML += '<tr>';
        headers.forEach(header => {
            if (header === 'acciones') {
                if (data.estado !== 'Pagada') {
                    tableHTML += `<td class="td-style"><button class="pay-invoice-btn" data-id="${doc.id}" data-saldo="${data.saldo}">Pagar</button></td>`;
                } else {
                    tableHTML += `<td class="td-style"><span class="text-green-600 font-semibold">Pagada</span></td>`;
                }
            } else {
                const value = data[header];
                const displayValue = header === 'saldo' ? formatCurrency(value) : value;
                tableHTML += `<td class="td-style">${displayValue}</td>`;
            }
        });
        tableHTML += '</tr>';
    });
    tableHTML += '</tbody></table></div>';
    detailTableContainer.innerHTML = tableHTML;
}

// --- LÓGICA DE LA PÁGINA ---
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
    onSnapshot(subcollectionRef, (snapshot) => renderTable(snapshot.docs));

    // Cargar nueva factura de proveedor
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

    // Abrir modal de pago
    detailTableContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('pay-invoice-btn')) {
            invoiceIdInput.value = e.target.dataset.id;
            invoiceAmountInput.value = e.target.dataset.saldo;
            paymentModal.classList.remove('hidden');
            paymentModal.classList.add('flex');
        }
    });

    // Cerrar modal de pago
    closePaymentModalButton.addEventListener('click', () => {
        paymentModal.classList.add('hidden');
        paymentModal.classList.remove('flex');
    });

    // Procesar pago con cheque
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const invoiceId = invoiceIdInput.value;
        const invoiceAmount = parseFloat(invoiceAmountInput.value);
        const paymentFormData = new FormData(paymentForm);
        const chequeData = {
            monto: invoiceAmount,
            estado: "Emitido"
        };
        for (const [key, value] of paymentFormData.entries()) {
            if (key !== 'invoice-id' && key !== 'invoice-amount') {
                chequeData[key] = value;
            }
        }

        try {
            await runTransaction(db, async (t) => {
                // Referencias
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

                // Lecturas
                const proveedoresDoc = await t.get(mainDocRef);
                const chequesPagarDoc = await t.get(chequesPagarDocRef);

                // Cálculos
                const newProveedoresTotal = (proveedoresDoc.data().valor || 0) - invoiceAmount;
                const newChequesTotal = (chequesPagarDoc.data()?.valor || 0) + invoiceAmount;

                // Escrituras
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
