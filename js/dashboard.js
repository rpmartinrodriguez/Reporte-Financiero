import { db } from './firebase-config.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Elementos del DOM del dashboard
const totalActivosEl = document.getElementById('total-activos');
const totalPasivosEl = document.getElementById('total-pasivos');
const patrimonioNetoEl = document.getElementById('patrimonio-neto');
const activosListEl = document.getElementById('activos-list');
const pasivosListEl = document.getElementById('pasivos-list');

const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

// Mapeo de nombres de items a nombres de archivos HTML
const pageMapping = {
    "Saldos Bancos": "bancos.html",
    "Clientes a Cobrar": "clientes.html",
    "Cheques a Cobrar": "cheques.html"
    // Agrega aquí más mapeos para otras páginas
};

const itemsCollection = collection(db, 'items');

onSnapshot(itemsCollection, (snapshot) => {
    let totalActivos = 0;
    let totalPasivos = 0;
    
    activosListEl.innerHTML = '';
    pasivosListEl.innerHTML = '';

    snapshot.docs.forEach(doc => {
        const item = { id: doc.id, ...doc.data() };

        // Crear la tarjeta
        const href = pageMapping[item.nombre] || '#'; // Enlace o '#' si no hay página de detalle
        const card = document.createElement(href === '#' ? 'div' : 'a');
        if (href !== '#') card.href = href;

        card.className = 'card-link-item block bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-lg hover:border-blue-500 transition-all duration-200';
        
        card.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="text-md font-medium text-gray-700">${item.nombre}</span>
                <span class="text-lg font-mono">${formatCurrency(item.valor)}</span>
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

    // Actualizar los totales del resumen
    totalActivosEl.textContent = formatCurrency(totalActivos);
    totalPasivosEl.textContent = formatCurrency(totalPasivos);
    patrimonioNetoEl.textContent = formatCurrency(totalActivos - totalPasivos);
});
