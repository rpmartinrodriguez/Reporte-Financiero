import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBxB8IwYDVN8I22uZLUTE_ps4YTzAPEi2A",
  authDomain: "reporte-financiero-b8449.firebaseapp.com",
  projectId: "reporte-financiero-b8449",
  storageBucket: "reporte-financiero-b8449.appspot.com",
  messagingSenderId: "59867653983",
  appId: "1:59867653983:web:5343523a67bb0c533fb8ea"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Creamos una promesa que se resuelve cuando la autenticación está lista
const authReady = new Promise(resolve => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // El usuario está autenticado (anónimamente en este caso)
      resolve(user);
    }
  });
});

// Inicia el proceso de inicio de sesión anónimo
signInAnonymously(auth).catch((error) => {
    console.error("Fallo el inicio de sesión anónimo:", error);
});

// Exportamos la base de datos y la promesa de autenticación
export { db, authReady };
