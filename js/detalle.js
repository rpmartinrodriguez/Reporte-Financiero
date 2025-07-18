import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const detailContentEl = document.getElementById('detail-content');
const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

// Obtiene la información específica de la página desde el objeto global
const { itemName, subcollectionName } = window.pageData;

async function loadDetailData() {
    if (!itemName || !subcollectionName) {
        detailContentEl.innerHTML = '<p class="text-red-500">Error: No se ha configurado la información de la página.</p>';
        return;
    }

    try {
        // 1. Encontrar el documento principal para obtener su ID
        const itemsRef = collection(db, 'items');
        const q = query(itemsRef, where("nombre", "==", itemName));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            detailContentEl.innerHTML = `<p>No se encontró el item principal llamado "${itemName}".</p>`;
            return;
        }

        const mainItemId = querySnapshot.docs[0].id;

        // 2. Usar el ID para acceder a la subcolección
        const subcollectionRef = collection(db, 'items', mainItemId, subcollectionName);
        const detailSnapshot = await getDocs(subcollectionRef);

        if (detailSnapshot.empty) {
            detailContentEl.innerHTML = '<p>No hay detalles para mostrar en esta sección.</p>';
            return;
        }

        // 3. Renderizar la tabla con los datos de la subcolección
        let tableHTML = '<div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-200"><thead><tr>';
        const headers = Object.keys(detailSnapshot.docs[0].data());
        headers.forEach(header => {
            tableHTML += `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${header}</th>`;
        });
        tableHTML += '</tr></thead><tbody class="bg-white divide-y divide-gray-200">';

        detailSnapshot.docs.forEach(doc => {
            tableHTML += '<tr>';
            const data = doc.data();
            headers.forEach(header => {
                const value = data[header];
                const displayValue = (typeof value === 'number') ? formatCurrency(value) : value;
                tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${displayValue}</td>`;
            });
            tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table></div>';
        detailContentEl.innerHTML = tableHTML;

    } catch (error) {
        console.error("Error cargando los datos de detalle:", error);
        detailContentEl.innerHTML = '<p class="text-red-500">Ocurrió un error al cargar los detalles. Revisa la consola.</p>';
    }
}

// Cargar los datos cuando la página se abre
loadDetailData();
