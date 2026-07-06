import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported as isMessagingSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyCVfETXFbWm2b8ywy8auurgf8r80unQ3A4",
  authDomain: "elitecarehub-a80da.firebaseapp.com",
  databaseURL: "https://elitecarehub-a80da-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "elitecarehub-a80da",
  storageBucket: "elitecarehub-a80da.firebasestorage.app",
  messagingSenderId: "76292607120",
  appId: "1:76292607120:web:29ac5fae7fb4e58876dc15"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Cloud Messaging isn't available in every environment (e.g. some Android
// WebViews, older browsers). This resolves to a messaging instance only
// where supported — callers should always await it and handle `null`.
let messagingInstance = null;
let messagingChecked  = false;
export async function getMessagingInstance() {
  if (messagingChecked) return messagingInstance;
  messagingChecked = true;
  try {
    if (await isMessagingSupported()) messagingInstance = getMessaging(app);
  } catch {
    messagingInstance = null;
  }
  return messagingInstance;
}

export default app;
