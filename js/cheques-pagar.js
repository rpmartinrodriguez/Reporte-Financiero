import { db } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURACIÓN ---
const ITEM_NAME = "Cheques a pagar";
const SUBCOLLECTION_NAME = "cheques_emitidos";
const ITEM_TYPE = "pasivo";

// --- ELEMENTOS DEL DOM ---
const detailTableContainer = document.getElementById('detail-table-container');
const dataForm = document.getElementById('data-form');

const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

// --- RENDERIZADO DE LA TABLA ---
function renderTable(docs) {
    if (docs.length === 0) {
        detailTableContainer.innerHTML = '<p>No hay cheques emitidos.</p>';
        return;
    }
    let tableHTML = '<div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-200"><thead><tr>';
    const headers = Object.keys(docs[0].data());
    headers.forEach(h => tableHTML += `<th class="th-style">${h.replace(/_/g, ' ')}</th>`);
    tableHTML += '</tr></thead><tbody class="bg-white divide-y divide-gray-200">';
    docs.forEach(doc => {
        tableHTML += '<tr>';
        const data = doc.data();
        headers.forEach(header => {
            const value = data[header];
            const displayValue = header === 'monto' ? formatCurrency(value) : value;
            tableHTML += `<td class="td-style">${displayValue}</td>`;
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

    // Cargar nuevo cheque manualmente
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
