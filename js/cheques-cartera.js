import { db } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const ITEM_NAME = "Cheques en cartera";
const SUBCOLLECTION_NAME = "cheques_detalle_cartera";
const ITEM_TYPE = "activo";

const detailTableContainer = document.getElementById('detail-table-container');
const dataForm = document.getElementById('data-form');
const modal = document.getElementById('reminder-modal');
const closeModalButton = document.getElementById('close-modal-button');
const reminderText = document.getElementById('reminder-text');
const copyButton = document.getElementById('copy-button');
const loadingAI = document.getElementById('loading-ai');

const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

async function generateReminder(librador, monto, fechaCobro) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    loadingAI.classList.remove('hidden');
    reminderText.classList.add('hidden');
    copyButton.classList.add('hidden');
    const prompt = `Escribe un recordatorio amigable y profesional para enviar por WhatsApp a nuestro cliente. El nombre del cliente es '${librador}'. El motivo es recordarle que tenemos un cheque suyo por un monto de ${formatCurrency(monto)} con fecha de cobro el ${fechaCobro}. El tono debe ser cordial pero claro, para asegurar que tenga los fondos disponibles en su cuenta en esa fecha. No incluyas placeholders como "[Tu Nombre]".`;
    try {
        const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=`;
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`Error de red: ${response.statusText}`);
        const result = await response.json();
        if (result.candidates && result.candidates.length > 0) {
            reminderText.value = result.candidates[0].content.parts[0].text;
            loadingAI.classList.add('hidden');
            reminderText.classList.remove('hidden');
            copyButton.classList.remove('hidden');
        } else { throw new Error("No se recibió una respuesta válida de la IA."); }
    } catch (error) {
        console.error("Error llamando a la API de Gemini:", error);
        reminderText.value = "Hubo un error al generar el recordatorio.";
        loadingAI.classList.add('hidden');
        reminderText.classList.remove('hidden');
    }
}

function renderDetails(docs) {
    if (docs.length === 0) {
        detailTableContainer.innerHTML = '<p class="text-center text-gray-500">No hay cheques en cartera.</p>';
        return;
    }
    detailTableContainer.innerHTML = '<div class="details-grid"></div>';
    const grid = detailTableContainer.querySelector('.details-grid');
    docs.forEach(doc => {
        const data = doc.data();
        const card = document.createElement('div');
        card.className = 'detail-card';
        const statusClass = { 'En cartera': 'status-en-cartera', 'Depositado': 'status-depositado' }[data.estado] || 'status-en-cartera';
        card.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">${data.librador}</h3>
                <span class="status-badge ${statusClass}">${data.estado}</span>
            </div>
            <div class="card-body">
                <div class="card-main-info">
                    <p class="card-main-label">Monto del Cheque</p>
                    <p class="card-amount positive">${formatCurrency(data.monto)}</p>
                </div>
                <div class="card-secondary-info">
                    <div class="info-item">
                        <p class="info-label">Fecha Cobro</p>
                        <p class="info-value">${data.fecha_cobro}</p>
                    </div>
                    <div class="info-item">
                        <p class="info-label">Nº Cheque</p>
                        <p class="info-value font-mono">${data.numero_cheque}</p>
                    </div>
                    <div class="info-item">
                        <p class="info-label">Banco</p>
                        <p class="info-value">${data.banco}</p>
                    </div>
                </div>
            </div>
            <div class="card-footer">
                <button class="generate-reminder-btn text-sm bg-blue-100 text-blue-800 font-semibold py-1 px-3 rounded-full hover:bg-blue-200"
                        data-librador="${data.librador}" data-monto="${data.monto}" data-fecha="${data.fecha_cobro}">
                    ✨ Generar Recordatorio
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
    grid.querySelectorAll('.generate-reminder-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const { librador, monto, fecha } = e.currentTarget.dataset;
            generateReminder(librador, monto, fecha);
        });
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
        const amountToUpdate = newDocData.monto || 0;
        await runTransaction(db, async (t) => {
            const mainDoc = await t.get(mainDocRef);
            if (!mainDoc.exists()) throw "Doc principal no existe!";
            const newTotal = (mainDoc.data().valor || 0) + amountToUpdate;
            t.update(mainDocRef, { valor: newTotal });
            t.set(doc(subcollectionRef), newDocData);
        });
        dataForm.reset();
    });
}

closeModalButton.addEventListener('click', () => modal.classList.add('hidden'));
copyButton.addEventListener('click', () => {
    reminderText.select();
    document.execCommand('copy');
    copyButton.textContent = '¡Copiado!';
    setTimeout(() => { copyButton.textContent = 'Copiar Texto'; }, 2000);
});

initializePage();
