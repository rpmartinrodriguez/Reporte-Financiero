import { db } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const ITEM_NAME = "Clientes a Cobrar";
const SUBCOLLECTION_NAME = "facturas";
const ITEM_TYPE = "activo";

const detailTableContainer = document.getElementById('detail-table-container');
const dataForm = document.getElementById('data-form');
const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

const saldoBrutoInput = dataForm.elements.saldo_bruto;
const ivaInput = dataForm.elements.iva;
const saldoNetoInput = dataForm.elements.saldo_neto;
saldoBrutoInput.addEventListener('input', () => {
    const bruto = parseFloat(saldoBrutoInput.value) || 0;
    const iva = bruto * 0.21;
    const neto = bruto + iva;
    ivaInput.value = iva.toFixed(2);
    saldoNetoInput.value = neto.toFixed(2);
});

function renderDetails(docs) {
    if (docs.length === 0) {
        detailTableContainer.innerHTML = '<p class="text-center text-gray-500">No hay facturas cargadas. ¡Agrega la primera!</p>';
        return;
    }
    detailTableContainer.innerHTML = '<div class="details-grid"></div>';
    const grid = detailTableContainer.querySelector('.details-grid');
    docs.forEach(doc => {
        const data = doc.data();
        const card = document.createElement('div');
        card.className = 'detail-card';
        const statusClass = { 'Pendiente': 'status-pendiente', 'Cobrado': 'status-cobrado', 'Vencido': 'status-vencido' }[data.estado] || 'status-pendiente';
        card.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">${data.nombre}</h3>
                <span class="status-badge ${statusClass}">${data.estado}</span>
            </div>
            <div class="card-body">
                <div class="card-main-info">
                    <p class="card-main-label">Monto a Cobrar</p>
                    <p class="card-amount positive">${formatCurrency(data.saldo_neto)}</p>
                </div>
                <div class="card-secondary-info">
                    <div class="info-item">
                        <p class="info-label">Fecha Factura</p>
                        <p class="info-value">${data.fecha}</p>
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
        `;
        grid.appendChild(card);
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
        const amountToUpdate = newDocData.saldo_neto || 0;
        await runTransaction(db, async (t) => {
            const mainDoc = await t.get(mainDocRef);
            if (!mainDoc.exists()) throw "Doc principal no existe!";
            const newTotal = (mainDoc.data().valor || 0) + amountToUpdate;
            t.update(mainDocRef, { valor: newTotal });
            t.set(doc(subcollectionRef), newDocData);
        });
        dataForm.reset();
        ivaInput.value = '';
        saldoNetoInput.value = '';
    });
}
initializePage();
