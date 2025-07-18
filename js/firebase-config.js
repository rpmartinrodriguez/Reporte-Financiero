// Importa las funciones que necesitas de los SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Tu configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBxB8IwYDVN8I22uZLUTE_ps4YTzAPEi2A",
  authDomain: "reporte-financiero-b8449.firebaseapp.com",
  projectId: "reporte-financiero-b8449",
  storageBucket: "reporte-financiero-b8449.appspot.com",
  messagingSenderId: "59867653983",
  appId: "1:59867653983:web:5343523a67bb0c533fb8ea"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Inicia sesión de forma anónima para cumplir las reglas de seguridad
signInAnonymously(auth).catch((error) => {
    console.error("Fallo el inicio de sesión anónimo:", error);
});

// Exporta la instancia de la base de datos para que otros scripts la puedan usar
export { db };
