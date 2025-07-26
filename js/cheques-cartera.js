import { db, authReady } from './firebase-config.js';
import { collection, doc, addDoc, onSnapshot, runTransaction, query, where, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

authReady.then(() => {
    // --- CONFIGURACIÓN Y CONSTANTES ---
    const ITEM_NAME = "Cheques en cartera";
    const SUBCOLLECTION_NAME = "cheques_detalle_cartera";
    const ITEM_TYPE = "activo";

    // --- ELEMENTOS DEL DOM ---
    const detailTableContainer = document.getElementById('detail-table-container');
    const dataForm = document.getElementById('data-form');
    const searchInput = document.getElementById('search-input');
    const statusFilter = document.getElementById('status-filter');
    const modal = document.getElementById('reminder-modal');
    const closeModalButton = document.getElementById('close-modal-button');
    const reminderText = document.getElementById('reminder-text');
    const copyButton = document.getElementById('copy-button');
    const loadingAI = document.getElementById('loading-ai');

    // --- ESTADO GLOBAL DE LA PÁGINA ---
    let allDocs = []; // Almacenamos todos los documentos aquí para filtrar

    // --- FUNCIONES AUXILIARES ---
    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    // --- LÓGICA DE IA (GEMINI) ---
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

    // --- LÓGICA DE NEGOCIO (FLUJOS DE TRABAJO) ---
    async function depositCheque(chequeId, chequeData) {
        if (!confirm(`¿Estás seguro de que quieres mover este cheque a "Pendiente de cobro"?`)) return;
        try {
            await runTransaction(db, async (transaction) => {
                const itemsRef = collection(db, 'items');
                const carteraQuery = query(itemsRef, where("nombre", "==", "Cheques en cartera"));
                const carteraSnap = await getDocs(carteraQuery);
                if (carteraSnap.empty) throw new Error("No se encontró la categoría 'Cheques en cartera'");
                const carteraDocRef = carteraSnap.docs[0].ref;
                const sourceChequeRef = doc(db, carteraDocRef.path, SUBCOLLECTION_NAME, chequeId);
                const pendientesQuery = query(itemsRef, where("nombre", "==", "Cheques pendiente de cobro"));
                let pendientesSnap = await getDocs(pendientesQuery);
                let pendientesDocRef;
                if (pendientesSnap.empty) {
                    const newPendientesDoc = await addDoc(itemsRef, { nombre: "Cheques pendiente de cobro", valor: 0, tipo: "activo" });
                    pendientesDocRef = doc(db, 'items', newPendientesDoc.id); // Corregido para obtener la referencia correcta
                } else {
                    pendientesDocRef = pendientesSnap.docs[0].ref;
                }
                const targetChequeRef = doc(collection(pendientesDocRef, "cheques_detalle_pendientes"));
                const carteraDoc = await transaction.get(carteraDocRef);
                const pendientesDoc = await transaction.get(pendientesDocRef);
                const monto = chequeData.monto;
                const newCarteraTotal = (carteraDoc.data().valor || 0) - monto;
                const newPendientesTotal = (pendientesDoc.data()?.valor || 0) + monto; // Usar optional chaining por si es un doc nuevo
                const newChequeData = { ...chequeData, estado: "Depositado" };
                transaction.update(carteraDocRef, { valor: newCarteraTotal });
                transaction.update(pendientesDocRef, { valor: newPendientesTotal });
                transaction.delete(sourceChequeRef);
                transaction.set(targetChequeRef, newChequeData);
            });
            alert("¡Cheque movido a 'Pendiente de cobro' con éxito!");
        } catch (error) {
            console.error("Error al depositar el cheque:", error);
            alert("Hubo un error al procesar la operación.");
        }
    }

    // --- LÓGICA DE RENDERIZADO Y FILTROS ---
    function applyFilters() {
        const searchTerm = searchInput.value.toLowerCase();
        const status = statusFilter.value;
        const filteredDocs = allDocs.filter(doc => {
            const data = doc.data();
            const matchesSearch = searchTerm === '' || 
                Object.values(data).some(value => 
                    String(value).toLowerCase().includes(searchTerm)
                );
            const matchesStatus = status === 'todos' || data.estado === status;
            return matchesSearch && matchesStatus;
        });
        renderDetails(filteredDocs);
    }

    function renderDetails(docs) {
        if (docs.length === 0) {
            detailTableContainer.innerHTML = '<p class="text-center text-gray-500">No se encontraron resultados.</p>';
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
                <div class="card-header"><h3 class="card-title">${data.librador}</h3><span class="status-badge ${statusClass}">${data.estado}</span></div>
                <div class="card-body">
                    <div class="card-main-info"><p class="card-main-label">Monto del Cheque</p><p class="card-amount positive">${formatCurrency(data.monto)}</p></div>
                    <div class="card-secondary-info">
                        <div class="info-item"><p class="info-label">Fecha Cobro</p><p class="info-value">${data.fecha_cobro}</p></div>
                        <div class="info-item"><p class="info-label">Nº Cheque</p><p class="info-value font-mono">${data.numero_cheque}</p></div>
                        <div class="info-item"><p class="info-label">Banco</p><p class="info-value">${data.banco}</p></div>
                    </div>
                </div>
                <div class="card-footer">
                    <button class="action-button secondary deposit-cheque-btn" data-id="${doc.id}" data-cheque='${JSON.stringify(data)}'>Depositar</button>
                    <button class="action-button primary generate-reminder-btn" data-librador="${data.librador}" data-monto="${data.monto}" data-fecha="${data.fecha_cobro}">✨ Recordatorio</button>
                </div>
            `;
            grid.appendChild(card);
        });
        
        detailTableContainer.querySelectorAll('.generate-reminder-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const { librador, monto, fecha } = e.currentTarget.dataset;
                generateReminder(librador, monto, fecha);
            });
        });
        detailTableContainer.querySelectorAll('.deposit-cheque-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const chequeId = e.currentTarget.dataset.id;
                const chequeData = JSON.parse(e.currentTarget.dataset.cheque);
                depositCheque(chequeId, chequeData);
            });
        });
    }

    // --- FUNCIÓN PRINCIPAL DE INICIALIZACIÓN ---
    async function initializePage() {
        searchInput.addEventListener('input', applyFilters);
        statusFilter.addEventListener('change', applyFilters);

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
        onSnapshot(subcollectionRef, (snapshot) => {
            allDocs = snapshot.docs;
            applyFilters();
        });
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
});
