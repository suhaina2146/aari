// ═══════════════════════════════════════════════════════════════
// firebase.js  —  Single Backend Layer for Aari Elegance
// Auto-initializes ALL Firestore collections & default documents.
// ALL pages import ONLY from this file.
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
  query, where, orderBy, onSnapshot, serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ── Firebase Project Config ────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBR8CWIveXMn0yVFfVK4jgFql1WQfQYnhw",
  authDomain: "aari-web-41113.firebaseapp.com",
  projectId: "aari-web-41113",
  storageBucket: "aari-web-41113.firebasestorage.app",
  messagingSenderId: "207040525163",
  appId: "1:207040525163:web:746599625ea525dc36122e",
  measurementId: "G-PT1M2LD427"
};
// ──────────────────────────────────────────────────────────────

const _app     = initializeApp(firebaseConfig);
const _auth    = getAuth(_app);
const _db      = getFirestore(_app);
const _storage = getStorage(_app);

// ═══════════════════════════════════════════════════════════════
//  SCHEMA DEFINITIONS
//  These describe every field in every collection. Used for
//  auto-init and for documenting the data model.
// ═══════════════════════════════════════════════════════════════

const SCHEMAS = {

  // ── users/{uid} ──────────────────────────────────────────────
  user: {
    name:        "",          // Full name
    email:       "",          // Email address
    phone:       "",          // Phone / WhatsApp number
    role:        "user",      // "user" | "owner" | "admin"
    photoURL:    "",          // Profile picture URL (optional)
    address: {                // Last-used delivery address
      line:  "",
      city:  "",
      state: "",
      pin:   ""
    },
    wishlist:    [],          // Array of product IDs
    totalOrders: 0,           // Denormalized counter
    createdAt:   null,        // serverTimestamp()
    lastLoginAt: null         // serverTimestamp() — updated on login
  },

  // ── products/{id} ────────────────────────────────────────────
  product: {
    name:        "",          // Product title
    category:    "",          // blouse | jacket | saree | dupatta | lehenga | kurti
    price:       0,           // Selling price (Rs.)
    oldPrice:    null,        // Original price for strikethrough (null = no discount)
    description: "",          // Full description
    badge:       null,        // "new" | "hot" | "sale" | null
    sizes:       [],          // ["XS","S","M","L","XL","XXL"]
    imageUrl:    "",          // Firebase Storage download URL
    storagePath: "",          // Storage path for deletion
    inStock:     true,        // Availability flag
    createdAt:   null,        // serverTimestamp()
    updatedAt:   null         // serverTimestamp()
  },

  // ── orders/{id} ──────────────────────────────────────────────
  order: {
    userId:      "",          // Auth UID of customer
    userEmail:   "",          // Customer email (denormalized)
    items: [{                 // Array of cart items
      id:          "",
      name:        "",
      price:       0,
      qty:         1,
      size:        "",
      note:        "",
      imageUrl:    ""
    }],
    address: {                // Delivery address snapshot
      name:  "",
      phone: "",
      line:  "",
      city:  "",
      state: "",
      pin:   ""
    },
    total:       0,           // Total including delivery (Rs.)
    payMethod:   "upi",       // "upi" | "cod"
    suggestions: "",          // Customer notes / special requests
    status:      "pending",   // pending | confirmed | shipped | delivered | cancelled
    statusHistory: [],        // [{status, at: timestamp, by: uid}]
    trackingId:  "",          // Courier tracking number (optional)
    createdAt:   null,        // serverTimestamp()
    updatedAt:   null         // serverTimestamp()
  },

  // ── tutorials/{id} ───────────────────────────────────────────
  tutorial: {
    title:       "",          // Tutorial title
    description: "",          // Short description
    tag:         "Beginner",  // "Beginner" | "Intermediate" | "Advanced" | "Bridal"
    videoUrl:    "",          // YouTube URL
    duration:    "",          // e.g. "24 min"
    thumbnail:   "",          // Custom thumbnail URL (optional)
    createdAt:   null,        // serverTimestamp()
    updatedAt:   null
  },

  // ── messages/{id} ────────────────────────────────────────────
  message: {
    chatId:    "",            // "user_{uid}" or "guest_{timestamp}"
    text:      "",            // Message text
    sender:    "user",        // "user" | "owner"
    userName:  "",            // Display name / email
    read:      false,         // Read receipt for owner
    createdAt: null           // serverTimestamp()
  },

  // ── enquiries/{id} ───────────────────────────────────────────
  enquiry: {
    name:      "",            // Contact name
    phone:     "",            // Contact phone
    message:   "",            // Enquiry text
    status:    "new",         // "new" | "replied" | "closed"
    reply:     "",            // Owner reply (optional)
    createdAt: null,          // serverTimestamp()
    repliedAt: null
  },

  // ── settings/store ───────────────────────────────────────────
  storeSettings: {
    storeName:   "Aari Elegance",
    tagline:     "Handcrafted with Love",
    upi:         "",          // UPI ID for payments
    phone:       "",          // Contact phone
    wa:          "",          // WhatsApp number
    email:       "",          // Store email
    address:     "",          // Physical address
    instagram:   "",
    facebook:    "",
    youtube:     "",
    currency:    "Rs.",
    deliveryFee: 50,
    minOrder:    0,
    updatedAt:   null
  },

  // ── settings/offer ───────────────────────────────────────────
  offerSettings: {
    active:      false,
    emoji:       "🌸",
    title:       "Grand Festive Sale!",
    description: "Exclusive discounts on all handcrafted Aari designs.",
    code:        "AARI20",
    updatedAt:   null
  }
};

// ═══════════════════════════════════════════════════════════════
//  AUTO-INIT  —  Creates missing Firestore documents with
//  default values. Runs once on first page load per session.
//  Uses sessionStorage flag so it only fires once per tab.
// ═══════════════════════════════════════════════════════════════

async function _autoInitFirestore() {
  if (sessionStorage.getItem("ae_init_done")) return;
  try {
    const batch = writeBatch(_db);
    let needsWrite = false;

    // settings/store
    const storeRef = doc(_db, "settings", "store");
    const storeSnap = await getDoc(storeRef);
    if (!storeSnap.exists()) {
      batch.set(storeRef, { ...SCHEMAS.storeSettings, updatedAt: serverTimestamp() });
      needsWrite = true;
    }

    // settings/offer
    const offerRef = doc(_db, "settings", "offer");
    const offerSnap = await getDoc(offerRef);
    if (!offerSnap.exists()) {
      batch.set(offerRef, { ...SCHEMAS.offerSettings, updatedAt: serverTimestamp() });
      needsWrite = true;
    }

    if (needsWrite) await batch.commit();
    sessionStorage.setItem("ae_init_done", "1");
  } catch(e) {
    // Silent fail — app still works even if init fails
    console.warn("Firestore auto-init skipped:", e.message);
  }
}

// Run auto-init immediately (non-blocking)
_autoInitFirestore();

// ═══════════════════════════════════════════════════════════════
//  HELPERS — build full user document with all required fields
// ═══════════════════════════════════════════════════════════════

function _buildUserDoc(fields = {}) {
  return {
    name:        fields.name        || "",
    email:       fields.email       || "",
    phone:       fields.phone       || "",
    role:        fields.role        || "user",
    photoURL:    fields.photoURL    || "",
    address: {
      line:  fields.address?.line  || "",
      city:  fields.address?.city  || "",
      state: fields.address?.state || "",
      pin:   fields.address?.pin   || ""
    },
    wishlist:    fields.wishlist    || [],
    totalOrders: fields.totalOrders || 0,
    createdAt:   fields.createdAt   || serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
}

function _buildProductDoc(fields = {}) {
  return {
    name:        fields.name        || "",
    category:    fields.category    || "",
    price:       Number(fields.price) || 0,
    oldPrice:    fields.oldPrice != null ? Number(fields.oldPrice) : null,
    description: fields.description || "",
    badge:       fields.badge       || null,
    sizes:       Array.isArray(fields.sizes) ? fields.sizes : ["XS","S","M","L","XL","XXL"],
    imageUrl:    fields.imageUrl    || "",
    storagePath: fields.storagePath || "",
    inStock:     fields.inStock !== undefined ? !!fields.inStock : true,
    createdAt:   fields.createdAt   || serverTimestamp(),
    updatedAt:   serverTimestamp()
  };
}

function _buildOrderDoc(fields = {}) {
  return {
    userId:      fields.userId      || "",
    userEmail:   fields.userEmail   || "",
    items:       Array.isArray(fields.items) ? fields.items.map(i => ({
      id:       i.id       || "",
      name:     i.name     || "",
      price:    Number(i.price) || 0,
      qty:      Number(i.qty)   || 1,
      size:     i.size     || "",
      note:     i.note     || "",
      imageUrl: i.imageUrl || ""
    })) : [],
    address: {
      name:  fields.address?.name  || "",
      phone: fields.address?.phone || "",
      line:  fields.address?.line  || "",
      city:  fields.address?.city  || "",
      state: fields.address?.state || "",
      pin:   fields.address?.pin   || ""
    },
    total:         Number(fields.total) || 0,
    payMethod:     fields.payMethod     || "upi",
    suggestions:   fields.suggestions   || "",
    status:        "pending",
    statusHistory: [{ status: "pending", at: serverTimestamp(), by: fields.userId || "system" }],
    trackingId:    "",
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp()
  };
}

function _buildTutorialDoc(fields = {}) {
  return {
    title:       fields.title       || "",
    description: fields.description || "",
    tag:         fields.tag         || "Beginner",
    videoUrl:    fields.videoUrl    || "",
    duration:    fields.duration    || "",
    thumbnail:   fields.thumbnail   || "",
    createdAt:   fields.createdAt   || serverTimestamp(),
    updatedAt:   serverTimestamp()
  };
}

function _buildMessageDoc(fields = {}) {
  return {
    chatId:    fields.chatId    || "",
    text:      fields.text      || "",
    sender:    fields.sender    || "user",
    userName:  fields.userName  || "",
    read:      fields.read      || false,
    createdAt: serverTimestamp()
  };
}

function _buildEnquiryDoc(fields = {}) {
  return {
    name:      fields.name    || "",
    phone:     fields.phone   || "",
    message:   fields.message || "",
    status:    "new",
    reply:     "",
    createdAt: serverTimestamp(),
    repliedAt: null
  };
}

// ═══════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════

/** Login → returns { user, role, name }. Updates lastLoginAt. */
export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(_auth, email, password);
  const userRef = doc(_db, "users", cred.user.uid);
  const snap    = await getDoc(userRef);

  if (snap.exists()) {
    // Update lastLoginAt on every login
    await updateDoc(userRef, { lastLoginAt: serverTimestamp() });
    const data = snap.data();
    return { user: cred.user, role: data.role || "user", name: data.name || email };
  } else {
    // User exists in Auth but not Firestore — auto-create full document
    const newDoc = _buildUserDoc({ email, role: "user", name: email });
    await setDoc(userRef, newDoc);
    return { user: cred.user, role: "user", name: email };
  }
}

/** Register new customer (role = "user") — creates full Firestore document */
export async function registerUser(email, password, name, phone) {
  const cred    = await createUserWithEmailAndPassword(_auth, email, password);
  const userDoc = _buildUserDoc({ name, email, phone, role: "user" });
  await setDoc(doc(_db, "users", cred.user.uid), userDoc);
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
    const userRef = doc(_db, "users", user.uid);
    const snap    = await getDoc(userRef);
    if (snap.exists()) {
      callback(user, snap.data());
    } else {
      // Auto-create Firestore record if missing
      const newDoc = _buildUserDoc({ email: user.email, role: "user", name: user.email });
      await setDoc(userRef, newDoc);
      callback(user, newDoc);
    }
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

/** Update user profile fields */
export async function updateUserProfile(uid, fields) {
  const allowed = { name:1, phone:1, photoURL:1, address:1 };
  const safe    = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed[k]));
  await updateDoc(doc(_db, "users", uid), safe);
}

/** Create a full user record in Firestore (admin use — Auth account must already exist) */
export async function createUserRecord(uid, fields) {
  const userDoc = _buildUserDoc(fields);
  await setDoc(doc(_db, "users", uid), userDoc);
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

export async function addProduct(fields) {
  return await addDoc(collection(_db, "products"), _buildProductDoc(fields));
}

export async function updateProduct(id, fields) {
  const safe = _buildProductDoc(fields);
  delete safe.createdAt; // never overwrite createdAt on update
  await updateDoc(doc(_db, "products", id), safe);
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

export function listenProducts(callback) {
  return onSnapshot(
    query(collection(_db, "products"), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

// ═══════════════════════════════════════════════════════════════
//  TUTORIALS
// ═══════════════════════════════════════════════════════════════

export async function addTutorial(fields) {
  return await addDoc(collection(_db, "tutorials"), _buildTutorialDoc(fields));
}

export async function updateTutorial(id, fields) {
  const safe = _buildTutorialDoc(fields);
  delete safe.createdAt;
  await updateDoc(doc(_db, "tutorials", id), safe);
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

export async function placeOrder(fields) {
  const orderDoc = _buildOrderDoc(fields);
  const ref      = await addDoc(collection(_db, "orders"), orderDoc);

  // Increment user's totalOrders counter
  if (fields.userId) {
    try {
      const userRef = doc(_db, "users", fields.userId);
      const usnap   = await getDoc(userRef);
      if (usnap.exists()) {
        await updateDoc(userRef, { totalOrders: (usnap.data().totalOrders || 0) + 1 });
      }
    } catch(e) { /* non-critical */ }
  }
  return ref;
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

/** Update order status and append to statusHistory */
export async function updateOrderStatus(id, status, byUid = "system") {
  await updateDoc(doc(_db, "orders", id), {
    status,
    updatedAt:     serverTimestamp(),
    statusHistory: /* Firestore arrayUnion equivalent — read first then update */
      await (async () => {
        const snap = await getDoc(doc(_db, "orders", id));
        const hist = snap.exists() ? (snap.data().statusHistory || []) : [];
        return [...hist, { status, at: serverTimestamp(), by: byUid }];
      })()
  });
}

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
  if (snap.exists()) return snap.data();
  // Auto-create with defaults if missing
  const defaults = { ...SCHEMAS.storeSettings, updatedAt: serverTimestamp() };
  await setDoc(doc(_db, "settings", "store"), defaults);
  return defaults;
}

export async function updateSettings(fields) {
  await setDoc(doc(_db, "settings", "store"), {
    ...fields,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// ═══════════════════════════════════════════════════════════════
//  OFFERS  (popup banner)
// ═══════════════════════════════════════════════════════════════

export async function getOffer() {
  const snap = await getDoc(doc(_db, "settings", "offer"));
  if (snap.exists()) return snap.data();
  // Auto-create with defaults
  const defaults = { ...SCHEMAS.offerSettings, updatedAt: serverTimestamp() };
  await setDoc(doc(_db, "settings", "offer"), defaults);
  return defaults;
}

export async function setOffer(fields) {
  await setDoc(doc(_db, "settings", "offer"), {
    ...SCHEMAS.offerSettings,
    ...fields,
    updatedAt: serverTimestamp()
  });
}

// ═══════════════════════════════════════════════════════════════
//  CHAT / MESSAGES
// ═══════════════════════════════════════════════════════════════

export async function sendMessage(chatId, text, sender, userName) {
  await addDoc(collection(_db, "messages"), _buildMessageDoc({ chatId, text, sender, userName }));
}

/** Mark all messages in a chat as read */
export async function markChatRead(chatId) {
  const snap = await getDocs(
    query(collection(_db, "messages"), where("chatId", "==", chatId), where("read", "==", false))
  );
  const batch = writeBatch(_db);
  snap.docs.forEach(d => batch.update(d.ref, { read: true }));
  if (!snap.empty) await batch.commit();
}

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
        unread:   dat.read === false && dat.sender !== "owner" ? 1 : 0,
        time:     dat.createdAt
      };
    } else if (dat.read === false && dat.sender !== "owner") {
      map[dat.chatId].unread = (map[dat.chatId].unread || 0) + 1;
    }
  });
  return Object.values(map);
}

// ═══════════════════════════════════════════════════════════════
//  ENQUIRIES
// ═══════════════════════════════════════════════════════════════

export async function sendEnquiry(name, phone, message) {
  await addDoc(collection(_db, "enquiries"), _buildEnquiryDoc({ name, phone, message }));
}

export async function getEnquiries() {
  const snap = await getDocs(
    query(collection(_db, "enquiries"), orderBy("createdAt", "desc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function replyEnquiry(id, reply) {
  await updateDoc(doc(_db, "enquiries", id), {
    reply,
    status:    "replied",
    repliedAt: serverTimestamp()
  });
}

export async function closeEnquiry(id) {
  await updateDoc(doc(_db, "enquiries", id), { status: "closed" });
}

// ═══════════════════════════════════════════════════════════════
//  FILE / STORAGE UPLOAD
// ═══════════════════════════════════════════════════════════════

/** Upload file to Firebase Storage → returns { url, path } */
export async function uploadFile(file, storagePath) {
  const storRef = ref(_storage, storagePath);
  await uploadBytes(storRef, file);
  const url = await getDownloadURL(storRef);
  return { url, path: storagePath };
}

/** Delete a file from Storage by its full path */
export async function deleteFile(storagePath) {
  if (!storagePath) return;
  try {
    const storRef = ref(_storage, storagePath);
    await deleteObject(storRef);
  } catch(e) {
    console.warn("deleteFile:", e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
//  EXPORT SCHEMAS for external reference (admin UI, etc.)
// ═══════════════════════════════════════════════════════════════
export { SCHEMAS };
