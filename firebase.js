// ═══════════════════════════════════════════════════════════════
// firebase.js  —  Single Backend Layer for Aari Elegance
// ALL pages import ONLY from this file. No Firebase SDK calls
// anywhere else in the project.
// ═══════════════════════════════════════════════════════════════

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, collection,
  addDoc, updateDoc, deleteDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ── ⚠️  REPLACE WITH YOUR FIREBASE PROJECT CONFIG ─────────────
const _config = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
// ──────────────────────────────────────────────────────────────

const _app     = initializeApp(_config);
const _auth    = getAuth(_app);
const _db      = getFirestore(_app);
const _storage = getStorage(_app);

// ═══════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════

/** Login → returns { user, role, name } */
export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(_auth, email, password);
  const snap = await getDoc(doc(_db, "users", cred.user.uid));
  const data = snap.exists() ? snap.data() : { role: "user", name: email };
  return { user: cred.user, role: data.role || "user", name: data.name || email };
}

/** Register new customer (role = "user") */
export async function registerUser(email, password, name, phone) {
  const cred = await createUserWithEmailAndPassword(_auth, email, password);
  await setDoc(doc(_db, "users", cred.user.uid), {
    name, email, phone, role: "user", createdAt: serverTimestamp()
  });
  return { user: cred.user, role: "user", name };
}

/** Sign out */
export async function logoutUser() {
  await signOut(_auth);
}

/** Subscribe to auth state — returns unsubscribe fn */
export function onAuth(callback) {
  return onAuthStateChanged(_auth, async (user) => {
    if (!user) { callback(null, null); return; }
    const snap = await getDoc(doc(_db, "users", user.uid));
    const data = snap.exists() ? snap.data() : { role: "user", name: user.email };
    callback(user, data);
  });
}

/** Get single user profile by uid */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(_db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Update user role (admin only) */
export async function setUserRole(uid, role) {
  await updateDoc(doc(_db, "users", uid), { role });
}

/** Create a user record in Firestore (admin use) */
export async function createUserRecord(uid, data) {
  await setDoc(doc(_db, "users", uid), { ...data, createdAt: serverTimestamp() });
}

/** Get all users */
export async function getAllUsers() {
  const snap = await getDocs(collection(_db, "users"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Delete user record from Firestore */
export async function deleteUserRecord(uid) {
  await deleteDoc(doc(_db, "users", uid));
}

/** Promote / demote user by email */
export async function promoteUserByEmail(email, role) {
  const snap = await getDocs(query(collection(_db, "users"), where("email", "==", email)));
  if (snap.empty) throw new Error("User not found");
  const uid = snap.docs[0].id;
  await updateDoc(doc(_db, "users", uid), { role });
  return uid;
}

// ═══════════════════════════════════════════════════════════════
//  PRODUCTS
// ═══════════════════════════════════════════════════════════════

export async function addProduct(data) {
  return await addDoc(collection(_db, "products"), {
    ...data, createdAt: serverTimestamp()
  });
}

export async function updateProduct(id, data) {
  await updateDoc(doc(_db, "products", id), data);
}

export async function deleteProduct(id) {
  await deleteDoc(doc(_db, "products", id));
}

export async function getProducts() {
  const snap = await getDocs(
    query(collection(_db, "products"), orderBy("createdAt", "desc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Real-time products listener — returns unsubscribe fn */
export function listenProducts(callback) {
  return onSnapshot(
    query(collection(_db, "products"), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

// ═══════════════════════════════════════════════════════════════
//  TUTORIALS
// ═══════════════════════════════════════════════════════════════

export async function addTutorial(data) {
  return await addDoc(collection(_db, "tutorials"), {
    ...data, createdAt: serverTimestamp()
  });
}

export async function getTutorials() {
  const snap = await getDocs(
    query(collection(_db, "tutorials"), orderBy("createdAt", "desc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteTutorial(id) {
  await deleteDoc(doc(_db, "tutorials", id));
}

// ═══════════════════════════════════════════════════════════════
//  ORDERS
// ═══════════════════════════════════════════════════════════════

export async function placeOrder(data) {
  return await addDoc(collection(_db, "orders"), {
    ...data, status: "pending", createdAt: serverTimestamp()
  });
}

export async function getOrders() {
  const snap = await getDocs(
    query(collection(_db, "orders"), orderBy("createdAt", "desc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getUserOrders(uid) {
  const snap = await getDocs(
    query(collection(_db, "orders"), where("userId", "==", uid), orderBy("createdAt", "desc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateOrderStatus(id, status) {
  await updateDoc(doc(_db, "orders", id), { status });
}

/** Real-time orders listener — returns unsubscribe fn */
export function listenOrders(callback) {
  return onSnapshot(
    query(collection(_db, "orders"), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

// ═══════════════════════════════════════════════════════════════
//  SETTINGS  (UPI, phone, WhatsApp, store name)
// ═══════════════════════════════════════════════════════════════

export async function getSettings() {
  const snap = await getDoc(doc(_db, "settings", "store"));
  return snap.exists() ? snap.data() : {};
}

export async function updateSettings(data) {
  await setDoc(doc(_db, "settings", "store"), data, { merge: true });
}

// ═══════════════════════════════════════════════════════════════
//  OFFERS  (popup banner)
// ═══════════════════════════════════════════════════════════════

export async function getOffer() {
  const snap = await getDoc(doc(_db, "settings", "offer"));
  return snap.exists() ? snap.data() : null;
}

export async function setOffer(data) {
  await setDoc(doc(_db, "settings", "offer"), {
    ...data, updatedAt: serverTimestamp()
  });
}

// ═══════════════════════════════════════════════════════════════
//  CHAT / MESSAGES
// ═══════════════════════════════════════════════════════════════

export async function sendMessage(chatId, text, sender, userName) {
  await addDoc(collection(_db, "messages"), {
    chatId, text, sender, userName, createdAt: serverTimestamp()
  });
}

/** Real-time listener for one chat thread — returns unsubscribe fn */
export function listenMessages(chatId, callback) {
  return onSnapshot(
    query(
      collection(_db, "messages"),
      where("chatId", "==", chatId),
      orderBy("createdAt", "asc")
    ),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

/** Get distinct chat threads (for owner inbox) */
export async function getChats() {
  const snap = await getDocs(
    query(collection(_db, "messages"), orderBy("createdAt", "desc"))
  );
  const map = {};
  snap.docs.forEach(d => {
    const dat = d.data();
    if (!map[dat.chatId]) {
      map[dat.chatId] = {
        chatId:   dat.chatId,
        userName: dat.userName || "Guest",
        lastMsg:  dat.text,
        time:     dat.createdAt
      };
    }
  });
  return Object.values(map);
}

// ═══════════════════════════════════════════════════════════════
//  ENQUIRIES
// ═══════════════════════════════════════════════════════════════

export async function sendEnquiry(name, phone, message) {
  await addDoc(collection(_db, "enquiries"), {
    name, phone, message, createdAt: serverTimestamp()
  });
}

export async function getEnquiries() {
  const snap = await getDocs(
    query(collection(_db, "enquiries"), orderBy("createdAt", "desc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ═══════════════════════════════════════════════════════════════
//  FILE / STORAGE UPLOAD
// ═══════════════════════════════════════════════════════════════

/** Upload file to Firebase Storage → returns public download URL */
export async function uploadFile(file, storagePath) {
  const storRef = ref(_storage, storagePath);
  await uploadBytes(storRef, file);
  return await getDownloadURL(storRef);
}

/** Delete a file from Storage by its full path */
export async function deleteFile(storagePath) {
  const storRef = ref(_storage, storagePath);
  await deleteObject(storRef);
}
