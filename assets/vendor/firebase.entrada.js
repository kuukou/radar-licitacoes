// Só o necessário do Firebase: login por e-mail/senha e leitura/gravação de um documento.
export { initializeApp } from "firebase/app";
export {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
  deleteUser, EmailAuthProvider, reauthenticateWithCredential, connectAuthEmulator,
} from "firebase/auth";
export { getFirestore, doc, getDoc, setDoc, deleteDoc, serverTimestamp, connectFirestoreEmulator } from "firebase/firestore/lite";
