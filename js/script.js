import { collection, onSnapshot, doc, updateDoc, debounce, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Esperar a que la base de datos de Firebase esté disponible en el objeto window
function onDBReady(callback) {
    const interval = setInterval(() => {
        if (window.db) {
            clearInterval(interval);
            callback(window.db);
        }
    }, 100);
}

// Función principal que se ejecuta cuando la BD está lista
onDBReady((db) => {

    // --- CÓDIGO PARA SEMBRAR LA BASE DE DATOS ---
    const initialData = [
        { nombre: "Saldos Bancos", tipo: "activo", valor: 1250000 },
        { nombre: "Saldos Caja Efectivo", tipo: "activo", valor: 85000 },
        { nombre: "Cheques a Cobrar", tipo: "activo", valor: 320000 },
        { nombre: "Cheques en Cartera", tipo: "activo", valor: 150000 },
        { nombre: "Clientes a Cobrar", tipo: "activo", valor: 780000 },
        { nombre: "Órdenes a Facturar", tipo: "activo", valor: 450000 },
        { nombre: "Cheques a Pagar", tipo: "pasivo", valor: 410000 },
        { nombre: "Deudas Proveedores", tipo: "pasivo", valor: 950000 }
    ];

    async function seedDatabase() {
        const itemsCollection = collection(db, 'items');
        console.log("Comenzando el sembrado de la base de datos...");
        for (const item of initialData) {
            try {
                await addDoc(itemsCollection, item);
                console.log(`Documento '${item.nombre}' agregado con éxito.`);
            } catch (error) {
                console.error("Error agregando el documento: ", item.nombre, error);
            }
        }
        console.log("¡Sembrado completado!");
    }
    window.seedDatabase = seedDatabase;
    // --- FIN DEL CÓDIGO DE SEMBRADO ---

    const loadingIndicator = document.getElementById('loading-indicator');
    const totalActivosEl = document.getElementById('total-activos');
    const totalPasivosEl = document.getElementById('total-pasivos');
    const patrimonioNetoEl = document.getElementById('patrimonio-neto');
    const activosList = document.getElementById('activos-list');
    const pasivosList = document.getElementById('pasivos-list');

    let items = {};

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 2
        }).format(value);
    };

    const updateTotals = () => {
        const activos = Object.values(items).filter(item => item.tipo === 'activo');
        const pasivos = Object.values(items).filter(item => item.tipo === 'pasivo');
        const totalActivos = activos.reduce((sum, item) => sum + (item.valor || 0), 0);
        const totalPasivos = pasivos.reduce((sum, item) => sum + (item.valor || 0), 0);
        const patrimonioNeto = totalActivos - totalPasivos;
        totalActivosEl.textContent = formatCurrency(totalActivos);
        totalPasivosEl.textContent = formatCurrency(totalPasivos);
        patrimonioNetoEl.textContent = formatCurrency(patrimonioNeto);
        patrimonioNetoEl.classList.toggle('text-red-600', patrimonioNeto < 0);
        patrimonioNetoEl.classList.toggle('text-blue-600', patrimonioNeto >= 0);
    };

    const renderItemCard = (item) => {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-lg shadow-sm border border-gray-200';
        card.innerHTML = `
            <label class="text-md font-medium text-gray-700">${item.nombre}</label>
            <input type="number" id="input-${item.id}" value="${item.valor}" class="card-input w-full mt-2 p-2 border border-gray-300 rounded-md text-lg text-right font-mono">
        `;
        const debouncedUpdate = debounce(async (newValue) => {
            const itemRef = doc(db, 'items', item.id);
            try {
                await updateDoc(itemRef, { valor: newValue });
            } catch (error) {
                console.error("Error al actualizar el documento: ", error);
            }
        }, 500);
        const input = card.querySelector(`#input-${item.id}`);
        input.addEventListener('input', (e) => {
            const newValue = parseFloat(e.target.value) || 0;
            items[item.id].valor = newValue;
            updateTotals();
            debouncedUpdate(newValue);
        });
        return card;
    };

    const itemsCollection = collection(db, 'items');
    onSnapshot(itemsCollection, (snapshot) => {
        loadingIndicator.style.display = 'none';
        activosList.innerHTML = '';
        pasivosList.innerHTML = '';
        snapshot.docs.forEach(doc => {
            const item = { id: doc.id, ...doc.data() };
            items[item.id] = item;
            const card = renderItemCard(item);
            if (item.tipo === 'activo') {
                activosList.appendChild(card);
            } else if (item.tipo === 'pasivo') {
                pasivosList.appendChild(card);
            }
        });
        updateTotals();
    }, (error) => {
        console.error("Error al obtener datos de Firestore: ", error);
        loadingIndicator.innerText = 'Error al cargar los datos. Verifique la configuración de Firebase.';
    });
});
```

***

### ✅ Etapa 2: Código Final y Limpio

Una vez que hayas cargado los datos iniciales, **reemplaza el contenido de `script.js`** con este código final. Este ya no contiene la función para crear datos, solo para leerlos y actualizarlos.


```javascript
import { collection, onSnapshot, doc, updateDoc, debounce } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Esperar a que la base de datos de Firebase esté disponible en el objeto window
function onDBReady(callback) {
    const interval = setInterval(() => {
        if (window.db) {
            clearInterval(interval);
            callback(window.db);
        }
    }, 100);
}

// Función principal que se ejecuta cuando la BD está lista
onDBReady((db) => {
    const loadingIndicator = document.getElementById('loading-indicator');
    const totalActivosEl = document.getElementById('total-activos');
    const totalPasivosEl = document.getElementById('total-pasivos');
    const patrimonioNetoEl = document.getElementById('patrimonio-neto');
    const activosList = document.getElementById('activos-list');
    const pasivosList = document.getElementById('pasivos-list');

    // Estado local para almacenar los datos
    let items = {};

    // Función para formatear números como moneda ARS
    const formatCurrency = (value) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 2
        }).format(value);
    };

    // Función para actualizar los totales en la UI
    const updateTotals = () => {
        const activos = Object.values(items).filter(item => item.tipo === 'activo');
        const pasivos = Object.values(items).filter(item => item.tipo === 'pasivo');

        const totalActivos = activos.reduce((sum, item) => sum + (item.valor || 0), 0);
        const totalPasivos = pasivos.reduce((sum, item) => sum + (item.valor || 0), 0);
        const patrimonioNeto = totalActivos - totalPasivos;

        totalActivosEl.textContent = formatCurrency(totalActivos);
        totalPasivosEl.textContent = formatCurrency(totalPasivos);
        patrimonioNetoEl.textContent = formatCurrency(patrimonioNeto);
        
        patrimonioNetoEl.classList.toggle('text-red-600', patrimonioNeto < 0);
        patrimonioNetoEl.classList.toggle('text-blue-600', patrimonioNeto >= 0);
    };

    // Función para renderizar una tarjeta de item (activo o pasivo)
    const renderItemCard = (item) => {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-lg shadow-sm border border-gray-200';
        card.innerHTML = `
            <label class="text-md font-medium text-gray-700">${item.nombre}</label>
            <input type="number" id="input-${item.id}" value="${item.valor}" class="card-input w-full mt-2 p-2 border border-gray-300 rounded-md text-lg text-right font-mono">
        `;
        
        // Debounce para evitar demasiadas escrituras en la base de datos
        const debouncedUpdate = debounce(async (newValue) => {
            const itemRef = doc(db, 'items', item.id);
            try {
                await updateDoc(itemRef, { valor: newValue });
            } catch (error) {
                console.error("Error al actualizar el documento: ", error);
            }
        }, 500); // Espera 500ms después de que el usuario deja de escribir

        const input = card.querySelector(`#input-${item.id}`);
        input.addEventListener('input', (e) => {
            const newValue = parseFloat(e.target.value) || 0;
            // Actualizar el estado local inmediatamente para una UI fluida
            items[item.id].valor = newValue;
            updateTotals();
            // Actualizar Firestore con debounce
            debouncedUpdate(newValue);
        });

        return card;
    };

    // Escuchar cambios en la colección 'items' de Firestore
    const itemsCollection = collection(db, 'items');
    onSnapshot(itemsCollection, (snapshot) => {
        loadingIndicator.style.display = 'none'; // Ocultar indicador de carga
        activosList.innerHTML = ''; // Limpiar listas antes de renderizar
        pasivosList.innerHTML = '';
        
        snapshot.docs.forEach(doc => {
            const item = { id: doc.id, ...doc.data() };
            items[item.id] = item; // Guardar/actualizar en el estado local
            
            const card = renderItemCard(item);
            if (item.tipo === 'activo') {
                activosList.appendChild(card);
            } else if (item.tipo === 'pasivo') {
                pasivosList.appendChild(card);
            }
        });

        updateTotals();
    }, (error) => {
        console.error("Error al obtener datos de Firestore: ", error);
        loadingIndicator.innerText = 'Error al cargar los datos. Verifique la configuración de Firebase.';
    });
});
