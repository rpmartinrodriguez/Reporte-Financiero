import { db } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURACIÓN ESPECÍFICA DE ESTA PÁGINA ---
const ITEM_NAME = "Clientes a Cobrar";
const SUBCOLLECTION_NAME = "facturas";
const ITEM_TYPE = "activo";

// --- ELEMENTOS DEL DOM ---
const detailTableContainer = document.getElementById('detail-table-container');
const dataForm = document.getElementById('data-form');

// --- FUNCIONES AUXILIARES ---
const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

// --- LÓGICA DE CÁLCULO AUTOMÁTICO EN EL FORMULARIO ---
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

// --- FUNCIÓN PARA RENDERIZAR LA TABLA DE DETALLES ---
function renderTable(docs) {
    if (docs.length === 0) {
        detailTableContainer.innerHTML = '<p>No hay facturas cargadas. ¡Agrega la primera desde el formulario de arriba!</p>';
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
            const displayValue = (typeof value === 'number' && (header.includes('saldo') || header.includes('iva'))) ? formatCurrency(value) : value;
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

    // 1. BUSCAR el documento principal (ej. "Clientes a Cobrar")
    const q = query(itemsRef, where("nombre", "==", ITEM_NAME));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        // 2.A. SI NO EXISTE, CREARLO AUTOMÁTICAMENTE
        console.log(`Item principal '${ITEM_NAME}' no encontrado. Creándolo...`);
        try {
            const newMainDoc = await addDoc(itemsRef, {
                nombre: ITEM_NAME,
                valor: 0,
                tipo: ITEM_TYPE
            });
            mainDocRef = doc(db, 'items', newMainDoc.id);
        } catch (error) {
            console.error("Error creando el documento principal:", error);
            alert("Error crítico al inicializar la base de datos.");
            return;
        }
    } else {
        // 2.B. SI YA EXISTE, OBTENER SU REFERENCIA
        mainDocRef = querySnapshot.docs[0].ref;
    }

    // 3. ESCUCHAR CAMBIOS en la subcolección para mantener la tabla actualizada
    const subcollectionRef = collection(mainDocRef, SUBCOLLECTION_NAME);
    onSnapshot(subcollectionRef, (snapshot) => {
        renderTable(snapshot.docs);
    });

    // 4. MANEJAR EL ENVÍO DEL FORMULARIO
    dataForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(dataForm);
        const newDocData = {};
        
        for (const [key, value] of formData.entries()) {
            const input = dataForm.elements[key];
            newDocData[key] = (input.type === 'number') ? parseFloat(value) : value;
        }
        
        const amountToUpdate = newDocData.saldo_neto || 0;

        try {
            // Usar una transacción para actualizar el total y agregar el detalle de forma segura
            await runTransaction(db, async (transaction) => {
                const mainDoc = await transaction.get(mainDocRef);
                if (!mainDoc.exists()) throw "El documento principal no existe!";
                
                const newTotal = (mainDoc.data().valor || 0) + amountToUpdate;
                transaction.update(mainDocRef, { valor: newTotal });
                transaction.set(doc(subcollectionRef), newDocData);
            });

            dataForm.reset();
            ivaInput.value = '';
            saldoNetoInput.value = '';

        } catch (error) {
            console.error("Error en la transacción: ", error);
            alert("Hubo un error al guardar la factura. Por favor, intenta de nuevo.");
        }
    });
}

// Iniciar todo al cargar la página
initializePage();
