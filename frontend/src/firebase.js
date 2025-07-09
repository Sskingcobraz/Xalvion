// Replace the config with your own from Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyD7VVnsGzMDP7j0HnudibwTWIFYyQoqG8A",
    authDomain: "xalvion.firebaseapp.com",
    projectId: "xalvion",
    storageBucket: "xalvion.firebasestorage.app",
    messagingSenderId: "782688475514",
    appId: "1:782688475514:web:a84ac4b483eabd52cd5ec3",
    measurementId: "G-HHEQMWEPHL"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { auth, googleProvider, RecaptchaVerifier, signInWithPhoneNumber };
