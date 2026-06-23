// ═══════════════════════════════════════════════════════════════
// firebase.js  —  Backend Layer for Aari Elegance
// ═══════════════════════════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, collection,
  addDoc, updateDoc, deleteDoc, getDocs,
  query, where, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const _app  = initializeApp({
  apiKey: "AIzaSyBR8CWIveXMn0yVFfVK4jgFql1WQfQYnhw",
  authDomain: "aari-web-41113.firebaseapp.com",
  projectId: "aari-web-41113",
  storageBucket: "aari-web-41113.firebasestorage.app",
  messagingSenderId: "207040525163",
  appId: "1:207040525163:web:746599625ea525dc36122e"
});
const _auth = getAuth(_app);
const _db   = getFirestore(_app);
const _stor = getStorage(_app);

// Client-side sort by createdAt desc
function byDate(arr) {
  return arr.sort((a, b) => {
    const ts = x => (x.createdAt?.seconds) || (x.createdAt?.toMillis ? x.createdAt.toMillis() / 1000 : 0);
    return ts(b) - ts(a);
  });
}

// ── AUTH ─────────────────────────────────────────────────────
export async function loginUser(email, pass) {
  const c = await signInWithEmailAndPassword(_auth, email, pass);
  const s = await getDoc(doc(_db, "users", c.user.uid));
  const d = s.exists() ? s.data() : { role: "user", name: email };
  return { user: c.user, role: d.role || "user", name: d.name || email };
}

export async function registerUser(email, pass, name, phone) {
  const c = await createUserWithEmailAndPassword(_auth, email, pass);
  await setDoc(doc(_db, "users", c.user.uid), {
    name, email, phone: phone || '', role: "user",
    address: {}, wishlist: [], totalOrders: 0, createdAt: serverTimestamp()
  });
  return { user: c.user, role: "user", name };
}

export const logoutUser = () => signOut(_auth);

export function onAuth(cb) {
  return onAuthStateChanged(_auth, async u => {
    if (!u) return cb(null, null);
    try {
      const s = await getDoc(doc(_db, "users", u.uid));
      cb(u, s.exists() ? s.data() : { role: "user", name: u.email });
    } catch { cb(u, { role: "user", name: u.email }); }
  });
}

export async function getUserProfile(uid) {
  const s = await getDoc(doc(_db, "users", uid));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export async function setUserRole(uid, role) {
  await updateDoc(doc(_db, "users", uid), { role });
}

export async function createUserRecord(uid, data) {
  await setDoc(doc(_db, "users", uid), { ...data, createdAt: serverTimestamp() });
}

export async function getAllUsers() {
  const s = await getDocs(collection(_db, "users"));
  return byDate(s.docs.map(d => ({ id: d.id, ...d.data() })));
}

export async function deleteUserRecord(uid) {
  await deleteDoc(doc(_db, "users", uid));
}

export async function promoteUserByEmail(email, role) {
  const s = await getDocs(query(collection(_db, "users"), where("email", "==", email)));
  if (s.empty) throw new Error("User not found");
  await updateDoc(doc(_db, "users", s.docs[0].id), { role });
  return s.docs[0].id;
}

// ── PRODUCTS ─────────────────────────────────────────────────
export const addProduct    = d  => addDoc(collection(_db, "products"), { ...d, createdAt: serverTimestamp() });
export const updateProduct = (id, d) => updateDoc(doc(_db, "products", id), d);
export const deleteProduct = id => deleteDoc(doc(_db, "products", id));

export async function getProducts() {
  const s = await getDocs(collection(_db, "products"));
  return byDate(s.docs.map(d => ({ id: d.id, ...d.data() })));
}

export function listenProducts(cb) {
  return onSnapshot(collection(_db, "products"), s =>
    cb(byDate(s.docs.map(d => ({ id: d.id, ...d.data() })))));
}

// ── TUTORIALS ────────────────────────────────────────────────
export const addTutorial    = d  => addDoc(collection(_db, "tutorials"), { ...d, createdAt: serverTimestamp() });
export const deleteTutorial = id => deleteDoc(doc(_db, "tutorials", id));

export async function getTutorials() {
  const s = await getDocs(collection(_db, "tutorials"));
  return byDate(s.docs.map(d => ({ id: d.id, ...d.data() })));
}

export function listenTutorials(cb) {
  return onSnapshot(collection(_db, "tutorials"), s =>
    cb(byDate(s.docs.map(d => ({ id: d.id, ...d.data() })))));
}

// ── ORDERS ───────────────────────────────────────────────────
export const placeOrder       = d  => addDoc(collection(_db, "orders"), { ...d, status: "pending", createdAt: serverTimestamp() });
export const updateOrderStatus = (id, status) => updateDoc(doc(_db, "orders", id), { status, updatedAt: serverTimestamp() });

export async function getOrders() {
  const s = await getDocs(collection(_db, "orders"));
  return byDate(s.docs.map(d => ({ id: d.id, ...d.data() })));
}

export async function getUserOrders(uid) {
  const s = await getDocs(query(collection(_db, "orders"), where("userId", "==", uid)));
  return byDate(s.docs.map(d => ({ id: d.id, ...d.data() })));
}

export function listenOrders(cb) {
  return onSnapshot(collection(_db, "orders"), s =>
    cb(byDate(s.docs.map(d => ({ id: d.id, ...d.data() })))));
}

// ── SETTINGS ─────────────────────────────────────────────────
export async function getSettings() {
  try { const s = await getDoc(doc(_db, "settings", "store")); return s.exists() ? s.data() : {}; }
  catch { return {}; }
}
export const updateSettings = d => setDoc(doc(_db, "settings", "store"), d, { merge: true });

// ── OFFERS ───────────────────────────────────────────────────
export async function getOffer() {
  try { const s = await getDoc(doc(_db, "settings", "offer")); return s.exists() ? s.data() : null; }
  catch { return null; }
}
export const setOffer = d => setDoc(doc(_db, "settings", "offer"), { ...d, updatedAt: serverTimestamp() });

// ── CHAT / MESSAGES ──────────────────────────────────────────
export const sendMessage = (chatId, text, sender, userName) =>
  addDoc(collection(_db, "messages"), { chatId, text, sender, userName, createdAt: serverTimestamp() });

// Listen to messages for a specific chatId, sorted oldest→newest
export function listenMessages(chatId, cb) {
  return onSnapshot(
    query(collection(_db, "messages"), where("chatId", "==", chatId)),
    snap => cb([...byDate(snap.docs.map(d => ({ id: d.id, ...d.data() })))].reverse())
  );
}

// Real-time chat list — groups by chatId, keeps LATEST message per conversation
export function listenChats(cb) {
  return onSnapshot(collection(_db, "messages"), snap => {
    const map = {};
    snap.docs.forEach(d => {
      const data = d.data();
      const existing = map[data.chatId];
      const ts = x => x?.createdAt?.seconds || 0;
      if (!existing || ts(data) > ts(existing)) {
        map[data.chatId] = { chatId: data.chatId, userName: data.userName || "Guest", lastMsg: data.text, time: data.createdAt, sender: data.sender };
      }
    });
    // Sort by latest message time desc
    cb(Object.values(map).sort((a, b) => (b.time?.seconds || 0) - (a.time?.seconds || 0)));
  });
}

// One-time fetch for chat list (used in admin)
export async function getChats() {
  const snap = await getDocs(collection(_db, "messages"));
  const map = {};
  snap.docs.forEach(d => {
    const data = d.data();
    const existing = map[data.chatId];
    const ts = x => x?.createdAt?.seconds || 0;
    if (!existing || ts(data) > ts(existing)) {
      map[data.chatId] = { chatId: data.chatId, userName: data.userName || "Guest", lastMsg: data.text, time: data.createdAt };
    }
  });
  return Object.values(map).sort((a, b) => (b.time?.seconds || 0) - (a.time?.seconds || 0));
}

// ── ENQUIRIES ────────────────────────────────────────────────
export const sendEnquiry = (name, phone, message) =>
  addDoc(collection(_db, "enquiries"), { name, phone, message, createdAt: serverTimestamp() });

export async function getEnquiries() {
  const s = await getDocs(collection(_db, "enquiries"));
  return byDate(s.docs.map(d => ({ id: d.id, ...d.data() })));
}

// ── FILE UPLOAD ───────────────────────────────────────────────
export async function uploadFile(file, path) {
  const r = ref(_stor, path);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}
export const deleteFile = path => deleteObject(ref(_stor, path));
