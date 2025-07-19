import { db } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURACIÓN ESPECÍFICA DE ESTA PÁGINA ---
const ITEM_NAME = "Cheques pendiente de cobro";
const SUBCOLLECTION_NAME = "cheques_detalle_pendientes";
const ITEM_TYPE = "activo";

// --- ELEMENTOS DEL DOM ---
const detailTableContainer = document.getElementById('detail-table-container');
const dataForm = document.getElementById('data-form');

// --- FUNCIONES AUXILIARES ---
const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

// --- FUNCIÓN PARA RENDERIZAR LA TABLA DE DETALLES ---
function renderTable(docs) {
    if (docs.length === 0) {
        detailTableContainer.innerHTML = '<p>No hay cheques pendientes de cobro. ¡Agrega el primero desde el formulario de arriba!</p>';
        return;
    }

    let tableHTML = '<div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-200"><thead><tr>';
    const headers = Object.keys(docs[0].data());
    headers.forEach(header => {
        tableHTML += `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${header.replace(/_/g, ' ')}</th>`;
    });
    tableHTML += '</tr></thead><tbody class="bg-white divide-y divide-gray-200">';

    docs.forEach(doc => {
        tableHTML += '<tr>';
        const data = doc.data();
        headers.forEach(header => {
            const value = data[header];
            const displayValue = header === 'monto' ? formatCurrency(value) : value;
            tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${displayValue}</td>`;
        });
        tableHTML += '</tr>';
    });

    tableHTML += '</tbody></table></div>';
    detailTableContainer.innerHTML = tableHTML;
}

// --- FUNCIÓN PRINCIPAL DE INICIALIZACIÓN ---
async function initializePage() {
    const itemsRef = collection(db, 'items');
    let mainDocRef;

    const q = query(itemsRef, where("nombre", "==", ITEM_NAME));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        console.log(`Item principal '${ITEM_NAME}' no encontrado. Creándolo...`);
        try {
            const newMainDoc = await addDoc(itemsRef, { nombre: ITEM_NAME, valor: 0, tipo: ITEM_TYPE });
            mainDocRef = doc(db, 'items', newMainDoc.id);
        } catch (error) {
            console.error("Error creando el documento principal:", error);
            return;
        }
    } else {
        mainDocRef = querySnapshot.docs[0].ref;
    }

    const subcollectionRef = collection(mainDocRef, SUBCOLLECTION_NAME);
    onSnapshot(subcollectionRef, (snapshot) => renderTable(snapshot.docs));

    dataForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(dataForm);
        const newDocData = {};
        
        for (const [key, value] of formData.entries()) {
            const input = dataForm.elements[key];
            newDocData[key] = (input.type === 'number') ? parseFloat(value) : value;
        }
        
        const amountToUpdate = newDocData.monto || 0;

        try {
            await runTransaction(db, async (transaction) => {
                const mainDoc = await transaction.get(mainDocRef);
                if (!mainDoc.exists()) throw "El documento principal no existe!";
                
                const newTotal = (mainDoc.data().valor || 0) + amountToUpdate;
                transaction.update(mainDocRef, { valor: newTotal });
                transaction.set(doc(subcollectionRef), newDocData);
            });
            dataForm.reset();
        } catch (error) {
            console.error("Error en la transacción: ", error);
            alert("Hubo un error al guardar el cheque. Por favor, intenta de nuevo.");
        }
    });
}

initializePage();
