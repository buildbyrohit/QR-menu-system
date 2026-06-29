// firebase-config.js - Firebase Initialization using Web ES Modules (v10.8.0)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  limit,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// WARNING: Replace these placeholders with your actual Firebase Project credentials.
// You can get this configuration object from your Firebase Console (Project Settings > General > Your Apps).
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_AUTH_DOMAIN_HERE",
  databaseURL: "YOUR_DATABASE_URL_HERE",
  projectId: "YOUR_PROJECT_ID_HERE",
  storageBucket: "YOUR_STORAGE_BUCKET_HERE",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID_HERE",
  appId: "YOUR_APP_ID_HERE",
  measurementId: "YOUR_MEASUREMENT_ID_HERE"
};

// Check if credentials have been replaced
const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY_HERE";

let app, db, auth;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  console.log("Firebase initialized successfully with credentials.");
} else {
  console.warn("Firebase config is using placeholders. Running in Demo Mock Mode. Set your keys in js/firebase-config.js to enable Firebase!");
  // If not configured, we'll expose a Mock class wrapper to allow testing immediately!
  // This provides an incredible developer experience.
  db = createMockDb();
  auth = createMockAuth();
}

export { 
  app, 
  db, 
  auth, 
  isConfigured,
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  limit,
  serverTimestamp,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
};

// --- mock implementation for initial dry run and demoing ---
function createMockDb() {
  // Simple in-memory mock of Firestore so the app works out-of-the-box before keys are entered.
  const storageKey = 'restaurant_mock_db';
  if (!localStorage.getItem(storageKey)) {
    // Initial mock data
    const initialDb = {
      tables: {
        "8f4a2b9x": { table_number: "Table 1", created_at: new Date().toISOString() },
        "3d9c2a5k": { table_number: "Table 2", created_at: new Date().toISOString() },
        "7v1b8m4p": { table_number: "Table 3", created_at: new Date().toISOString() }
      },
      menu: {
        "m1": { 
          name: "Paneer Tikka", 
          name_bn: "পনির টিক্কা",
          name_hi: "पनीर टिक्का",
          description: "Clay-oven roasted cottage cheese cubes marinated in rich Indian spices.", 
          description_bn: "মশলাদার পনিরের কিউব যা তন্দুরে সেঁকা হয়েছে।",
          description_hi: "मसालों में लपेटा हुआ और तंदूर में ग्रिल किया हुआ पनीर।",
          price: 280, 
          category: "Starters", 
          image_url: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=500&auto=format&fit=crop&q=60", 
          is_veg: true, 
          in_stock: true, 
          created_at: new Date().toISOString() 
        },
        "m2": { 
          name: "Crispy Spring Rolls", 
          name_bn: "ক্রিস্পি স্প্রিং রোলস",
          name_hi: "क्रिस्पी स्प्रिंग रोल्स",
          description: "Deep fried golden rolls stuffed with crunchy seasoned vegetables.", 
          description_bn: "ভাজা গোল্ডেন রোল যা ক্রাঞ্চি সবজিতে ভরা।",
          description_hi: "सब्जियों से भरा हुआ और डीप फ्राई किया हुआ रोल।",
          price: 220, 
          category: "Starters", 
          image_url: "https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=60", 
          is_veg: true, 
          in_stock: true, 
          created_at: new Date().toISOString() 
        },
        "m3": { 
          name: "Chicken Tikka Angare", 
          name_bn: "চিকেন টিক্কা অঙ্গারে",
          name_hi: "चिकन टिक्का अंगारे",
          description: "Spicy and smoky chicken skewers grilled to perfection.", 
          description_bn: "তন্দুরে গ্রিল করা অত্যন্ত মশলাদার চিকেন কাবাব।",
          description_hi: "तंदूर में ग्रिल किया हुआ तीखा और स्मोकी चिकन।",
          price: 340, 
          category: "Starters", 
          image_url: "https://images.unsplash.com/photo-1598515214211-89d3e73ae83b?w=500&auto=format&fit=crop&q=60", 
          is_veg: false, 
          in_stock: true, 
          created_at: new Date().toISOString() 
        },
        "m4": { 
          name: "Butter Chicken", 
          name_bn: "বাটার চিকেন",
          name_hi: "बटर चिकन",
          description: "Succulent chicken cooked in a rich, buttery, and creamy tomato gravy.", 
          description_bn: "টমেটো ও মাখনের গ্রেভিতে রান্না করা নরম চিকেন পিস।",
          description_hi: "मक्खन और टमाटर की ग्रेवी में पकाया गया चिकन।",
          price: 420, 
          category: "Main Course", 
          image_url: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=500&auto=format&fit=crop&q=60", 
          is_veg: false, 
          in_stock: true, 
          created_at: new Date().toISOString() 
        },
        "m5": { 
          name: "Dal Makhani", 
          name_bn: "ডাল মাখানি",
          name_hi: "दाल मखनी",
          description: "Slow-cooked black lentils in rich butter and cream.", 
          description_bn: "মাখন ও ক্রিম দিয়ে আস্তে রান্না করা কালো কলাইয়ের ডাল।",
          description_hi: "मक्खन और क्रीम के साथ धीमी आंच पर पकाई गई काली उड़द की दाल।",
          price: 320, 
          category: "Main Course", 
          image_url: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=60", 
          is_veg: true, 
          in_stock: true, 
          created_at: new Date().toISOString() 
        },
        "m6": { 
          name: "Garlic Naan", 
          name_bn: "গার্লিক নান",
          name_hi: "गार्लिक नान",
          description: "Leavened flatbread brushed with fresh garlic and butter.", 
          description_bn: "রসুন এবং মাখন দিয়ে তৈরি নরম তন্দুরি রুটি।",
          description_hi: "ताजा लहसुन और मक्खन लगा हुआ तंदूरी नान।",
          price: 80, 
          category: "Main Course", 
          image_url: "https://images.unsplash.com/photo-1533777857889-4be7c70b33f7?w=500&auto=format&fit=crop&q=60", 
          is_veg: true, 
          in_stock: true, 
          created_at: new Date().toISOString() 
        },
        "m7": { 
          name: "Virgin Mojito", 
          name_bn: "ভার্জিন মোহিতো",
          name_hi: "वर्जिन मोजितो",
          description: "Refreshing blend of fresh lime juice, mint leaves, and soda.", 
          description_bn: "লেবুর রস, পুদিনা পাতা ও সোডার রিফ্রেশিং মিশ্রণ।",
          description_hi: "नींबू, पुदीने की पत्तियों और सोडा का एक ताज़ा मिश्रण।",
          price: 150, 
          category: "Drinks", 
          image_url: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=60", 
          is_veg: true, 
          in_stock: true, 
          created_at: new Date().toISOString() 
        },
        "m8": { 
          name: "Mango Lassi", 
          name_bn: "ম্যাঙ্গো লাচ্ছি",
          name_hi: "मैंगो लस्सी",
          description: "Traditional sweet yogurt drink flavored with fresh mango pulp.", 
          description_bn: "মিষ্টি দই এবং আমের পাল্প দিয়ে তৈরি ঐতিহ্যবাহী পানীয়।",
          description_hi: "ताजे आम के गूदे के साथ बनाई गई दही की मीठी लस्सी।",
          price: 120, 
          category: "Drinks", 
          image_url: "https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=500&auto=format&fit=crop&q=60", 
          is_veg: true, 
          in_stock: true, 
          created_at: new Date().toISOString() 
        }
      },
      orders: {},
      settings: {
        "general": { default_language: "en", updated_at: new Date().toISOString() }
      }
    };
    localStorage.setItem(storageKey, JSON.stringify(initialDb));
  }

  const getDbData = () => JSON.parse(localStorage.getItem(storageKey));
  const saveDbData = (data) => localStorage.setItem(storageKey, JSON.stringify(data));

  // Firebase Firestore Mocks
  const listeners = [];

  const notifyListeners = (collectionName) => {
    listeners.forEach(l => {
      if (l.collectionName === collectionName) {
        l.callback(l.getQuerySnapshot());
      }
    });
  };

  return {
    isMock: true,
    getDoc: async (docRef) => {
      const data = getDbData();
      const docData = data[docRef.collectionName]?.[docRef.id];
      return {
        exists: () => !!docData,
        data: () => docData ? { ...docData, id: docRef.id } : null,
        id: docRef.id
      };
    },
    setDoc: async (docRef, docData) => {
      const data = getDbData();
      if (!data[docRef.collectionName]) data[docRef.collectionName] = {};
      data[docRef.collectionName][docRef.id] = { ...docData };
      saveDbData(data);
      notifyListeners(docRef.collectionName);
    },
    addDoc: async (colRef, docData) => {
      const data = getDbData();
      if (!data[colRef.collectionName]) data[colRef.collectionName] = {};
      const newId = 'mock_id_' + Math.random().toString(36).substr(2, 9);
      data[colRef.collectionName][newId] = { ...docData };
      saveDbData(data);
      notifyListeners(colRef.collectionName);
      return { id: newId };
    },
    updateDoc: async (docRef, updateFields) => {
      const data = getDbData();
      if (data[docRef.collectionName]?.[docRef.id]) {
        data[docRef.collectionName][docRef.id] = {
          ...data[docRef.collectionName][docRef.id],
          ...updateFields
        };
        saveDbData(data);
        notifyListeners(docRef.collectionName);
      }
    },
    deleteDoc: async (docRef) => {
      const data = getDbData();
      if (data[docRef.collectionName]?.[docRef.id]) {
        delete data[docRef.collectionName][docRef.id];
        saveDbData(data);
        notifyListeners(docRef.collectionName);
      }
    },
    onSnapshot: (queryObj, callback) => {
      const collectionName = queryObj.collectionName;
      const getQuerySnapshot = () => {
        const data = getDbData();
        const docsObj = data[collectionName] || {};
        let docsArray = Object.keys(docsObj).map(id => ({
          id,
          data: () => docsObj[id]
        }));
        
        // Filter orders by table_id if query has a filter
        if (collectionName === 'orders' && queryObj.filterVal) {
          docsArray = docsArray.filter(doc => doc.data().table_id === queryObj.filterVal);
        }

        // Apply simple sorting by created_at (descending) for orders, or normal sorting
        docsArray.sort((a, b) => {
          const tA = a.data().created_at || '';
          const tB = b.data().created_at || '';
          return tB.localeCompare(tA);
        });

        return {
          empty: docsArray.length === 0,
          forEach: (cb) => docsArray.forEach(cb),
          docs: docsArray
        };
      };

      const listener = {
        collectionName,
        getQuerySnapshot,
        callback
      };
      listeners.push(listener);
      
      // Initial trigger
      setTimeout(() => callback(getQuerySnapshot()), 0);

      // Return unsubscribe function
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },
    query: (colRef, ...constraints) => {
      let filterVal = null;
      constraints.forEach(c => {
        if (c && c.type === 'where' && c.field === 'table_id') {
          filterVal = c.value;
        }
      });
      return {
        collectionName: colRef.collectionName,
        filterVal: filterVal
      };
    },
    where: (field, op, value) => {
      return { type: 'where', field, op, value };
    },
    orderBy: (field, direction) => {
      return { type: 'orderBy', field, direction };
    },
    collection: (dbRef, collectionName) => {
      return { collectionName };
    },
    doc: (dbRef, collectionName, id) => {
      return { collectionName, id };
    }
  };
}

function createMockAuth() {
  const adminEmail = "admin@restaurant.com";
  const adminPassword = "password123";
  let authStateCallback = null;
  let currentUser = localStorage.getItem('mock_admin_logged') === 'true' ? { email: adminEmail } : null;

  return {
    currentUser,
    signInWithEmailAndPassword: async (authRef, email, password) => {
      if (email === adminEmail && password === adminPassword) {
        currentUser = { email: adminEmail };
        localStorage.setItem('mock_admin_logged', 'true');
        if (authStateCallback) authStateCallback(currentUser);
        return { user: currentUser };
      } else {
        throw new Error("auth/wrong-password or invalid credentials (use email: admin@restaurant.com, pass: password123)");
      }
    },
    signOut: async () => {
      currentUser = null;
      localStorage.setItem('mock_admin_logged', 'false');
      if (authStateCallback) authStateCallback(null);
    },
    onAuthStateChanged: (authRef, callback) => {
      authStateCallback = callback;
      setTimeout(() => callback(currentUser), 0);
      return () => { authStateCallback = null; };
    }
  };
}
