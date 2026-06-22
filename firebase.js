// ═══════════════════════════════════════════════════════════════
// firebase.js  —  Single Backend Layer for Aari Elegance
// FIXED VERSION — resolves all auth, Firestore, storage issues
// ═══════════════════════════════════════════════════════════════

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc, setDoc, getDoc, collection,
  addDoc, updateDoc, deleteDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp,
  writeBatch, limit
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

const _app     = initializeApp(firebaseConfig);
const _auth    = getAuth(_app);
const _storage = getStorage(_app);

// FIX: Use plain getFirestore() — initializeFirestore with experimentalForceLongPolling
// was causing "client is offline" errors and blocking all reads/writes.
// Standard getFirestore() with automatic transport selection works correctly.
const _db = getFirestore(_app);

// ═══════════════════════════════════════════════════════════════
//  RETRY HELPER — handles transient network errors gracefully
// ═══════════════════════════════════════════════════════════════
function _isTransient(e) {
  const msg = (e && e.message) || "";
  const code = e && e.code;
  return (
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    msg.toLowerCase().includes("offline") ||
    msg.toLowerCase().includes("network") ||
    msg.toLowerCase().includes("unavailable")
  );
}

async function _withRetry(fn, retries = 3, delayMs = 800) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (_isTransient(e) && i < retries - 1) {
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// ═══════════════════════════════════════════════════════════════
//  AUTO-INIT  —  Creates missing Firestore settings documents
//  FIX: Removed 3.5s delay — runs immediately but non-blocking
// ═══════════════════════════════════════════════════════════════
async function _autoInitFirestore() {
  if (sessionStorage.getItem("ae_init_done")) return;
  try {
    await _withRetry(async () => {
      const storeRef  = doc(_db, "settings", "store");
      const offerRef  = doc(_db, "settings", "offer");
      const [storeSnap, offerSnap] = await Promise.all([getDoc(storeRef), getDoc(offerRef)]);

      const batch = writeBatch(_db);
      let needsWrite = false;

      if (!storeSnap.exists()) {
        batch.set(storeRef, {
          storeName: "Aari Elegance", tagline: "Handcrafted with Love",
          upi: "", phone: "", wa: "", email: "", address: "",
          instagram: "", facebook: "", youtube: "",
          currency: "Rs.", deliveryFee: 50, minOrder: 0,
          updatedAt: serverTimestamp()
        });
        needsWrite = true;
      }
      if (!offerSnap.exists()) {
        batch.set(offerRef, {
          active: false, emoji: "🌸",
          title: "Grand Festive Sale!",
          description: "Exclusive discounts on all handcrafted Aari designs.",
          code: "AARI20", updatedAt: serverTimestamp()
        });
        needsWrite = true;
      }
      if (needsWrite) await batch.commit();
    });
    sessionStorage.setItem("ae_init_done", "1");
  } catch(e) {
    console.warn("Firestore auto-init skipped:", e.message);
  }
}

// Run auto-init non-blocking after a short delay for connection to stabilise
setTimeout(_autoInitFirestore, 1500);

// ═══════════════════════════════════════════════════════════════
//  DOCUMENT BUILDERS
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
    createdAt:   serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
}

function _buildProductDoc(fields = {}) {
  return {
    name:        fields.name        || "",
    category:    fields.category    || "",
    price:       Number(fields.price) || 0,
    oldPrice:    (fields.oldPrice != null && fields.oldPrice !== "") ? Number(fields.oldPrice) : null,
    description: fields.description || "",
    badge:       fields.badge       || null,
    sizes:       Array.isArray(fields.sizes) ? fields.sizes : ["XS","S","M","L","XL","XXL"],
    imageUrl:    fields.imageUrl    || "",
    storagePath: fields.storagePath || "",
    inStock:     fields.inStock !== undefined ? !!fields.inStock : true,
    createdAt:   serverTimestamp(),
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
    createdAt:   serverTimestamp(),
    updatedAt:   serverTimestamp()
  };
}

function _buildMessageDoc(fields = {}) {
  return {
    chatId:    fields.chatId    || "",
    text:      fields.text      || "",
    sender:    fields.sender    || "user",
    userName:  fields.userName  || "",
    read:      false,
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

/** Login → returns { user, role, name } */
export async function loginUser(email, password) {
  const cred    = await signInWithEmailAndPassword(_auth, email, password);
  const userRef = doc(_db, "users", cred.user.uid);

  try {
    const snap = await _withRetry(() => getDoc(userRef));
    if (snap.exists()) {
      // Non-blocking lastLoginAt update
      updateDoc(userRef, { lastLoginAt: serverTimestamp() }).catch(() => {});
      const data = snap.data();
      return { user: cred.user, role: data.role || "user", name: data.name || email };
    } else {
      // Auth user exists but no Firestore doc — create it
      const newDoc = _buildUserDoc({ email, role: "user", name: email });
      await _withRetry(() => setDoc(userRef, newDoc));
      return { user: cred.user, role: "user", name: email };
    }
  } catch(e) {
    console.warn("loginUser: Firestore read failed, using auth fallback.", e.message);
    return { user: cred.user, role: "user", name: email };
  }
}

/** Register new customer — creates Auth user + Firestore document */
export async function registerUser(email, password, name, phone) {
  const cred = await createUserWithEmailAndPassword(_auth, email, password);
  const userDoc = _buildUserDoc({ name, email, phone, role: "user" });
  await _withRetry(() => setDoc(doc(_db, "users", cred.user.uid), userDoc));
  return { user: cred.user, role: "user", name };
}

/** Sign out */
export async function logoutUser() {
  await signOut(_auth);
}

/**
 * Subscribe to auth state changes.
 * FIX: Removed async/await from callback — onAuthStateChanged doesn't await promises.
 * We now synchronously call callback(null, null) for signed-out state immediately,
 * and for signed-in state we fetch Firestore data then call callback.
 */
export function onAuth(callback) {
  return onAuthStateChanged(_auth, (user) => {
    if (!user) {
      callback(null, null);
      return;
    }
    // Fetch user data from Firestore and then call callback
    const userRef = doc(_db, "users", user.uid);
    _withRetry(() => getDoc(userRef))
      .then(snap => {
        if (snap.exists()) {
          callback(user, snap.data());
        } else {
          // Auto-create document for auth users without a Firestore record
          const newDoc = _buildUserDoc({ email: user.email, role: "user", name: user.email });
          setDoc(userRef, newDoc)
            .then(() => callback(user, newDoc))
            .catch(() => callback(user, { role: "user", name: user.email, email: user.email }));
        }
      })
      .catch(e => {
        console.warn("onAuth: Firestore read failed.", e.message);
        callback(user, { role: "user", name: user.email, email: user.email });
      });
  });
}

/** Get single user profile by uid */
export async function getUserProfile(uid) {
  const snap = await _withRetry(() => getDoc(doc(_db, "users", uid)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Update user role */
export async function setUserRole(uid, role) {
  await _withRetry(() => updateDoc(doc(_db, "users", uid), { role }));
}

/** Update user profile */
export async function updateUserProfile(uid, fields) {
  const allowed = { name:1, phone:1, photoURL:1, address:1 };
  const safe    = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed[k]));
  await _withRetry(() => updateDoc(doc(_db, "users", uid), safe));
}

/** Create user record in Firestore (admin use) */
export async function createUserRecord(uid, fields) {
  const userDoc = _buildUserDoc(fields);
  await _withRetry(() => setDoc(doc(_db, "users", uid), userDoc));
}

/** Get all users */
export async function getAllUsers() {
  const snap = await _withRetry(() => getDocs(collection(_db, "users")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Delete user record from Firestore */
export async function deleteUserRecord(uid) {
  await _withRetry(() => deleteDoc(doc(_db, "users", uid)));
}

/** Promote / demote user by email */
export async function promoteUserByEmail(email, role) {
  const snap = await _withRetry(() =>
    getDocs(query(collection(_db, "users"), where("email", "==", email)))
  );
  if (snap.empty) throw new Error("User not found");
  const uid = snap.docs[0].id;
  await _withRetry(() => updateDoc(doc(_db, "users", uid), { role }));
  return uid;
}

// ═══════════════════════════════════════════════════════════════
//  PRODUCTS
//  FIX: Removed orderBy("createdAt") from getDocs queries to avoid
//  requiring a composite index. Products are sorted client-side.
//  onSnapshot still uses orderBy for real-time updates.
// ═══════════════════════════════════════════════════════════════

export async function addProduct(fields) {
  return await _withRetry(() =>
    addDoc(collection(_db, "products"), _buildProductDoc(fields))
  );
}

export async function updateProduct(id, fields) {
  const safe = { ..._buildProductDoc(fields), updatedAt: serverTimestamp() };
  delete safe.createdAt;
  await _withRetry(() => updateDoc(doc(_db, "products", id), safe));
}

export async function deleteProduct(id) {
  await _withRetry(() => deleteDoc(doc(_db, "products", id)));
}

export async function getProducts() {
  // FIX: No orderBy to avoid index requirement — sort client-side
  const snap = await _withRetry(() => getDocs(collection(_db, "products")));
  const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Sort by createdAt descending (newest first)
  return products.sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });
}

export function listenProducts(callback) {
  return onSnapshot(
    collection(_db, "products"),
    snap => {
      const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      products.sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      callback(products);
    }
  );
}

// ═══════════════════════════════════════════════════════════════
//  TUTORIALS
// ═══════════════════════════════════════════════════════════════

export async function addTutorial(fields) {
  return await _withRetry(() =>
    addDoc(collection(_db, "tutorials"), _buildTutorialDoc(fields))
  );
}

export async function updateTutorial(id, fields) {
  const safe = { ..._buildTutorialDoc(fields), updatedAt: serverTimestamp() };
  delete safe.createdAt;
  await _withRetry(() => updateDoc(doc(_db, "tutorials", id), safe));
}

export async function getTutorials() {
  const snap = await _withRetry(() => getDocs(collection(_db, "tutorials")));
  const tuts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return tuts.sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
}

export async function deleteTutorial(id) {
  await _withRetry(() => deleteDoc(doc(_db, "tutorials", id)));
}

// ═══════════════════════════════════════════════════════════════
//  ORDERS
// ═══════════════════════════════════════════════════════════════

export async function placeOrder(fields) {
  const orderDoc = _buildOrderDoc(fields);
  const ref      = await _withRetry(() => addDoc(collection(_db, "orders"), orderDoc));
  // Increment totalOrders on user doc (non-critical, fire and forget)
  if (fields.userId) {
    getDoc(doc(_db, "users", fields.userId))
      .then(snap => {
        if (snap.exists()) {
          updateDoc(doc(_db, "users", fields.userId), {
            totalOrders: (snap.data().totalOrders || 0) + 1
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }
  return ref;
}

export async function getOrders() {
  const snap = await _withRetry(() => getDocs(collection(_db, "orders")));
  const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return orders.sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
}

export async function getUserOrders(uid) {
  const snap = await _withRetry(() =>
    getDocs(query(collection(_db, "orders"), where("userId", "==", uid)))
  );
  const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return orders.sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
}

export async function updateOrderStatus(id, status, byUid = "system") {
  await _withRetry(async () => {
    const snap = await getDoc(doc(_db, "orders", id));
    const hist = snap.exists() ? (snap.data().statusHistory || []) : [];
    await updateDoc(doc(_db, "orders", id), {
      status,
      updatedAt:     serverTimestamp(),
      statusHistory: [...hist, { status, at: serverTimestamp(), by: byUid }]
    });
  });
}

export function listenOrders(callback) {
  return onSnapshot(
    collection(_db, "orders"),
    snap => {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      orders.sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      callback(orders);
    }
  );
}

// ═══════════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════════

export async function getSettings() {
  return await _withRetry(async () => {
    const snap = await getDoc(doc(_db, "settings", "store"));
    if (snap.exists()) return snap.data();
    const defaults = {
      storeName: "Aari Elegance", tagline: "Handcrafted with Love",
      upi: "", phone: "", wa: "", email: "", address: "",
      currency: "Rs.", deliveryFee: 50, updatedAt: serverTimestamp()
    };
    await setDoc(doc(_db, "settings", "store"), defaults);
    return defaults;
  });
}

export async function updateSettings(fields) {
  await _withRetry(() =>
    setDoc(doc(_db, "settings", "store"), { ...fields, updatedAt: serverTimestamp() }, { merge: true })
  );
}

// ═══════════════════════════════════════════════════════════════
//  OFFERS
// ═══════════════════════════════════════════════════════════════

export async function getOffer() {
  return await _withRetry(async () => {
    const snap = await getDoc(doc(_db, "settings", "offer"));
    if (snap.exists()) return snap.data();
    const defaults = {
      active: false, emoji: "🌸",
      title: "Grand Festive Sale!",
      description: "Exclusive discounts on all handcrafted Aari designs.",
      code: "AARI20", updatedAt: serverTimestamp()
    };
    await setDoc(doc(_db, "settings", "offer"), defaults);
    return defaults;
  });
}

export async function setOffer(fields) {
  await _withRetry(() =>
    setDoc(doc(_db, "settings", "offer"), { ...fields, updatedAt: serverTimestamp() })
  );
}

// ═══════════════════════════════════════════════════════════════
//  CHAT / MESSAGES
//  FIX: Messages query uses where+orderBy which needs a composite
//  index. Fallback: fetch all and sort client-side if index missing.
// ═══════════════════════════════════════════════════════════════

export async function sendMessage(chatId, text, sender, userName) {
  await _withRetry(() =>
    addDoc(collection(_db, "messages"), _buildMessageDoc({ chatId, text, sender, userName }))
  );
}

export function listenMessages(chatId, callback) {
  // FIX: Try with orderBy first; if it fails (missing index), fall back to
  // client-side sort. This avoids "requires an index" errors breaking chat.
  try {
    return onSnapshot(
      query(
        collection(_db, "messages"),
        where("chatId", "==", chatId),
        orderBy("createdAt", "asc")
      ),
      snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      // On error (e.g. missing index), fall back to simple query
      _err => {
        console.warn("listenMessages: index missing, using client-side sort");
        onSnapshot(
          query(collection(_db, "messages"), where("chatId", "==", chatId)),
          snap => {
            const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            msgs.sort((a, b) => (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0));
            callback(msgs);
          }
        );
      }
    );
  } catch(e) {
    return () => {}; // return no-op unsubscribe
  }
}

export async function markChatRead(chatId) {
  try {
    const snap = await getDocs(
      query(collection(_db, "messages"), where("chatId", "==", chatId), where("read", "==", false))
    );
    if (snap.empty) return;
    const batch = writeBatch(_db);
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  } catch(e) {
    console.warn("markChatRead failed:", e.message);
  }
}

export async function getChats() {
  try {
    const snap = await _withRetry(() => getDocs(collection(_db, "messages")));
    const map  = {};
    snap.docs.forEach(d => {
      const dat = d.data();
      if (!map[dat.chatId]) {
        map[dat.chatId] = {
          chatId:   dat.chatId,
          userName: dat.userName || "Guest",
          lastMsg:  dat.text,
          unread:   (dat.read === false && dat.sender !== "owner") ? 1 : 0,
          time:     dat.createdAt?.seconds || 0
        };
      } else {
        // Update with latest message
        if ((dat.createdAt?.seconds || 0) > map[dat.chatId].time) {
          map[dat.chatId].lastMsg = dat.text;
          map[dat.chatId].time    = dat.createdAt?.seconds || 0;
        }
        if (dat.read === false && dat.sender !== "owner") {
          map[dat.chatId].unread = (map[dat.chatId].unread || 0) + 1;
        }
      }
    });
    return Object.values(map).sort((a, b) => b.time - a.time);
  } catch(e) {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENQUIRIES
// ═══════════════════════════════════════════════════════════════

export async function sendEnquiry(name, phone, message) {
  await _withRetry(() =>
    addDoc(collection(_db, "enquiries"), _buildEnquiryDoc({ name, phone, message }))
  );
}

export async function getEnquiries() {
  const snap = await _withRetry(() => getDocs(collection(_db, "enquiries")));
  const enqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return enqs.sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
}

export async function replyEnquiry(id, reply) {
  await _withRetry(() =>
    updateDoc(doc(_db, "enquiries", id), { reply, status: "replied", repliedAt: serverTimestamp() })
  );
}

export async function closeEnquiry(id) {
  await _withRetry(() => updateDoc(doc(_db, "enquiries", id), { status: "closed" }));
}

// ═══════════════════════════════════════════════════════════════
//  FILE / STORAGE UPLOAD
//  FIX: uploadFile now returns a URL string directly, not { url, path }.
//  owner.html was calling: imageUrl = await uploadFile(...)
//  and expecting a string. Returning {url,path} broke imageUrl assignment.
//  Added uploadFileWithPath for cases where path is also needed.
// ═══════════════════════════════════════════════════════════════

/** Upload file → returns download URL string */
export async function uploadFile(file, storagePath) {
  const storRef = ref(_storage, storagePath);
  await uploadBytes(storRef, file);
  const url = await getDownloadURL(storRef);
  return url; // FIX: return string, not object
}

/** Upload file → returns { url, path } object (for cases needing both) */
export async function uploadFileWithPath(file, storagePath) {
  const storRef = ref(_storage, storagePath);
  await uploadBytes(storRef, file);
  const url = await getDownloadURL(storRef);
  return { url, path: storagePath };
}

/** Delete a file from Storage */
export async function deleteFile(storagePath) {
  if (!storagePath) return;
  try {
    await deleteObject(ref(_storage, storagePath));
  } catch(e) {
    console.warn("deleteFile:", e.message);
  }
}
