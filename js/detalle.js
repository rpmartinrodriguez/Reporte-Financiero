import { db } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- ELEMENTOS DEL DOM Y CONFIGURACIÓN ---
const detailTableContainer = document.getElementById('detail-table-container');
const dataForm = document.getElementById('data-form');
const { itemName, subcollectionName } = window.pageData;

const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

// --- LÓGICA DE CÁLCULO AUTOMÁTICO (EJEMPLO PARA CLIENTES) ---
if (dataForm && dataForm.elements.saldo_bruto) {
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
}

// --- RENDERIZADO DE LA TABLA ---
function renderTable(docs) {
    if (docs.length === 0) {
        detailTableContainer.innerHTML = '<p>No hay detalles para mostrar. ¡Agrega el primero!</p>';
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
            const displayValue = (typeof value === 'number' && header.includes('saldo')) ? formatCurrency(value) : value;
            tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${displayValue}</td>`;
        });
        tableHTML += '</tr>';
    });

    tableHTML += '</tbody></table></div>';
    detailTableContainer.innerHTML = tableHTML;
}

// --- LÓGICA PRINCIPAL DE LA PÁGINA ---
async function setupDetailPage() {
    if (!itemName || !subcollectionName) {
        detailTableContainer.innerHTML = '<p class="text-red-500">Error: Configuración de página incompleta.</p>';
        return;
    }

    // 1. Encontrar el ID del documento principal (ej. "Clientes a Cobrar")
    const itemsRef = collection(db, 'items');
    const q = query(itemsRef, where("nombre", "==", itemName));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        console.error(`No se encontró el item principal '${itemName}'`);
        return;
    }
    const mainDocId = querySnapshot.docs[0].id;
    const mainDocRef = doc(db, 'items', mainDocId);

    // 2. Escuchar cambios en la subcolección en tiempo real
    const subcollectionRef = collection(db, 'items', mainDocId, subcollectionName);
    onSnapshot(subcollectionRef, (snapshot) => {
        renderTable(snapshot.docs);
    });

    // 3. Manejar el envío del formulario
    dataForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(dataForm);
        const newDocData = {};
        let amountToUpdate = 0;

        // Convertir FormData a un objeto y determinar el monto a actualizar
        for (const [key, value] of formData.entries()) {
            const input = dataForm.elements[key];
            newDocData[key] = (input.type === 'number') ? parseFloat(value) : value;
        }
        
        // El monto que afecta al total es el saldo_neto o el monto del movimiento
        amountToUpdate = newDocData.saldo_neto || newDocData.monto || 0;

        try {
            // Usar una transacción para garantizar la consistencia de los datos
            await runTransaction(db, async (transaction) => {
                const mainDoc = await transaction.get(mainDocRef);
                if (!mainDoc.exists()) {
                    throw "El documento principal no existe!";
                }

                // Calcular el nuevo total y actualizar el documento principal
                const newTotal = (mainDoc.data().valor || 0) + amountToUpdate;
                transaction.update(mainDocRef, { valor: newTotal });

                // Agregar el nuevo documento a la subcolección
                transaction.set(doc(subcollectionRef), newDocData);
            });

            console.log("¡Transacción completada con éxito!");
            dataForm.reset(); // Limpiar el formulario
            if (dataForm.elements.iva) dataForm.elements.iva.value = ''; // Limpiar campos readonly
            if (dataForm.elements.saldo_neto) dataForm.elements.saldo_neto.value = '';

        } catch (error) {
            console.error("Error en la transacción: ", error);
            alert("Hubo un error al guardar los datos. Por favor, intenta de nuevo.");
        }
    });
}

setupDetailPage();
