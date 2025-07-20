import { db, authReady } from './firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Esperamos a que la autenticación esté lista antes de ejecutar cualquier código.
authReady.then(() => {
    // --- ELEMENTOS DEL DOM ---
    const balanceForm = document.getElementById('balance-form');
    const balanceInput = document.getElementById('initial-balance');
    const currentBalanceDisplay = document.getElementById('current-balance-display');

    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    // Referencia a un documento específico para la configuración
    const configRef = doc(db, 'config', 'initial_balances');

    // --- Cargar el saldo guardado al iniciar la página ---
    async function loadInitialBalance() {
        try {
            const docSnap = await getDoc(configRef);
            if (docSnap.exists()) {
                const balance = docSnap.data().saldo_bancario_inicial || 0;
                balanceInput.value = balance;
                currentBalanceDisplay.textContent = formatCurrency(balance);
            } else {
                currentBalanceDisplay.textContent = formatCurrency(0);
            }
        } catch (error) {
            console.error("Error cargando el saldo inicial:", error);
            currentBalanceDisplay.textContent = "Error al cargar";
        }
    }

    // --- Guardar el nuevo saldo ---
    balanceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newBalance = parseFloat(balanceInput.value);

        if (isNaN(newBalance)) {
            alert("Por favor, ingresa un número válido.");
            return;
        }

        try {
            // Usamos setDoc con merge:true para crear o actualizar el documento
            await setDoc(configRef, { saldo_bancario_inicial: newBalance }, { merge: true });
            currentBalanceDisplay.textContent = formatCurrency(newBalance);
            alert("¡Saldo inicial guardado con éxito!");
        } catch (error) {
            console.error("Error guardando el saldo inicial:", error);
            alert("Hubo un error al guardar el saldo.");
        }
    });

    // --- INICIALIZACIÓN ---
    loadInitialBalance();
});
