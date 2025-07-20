import { db } from './firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Elementos del DOM del dashboard
const totalActivosEl = document.getElementById('total-activos');
const totalPasivosEl = document.getElementById('total-pasivos');
const activosListEl = document.getElementById('activos-list');
const pasivosListEl = document.getElementById('pasivos-list');

const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

// Mapeo de nombres de items a nombres de archivos HTML (ACTUALIZADO)
const pageMapping = {
    // Activos
    "Clientes a Cobrar": "clientes.html",
    "Cheques en cartera": "cheques-cartera.html",
    "Cheques pendiente de cobro": "cheques-pendientes.html",
    // Pasivos
    "Proveedores a pagar": "proveedores.html",
    "Cheques a pagar": "cheques-pagar.html"
};

const itemsCollection = collection(db, 'items');

onSnapshot(itemsCollection, (snapshot) => {
    let totalActivos = 0;
    let totalPasivos = 0;
    
    activosListEl.innerHTML = '';
    pasivosListEl.innerHTML = '';

    const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    itemsData.forEach(item => {
        const href = pageMapping[item.nombre] || '#'; // Enlace o '#' si no hay página de detalle
        const card = document.createElement('a');
        card.href = href;
        card.className = 'detail-card-link';
        
        card.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="text-lg font-medium text-gray-800">${item.nombre}</span>
                <div class="flex items-center space-x-2">
                    <span class="text-xl font-semibold text-gray-900">${formatCurrency(item.valor)}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>
                </div>
            </div>
        `;

        if (item.tipo === 'activo') {
            totalActivos += item.valor;
            activosListEl.appendChild(card);
        } else if (item.tipo === 'pasivo') {
            totalPasivos += item.valor;
            pasivosListEl.appendChild(card);
        }
    });

    // Actualizar los totales generales
    totalActivosEl.textContent = formatCurrency(totalActivos);
    totalPasivosEl.textContent = formatCurrency(totalPasivos);

    // Si una lista está vacía, mostrar un mensaje
    if (activosListEl.innerHTML === '') {
        activosListEl.innerHTML = '<p class="text-gray-500">No hay cuentas de activo para mostrar. Agrega datos desde el menú de navegación.</p>';
    }
    if (pasivosListEl.innerHTML === '') {
        pasivosListEl.innerHTML = '<p class="text-gray-500">No hay cuentas de pasivo para mostrar. Agrega datos desde el menú de navegación.</p>';
    }
});
