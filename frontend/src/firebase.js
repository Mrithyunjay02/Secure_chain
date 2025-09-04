// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// If you want Analytics, uncomment the next line:
// import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAmFpoJ4-dhpAq4yssk8nwOQlB9hR7KOEc",
  authDomain: "cloud-security-and-monitoring.firebaseapp.com",
  projectId: "cloud-security-and-monitoring",
  storageBucket: "cloud-security-and-monitoring.appspot.com", // corrected!
  messagingSenderId: "190472911646",
  appId: "1:190472911646:web:c5c87e23edeac23621670f",
  measurementId: "G-EZLS4MM120"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the services you use
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
// If you want analytics, export it as well
// export const analytics = getAnalytics(app);
