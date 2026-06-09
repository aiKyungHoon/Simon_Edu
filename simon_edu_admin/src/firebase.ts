import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCMT0S0XCJ5N8e3giFkS7jJxMf8qhVIfs0",
  authDomain: "simon-edu-bible-game.firebaseapp.com",
  projectId: "simon-edu-bible-game",
  storageBucket: "simon-edu-bible-game.firebasestorage.app",
  messagingSenderId: "895429107859",
  appId: "1:895429107859:web:cae6da2ceb403b5747ed66"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
