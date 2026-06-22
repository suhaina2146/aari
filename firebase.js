// ═══════════════════════════════════════════════════════════════
// firebase.js  —  Single Backend Layer for Aari Elegance
// ALL pages import ONLY from this file.
// FIXED: Removed compound orderBy queries that require Firestore indexes.
//        Sorting is now done client-side after fetch.
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
  query, where, orderBy, onSnapshot, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBR8CWIveXMn0yVFfVK4jgFql1WQfQYnhw",
  authDomain: "aari-web-41113.firebaseapp.com",
  projectId: "aari-web-41113",
  storageBucket: "aari-web-41113.firebasestorage.app",
  messagingSenderId: "207040525163",
  appId: "1:207040525163:web:746599625ea525dc36122e",
  measurementId: "G-PT1M2LD427"
};

const _app     = initializeApp(firebaseConfig);
const _auth    = getAuth(_app);
const _db      = getFirestore(_app);
const _storage = getStorage(_app);

// Helper: sort array by createdAt descending (client-side)
function sortByDate(arr) {
  return arr.sort((a, b) => {
    const ta = a.createdAt?.seconds || a.createdAt?.toMillis?.() / 1000 || 0;
    const tb = b.createdAt?.seconds || b.createdAt?.toMillis?.() / 1000 || 0;
    return tb - ta;
  });
}

// ═══════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════

export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(_auth, email, password);
  const snap = await getDoc(doc(_db, "users", cred.user.uid));
  const data = snap.exists() ? snap.data() : { role: "user", name: email };
  return { user: cred.user, role: data.role || "user", name: data.name || email };
}

export async function registerUser(email, password, name, phone) {
  const cred = await createUserWithEmailAndPassword(_auth, email, password);
  await setDoc(doc(_db, "users", cred.user.uid), {
    name, email, phone: phone || '', role: "user", createdAt: serverTimestamp()
  });
  return { user: cred.user, role: "user", name };
}

export async function logoutUser() {
  await signOut(_auth);
}

export function onAuth(callback) {
  return onAuthStateChanged(_auth, async (user) => {
    if (!user) { callback(null, null); return; }
    try {
      const snap = await getDoc(doc(_db, "users", user.uid));
      const data = snap.exists() ? snap.data() : { role: "user", name: user.email };
      callback(user, data);
    } catch(e) {
      callback(user, { role: "user", name: user.email });
    }
  });
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(_db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function setUserRole(uid, role) {
  await updateDoc(doc(_db, "users", uid), { role });
}

export async function createUserRecord(uid, data) {
  await setDoc(doc(_db, "users", uid), { ...data, createdAt: serverTimestamp() });
}

export async function getAllUsers() {
  const snap = await getDocs(collection(_db, "users"));
  return sortByDate(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

export async function deleteUserRecord(uid) {
  await deleteDoc(doc(_db, "users", uid));
}

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

// FIXED: No orderBy to avoid index requirement — sort client-side
export async function getProducts() {
  const snap = await getDocs(collection(_db, "products"));
  return sortByDate(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

// Real-time listener — no orderBy, sort client-side
export function listenProducts(callback) {
  return onSnapshot(collection(_db, "products"), snap => {
    callback(sortByDate(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  });
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
  const snap = await getDocs(collection(_db, "tutorials"));
  return sortByDate(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

// Real-time listener for tutorials
export function listenTutorials(callback) {
  return onSnapshot(collection(_db, "tutorials"), snap => {
    callback(sortByDate(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  });
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
  const snap = await getDocs(collection(_db, "orders"));
  return sortByDate(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

// FIXED: getUserOrders — no compound query (no index needed)
// Fetches all user orders by userId only, sorts client-side
export async function getUserOrders(uid) {
  const snap = await getDocs(query(collection(_db, "orders"), where("userId", "==", uid)));
  return sortByDate(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

export async function updateOrderStatus(id, status) {
  await updateDoc(doc(_db, "orders", id), { status, updatedAt: serverTimestamp() });
}

export function listenOrders(callback) {
  return onSnapshot(collection(_db, "orders"), snap => {
    callback(sortByDate(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  });
}

// ═══════════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════════

export async function getSettings() {
  try {
    const snap = await getDoc(doc(_db, "settings", "store"));
    return snap.exists() ? snap.data() : {};
  } catch(e) { return {}; }
}

export async function updateSettings(data) {
  await setDoc(doc(_db, "settings", "store"), data, { merge: true });
}

// ═══════════════════════════════════════════════════════════════
//  OFFERS
// ═══════════════════════════════════════════════════════════════

export async function getOffer() {
  try {
    const snap = await getDoc(doc(_db, "settings", "offer"));
    return snap.exists() ? snap.data() : null;
  } catch(e) { return null; }
}

export async function setOffer(data) {
  await setDoc(doc(_db, "settings", "offer"), {
    ...data, updatedAt: serverTimestamp()
  });
}

// ═══════════════════════════════════════════════════════════════
//  CHAT / MESSAGES
// FIXED: No compound orderBy — fetch by chatId only, sort client-side
// ═══════════════════════════════════════════════════════════════

export async function sendMessage(chatId, text, sender, userName) {
  await addDoc(collection(_db, "messages"), {
    chatId, text, sender, userName, createdAt: serverTimestamp()
  });
}

// FIXED: No compound query — filter client-side after fetching by chatId
export function listenMessages(chatId, callback) {
  return onSnapshot(
    query(collection(_db, "messages"), where("chatId", "==", chatId)),
    snap => {
      const msgs = sortByDate(snap.docs.map(d => ({ id: d.id, ...d.data() }))).reverse();
      callback(msgs);
    }
  );
}

export async function getChats() {
  const snap = await getDocs(collection(_db, "messages"));
  const map = {};
  const sorted = sortByDate(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  sorted.forEach(dat => {
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
  const snap = await getDocs(collection(_db, "enquiries"));
  return sortByDate(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

// ═══════════════════════════════════════════════════════════════
//  FILE / STORAGE UPLOAD
// ═══════════════════════════════════════════════════════════════

export async function uploadFile(file, storagePath) {
  const storRef = ref(_storage, storagePath);
  await uploadBytes(storRef, file);
  return await getDownloadURL(storRef);
}

export async function deleteFile(storagePath) {
  const storRef = ref(_storage, storagePath);
  await deleteObject(storRef);
}
