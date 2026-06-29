// js/customer.js - Customer Portal Application Logic
import { 
  db, 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where 
} from "./firebase-config.js";

// Global Variables
let sessionId = "";
let tableData = null;
let menuItems = [];
let cart = {}; // maps item_id -> { item, quantity }
let activeCategory = "all";
let filterVegOnly = false;
let filterNonVegOnly = false;
let orderTrackingListener = null;
let activeOrderBannerListener = null;
let tipAmount = 0;
let currentLanguage = "en";

// Cashfree Config - "sandbox" or "production"
const CASHFREE_MODE = "sandbox";

// Helper functions to manage multiple concurrent active orders in localStorage
const getActiveOrders = () => {
  try {
    const list = localStorage.getItem(`active_orders_${sessionId}`);
    return list ? JSON.parse(list) : [];
  } catch (e) {
    const single = localStorage.getItem(`active_order_${sessionId}`);
    return single ? [single] : [];
  }
};

const addActiveOrder = (orderId) => {
  const ids = getActiveOrders();
  if (!ids.includes(orderId)) {
    ids.push(orderId);
    localStorage.setItem(`active_orders_${sessionId}`, JSON.stringify(ids));
  }
  localStorage.setItem(`active_order_${sessionId}`, orderId);
};

const removeActiveOrder = (orderId) => {
  let ids = getActiveOrders();
  ids = ids.filter(id => id !== orderId);
  if (ids.length > 0) {
    localStorage.setItem(`active_orders_${sessionId}`, JSON.stringify(ids));
    localStorage.setItem(`active_order_${sessionId}`, ids[ids.length - 1]);
  } else {
    localStorage.removeItem(`active_order_${sessionId}`);
    localStorage.removeItem(`active_orders_${sessionId}`);
  }
};

// Initialization
document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  sessionId = urlParams.get("session_id");

  if (!sessionId) {
    showScreen("screen-invalid");
    return;
  }

  try {
    // Validate session_id in DB
    const tableRef = doc(db, "tables", sessionId);
    const tableSnap = await getDoc(tableRef);

    if (tableSnap.exists()) {
      tableData = tableSnap.data();

      // Query active orders for this table to evaluate session state without writing to tables collection
      const ordersCol = collection(db, "orders");
      const q = query(ordersCol, where("table_id", "==", sessionId));
      
      const unsub = onSnapshot(q, async (snapshot) => {
        unsub(); // One-time snapshot query

        const activeOrdersInDb = [];
        snapshot.forEach(docSnap => {
          const order = docSnap.data();
          if (order.status !== "Delivered" && order.status !== "Cancelled") {
            activeOrdersInDb.push({ id: docSnap.id, ...order });
          }
        });

        // -- Session Hijack Prevention Logic (Covers Companion Diners + Auto-Reset) --
        const localActiveOrders = getActiveOrders();
        const localSessionStart = localStorage.getItem(`session_start_${sessionId}`);
        
        const now = Date.now();
        const sessionExpiryLimit = 3.5 * 60 * 60 * 1000; // 3.5 hours
        let isAllowed = true;

        if (activeOrdersInDb.length === 0) {
          // Table is vacant (no active orders in DB)
          if (localSessionStart && (now - Number(localSessionStart) > sessionExpiryLimit)) {
            // Old user loading page from history after 3.5 hours: expire their session
            localStorage.removeItem(`session_start_${sessionId}`);
            localStorage.removeItem(`active_orders_${sessionId}`);
            localStorage.removeItem(`active_order_${sessionId}`);
            isAllowed = false;
          } else {
            // Initialize local session timestamp if new
            if (!localSessionStart) {
              localStorage.setItem(`session_start_${sessionId}`, now.toString());
            }
          }
        } else {
          // Table is occupied (has active orders in DB)
          // Check if this browser placed any of the active orders
          const hasLocalActiveOrder = activeOrdersInDb.some(dbOrder => localActiveOrders.includes(dbOrder.id));

          if (hasLocalActiveOrder) {
            // Allowed: This browser belongs to this dining session
            isAllowed = true;
          } else {
            // Companion diner or older user: check the age of the oldest active order
            const oldestOrder = activeOrdersInDb.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))[0];
            const oldestOrderTime = oldestOrder.created_at ? new Date(oldestOrder.created_at).getTime() : now;
            const orderAge = now - oldestOrderTime;
            
            if (orderAge < sessionExpiryLimit) {
              // Companion diner: Allow them to join the current dining session seamlessly
              activeOrdersInDb.forEach(dbOrder => addActiveOrder(dbOrder.id));
              if (!localSessionStart) {
                localStorage.setItem(`session_start_${sessionId}`, oldestOrderTime.toString());
              }
            } else {
              // Block old session hijacking from history
              isAllowed = false;
            }
          }
        }

        if (!isAllowed) {
          showScreen("screen-invalid");
          document.getElementById("screen-invalid").querySelector(".state-title").textContent = "Session Expired";
          document.getElementById("screen-invalid").querySelector(".state-desc").textContent = "Your dining session has ended. Please scan the physical QR code on your table to start a new order.";
          return;
        }

        document.getElementById("table-badge-el").querySelector("span").textContent = tableData.table_number;
        document.getElementById("tracking-table-badge").textContent = tableData.table_number;

        // Fetch default language setting from DB
        try {
          const settingsSnap = await getDoc(doc(db, "settings", "general"));
          if (settingsSnap.exists() && settingsSnap.data().default_language) {
            currentLanguage = settingsSnap.data().default_language;
          }
        } catch (e) {
          console.warn("Could not load default language setting:", e);
        }

        // Sync language selector value
        document.getElementById("customer-lang-selector").value = currentLanguage;
        applyLanguage(currentLanguage);
        
        // Load Menu Items
        await loadMenu();
        showScreen("screen-menu");
        
        // Initialize active order banner if there's an ongoing order in progress
        initActiveOrderBannerCheck();
      });
    } else {
      showScreen("screen-invalid");
    }
  } catch (error) {
    console.error("Error validating session:", error);
    showScreen("screen-invalid");
  }

  // Setup Event Listeners
  setupEventListeners();
});

// Switch screens helper (SPA)
function showScreen(screenId) {
  const screens = ["screen-loading", "screen-invalid", "screen-menu", "screen-tracking"];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === screenId ? "flex" : "none";
  });

  // Manage visibility of the floating cart bar when switching screens
  const cartBar = document.getElementById("floating-cart");
  if (cartBar) {
    if (screenId !== "screen-menu") {
      cartBar.style.display = "none";
    } else {
      updateFloatingCartBar();
    }
  }
}

// Fetch menu from Firestore
async function loadMenu() {
  return new Promise((resolve) => {
    const menuRef = collection(db, "menu");
    // Listen to real-time menu updates
    onSnapshot(menuRef, (snapshot) => {
      menuItems = [];
      snapshot.forEach(docSnap => {
        const item = docSnap.data();
        if (item.in_stock) {
          menuItems.push({ id: docSnap.id, ...item });
        }
      });
      renderCategoryTabs();
      renderMenu();
      resolve();
    });
  });
}

// Render menu based on search, category and veg/nonveg filters
function renderMenu() {
  const container = document.getElementById("menu-container");
  container.innerHTML = "";

  const searchText = document.getElementById("search-input").value.toLowerCase();
  
  // Categorize items dynamically based on categories present in items
  const standardOrder = ["Starters", "Main Course", "Drinks"];
  const uniqueCats = [...new Set(menuItems.map(item => item.category))];
  
  // Sort categories: standard order first, then custom categories alphabetically
  const categories = uniqueCats.sort((a, b) => {
    const idxA = standardOrder.indexOf(a);
    const idxB = standardOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const groupedItems = {};
  categories.forEach(cat => {
    groupedItems[cat] = [];
  });

  menuItems.forEach(item => {
    // Apply filters matching English, Bengali, or Hindi texts
    const nameLower = (item.name || "").toLowerCase();
    const descLower = (item.description || "").toLowerCase();
    const nameBnLower = (item.name_bn || "").toLowerCase();
    const descBnLower = (item.description_bn || "").toLowerCase();
    const nameHiLower = (item.name_hi || "").toLowerCase();
    const descHiLower = (item.description_hi || "").toLowerCase();
    
    const matchesSearch = nameLower.includes(searchText) || descLower.includes(searchText) || 
                          nameBnLower.includes(searchText) || descBnLower.includes(searchText) || 
                          nameHiLower.includes(searchText) || descHiLower.includes(searchText);
                          
    const matchesCategory = activeCategory === "all" || item.category === activeCategory;
    const matchesVeg = !filterVegOnly || item.is_veg === true;
    const matchesNonVeg = !filterNonVegOnly || item.is_veg === false;

    if (matchesSearch && matchesCategory && matchesVeg && matchesNonVeg) {
      groupedItems[item.category]?.push(item);
    }
  });

  categories.forEach(cat => {
    const items = groupedItems[cat] || [];
    if (items.length === 0) return;

    // Create Category Section
    const section = document.createElement("div");
    section.className = "category-section fade-in";

    const title = document.createElement("h2");
    title.className = "category-title";
    
    // Translate Category display name
    let catDisplayName = cat;
    if (currentLanguage === "bn") {
      if (cat === "Starters") catDisplayName = "স্টারটার্স";
      else if (cat === "Main Course") catDisplayName = "মেন কোর্স";
      else if (cat === "Drinks") catDisplayName = "পানীয়";
    } else if (currentLanguage === "hi") {
      if (cat === "Starters") catDisplayName = "स्टार्टर्स";
      else if (cat === "Main Course") catDisplayName = "मुख्य भोजन";
      else if (cat === "Drinks") catDisplayName = "पेय पदार्थ";
    }
    title.textContent = catDisplayName;
    section.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "menu-items-grid";

    items.forEach(item => {
      const card = document.createElement("div");
      card.className = "menu-item-card glass";
      
      const imgUrl = item.image_url || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60";
      
      // Localized Veg/Non-Veg Badges
      let vegLabel = "Veg";
      let nonVegLabel = "Non-Veg";
      if (currentLanguage === "bn") {
        vegLabel = "নিরামিষ";
        nonVegLabel = "আমিষ";
      } else if (currentLanguage === "hi") {
        vegLabel = "शाकाहारी";
        nonVegLabel = "मांसाहारी";
      }
      
      const vegBadge = item.is_veg 
        ? `<span class="badge-veg"><span class="veg-icon"></span>${vegLabel}</span>`
        : `<span class="badge-nonveg"><span class="nonveg-icon"></span>${nonVegLabel}</span>`;

      const cartQty = cart[item.id]?.quantity || 0;
      
      // Localized Add Button
      let addLabel = "Add +";
      if (currentLanguage === "bn") addLabel = "যোগ করুন +";
      else if (currentLanguage === "hi") addLabel = "जोड़ें +";

      let actionHtml = "";
      if (cartQty > 0) {
        actionHtml = `
          <div class="qty-selector">
            <button class="qty-btn dec-qty-btn" data-id="${item.id}">-</button>
            <span class="qty-value">${cartQty}</span>
            <button class="qty-btn inc-qty-btn" data-id="${item.id}">+</button>
          </div>
        `;
      } else {
        actionHtml = `
          <button class="btn btn-primary add-to-cart-btn" data-id="${item.id}" style="padding: 8px 16px; border-radius:20px; font-size:0.85rem;">
            ${addLabel}
          </button>
        `;
      }

      // Localized Item Name & Description
      let displayName = item.name;
      let displayDesc = item.description;
      if (currentLanguage === "bn" && item.name_bn) displayName = item.name_bn;
      if (currentLanguage === "bn" && item.description_bn) displayDesc = item.description_bn;
      if (currentLanguage === "hi" && item.name_hi) displayName = item.name_hi;
      if (currentLanguage === "hi" && item.description_hi) displayDesc = item.description_hi;

      card.innerHTML = `
        <img class="menu-item-image" src="${imgUrl}" alt="${displayName}">
        <div class="menu-item-info">
          <div class="menu-item-header">
            <div class="menu-item-name-row">
              <span class="menu-item-name">${displayName}</span>
              ${vegBadge}
            </div>
            <p class="menu-item-description">${displayDesc}</p>
          </div>
          <div class="menu-item-footer">
            <span class="menu-item-price">₹${item.price}</span>
            <div class="add-btn-wrapper">
              ${actionHtml}
            </div>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });

    section.appendChild(grid);
    container.appendChild(section);
  });

  if (container.children.length === 0) {
    let noMatchMsg = "No food items match your filters.";
    if (currentLanguage === "bn") noMatchMsg = "কোনো খাবার আপনার ফিল্টারের সাথে মিলছে না।";
    else if (currentLanguage === "hi") noMatchMsg = "कोई भी व्यंजन आपके फिल्टर से मेल नहीं खाता।";
    container.innerHTML = `
      <div style="text-align:center; padding: 40px; color:var(--text-muted);">
        <p>${noMatchMsg}</p>
      </div>
    `;
  }
}

// Event Listeners Registration
function setupEventListeners() {
  // Language Selector
  document.getElementById("customer-lang-selector").addEventListener("change", (e) => {
    currentLanguage = e.target.value;
    applyLanguage(currentLanguage);
    renderMenu();
    if (document.getElementById("cart-modal").classList.contains("open")) {
      renderCartDrawerList();
    }
  });

  // Search bar
  document.getElementById("search-input").addEventListener("input", renderMenu);

  // Category tabs
  document.getElementById("category-tabs-el").addEventListener("click", (e) => {
    const tab = e.target.closest(".category-tab");
    if (!tab) return;
    
    document.querySelectorAll(".category-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    activeCategory = tab.dataset.category;
    renderMenu();
  });

  // Veg / Non-Veg filters
  document.getElementById("filter-veg").addEventListener("click", () => {
    filterVegOnly = !filterVegOnly;
    if (filterVegOnly) filterNonVegOnly = false; // mutually exclusive
    updateDietFilterPills();
    renderMenu();
  });

  document.getElementById("filter-nonveg").addEventListener("click", () => {
    filterNonVegOnly = !filterNonVegOnly;
    if (filterNonVegOnly) filterVegOnly = false;
    updateDietFilterPills();
    renderMenu();
  });

  // Menu Cart click triggers (Add, +, -)
  document.getElementById("menu-container").addEventListener("click", (e) => {
    const btnAdd = e.target.closest(".add-to-cart-btn");
    const btnInc = e.target.closest(".inc-qty-btn");
    const btnDec = e.target.closest(".dec-qty-btn");

    if (btnAdd) {
      const itemId = btnAdd.dataset.id;
      updateCartItemQty(itemId, 1);
    } else if (btnInc) {
      const itemId = btnInc.dataset.id;
      updateCartItemQty(itemId, cart[itemId].quantity + 1);
    } else if (btnDec) {
      const itemId = btnDec.dataset.id;
      updateCartItemQty(itemId, cart[itemId].quantity - 1);
    }
  });

  // Floating Cart View
  document.getElementById("view-cart-btn").addEventListener("click", openCartDrawer);
  document.getElementById("cart-close-btn").addEventListener("click", closeCartDrawer);
  document.getElementById("cart-close-backdrop").addEventListener("click", closeCartDrawer);

  // Cart Drawer Item Quantity Handlers
  document.getElementById("cart-items-list-el").addEventListener("click", (e) => {
    const btnInc = e.target.closest(".cart-inc-btn");
    const btnDec = e.target.closest(".cart-dec-btn");
    if (btnInc) {
      const itemId = btnInc.dataset.id;
      updateCartItemQty(itemId, cart[itemId].quantity + 1);
      renderCartDrawerList();
    } else if (btnDec) {
      const itemId = btnDec.dataset.id;
      updateCartItemQty(itemId, cart[itemId].quantity - 1);
      renderCartDrawerList();
    }
  });

  // Tip Selection Handler
  const tipButtons = document.querySelectorAll(".tip-btn");
  const customTipWrapper = document.getElementById("custom-tip-input-wrapper");
  const customTipInput = document.getElementById("custom-tip-input");

  tipButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      tipButtons.forEach(b => b.classList.remove("active"));
      
      const targetBtn = e.currentTarget;
      targetBtn.classList.add("active");

      if (targetBtn.id === "custom-tip-btn") {
        customTipWrapper.style.display = "block";
        tipAmount = Number(customTipInput.value) || 0;
      } else {
        customTipWrapper.style.display = "none";
        customTipInput.value = "";
        tipAmount = Number(targetBtn.dataset.tip) || 0;
      }
      
      renderCartDrawerList();
    });
  });

  customTipInput.addEventListener("input", () => {
    tipAmount = Number(customTipInput.value) || 0;
    renderCartDrawerList();
  });

  // Checkout Triggers
  document.getElementById("pay-online-btn").addEventListener("click", () => {
    checkoutOrder("Cashfree");
  });

  // Order More Button
  document.getElementById("order-more-btn").addEventListener("click", () => {
    // Clear tracking listener
    if (orderTrackingListener) orderTrackingListener();

    // Reset filters and search inputs to allow a clean view of the full menu
    document.getElementById("search-input").value = "";
    activeCategory = "all";
    filterVegOnly = false;
    filterNonVegOnly = false;
    
    // Reset category tabs visual active class
    document.querySelectorAll(".category-tab").forEach(t => t.classList.remove("active"));
    const defaultTab = document.querySelector('.category-tab[data-category="all"]');
    if (defaultTab) defaultTab.classList.add("active");

    updateDietFilterPills();
    renderMenu();

    // Show menu view
    showScreen("screen-menu");

    // Show active order banner on menu screen
    initActiveOrderBannerCheck();
  });

  // Customer Cancel Order Button
  document.getElementById("customer-cancel-order-btn").addEventListener("click", async () => {
    const activeOrderId = localStorage.getItem(`active_order_${sessionId}`) || document.getElementById("tracking-order-id-el").dataset.orderId;
    if (!activeOrderId) return;
    
    if (confirm("Are you sure you want to cancel this order?\nNote: Refunds for online payments are processed manually by the restaurant staff.")) {
      try {
        await updateDoc(doc(db, "orders", activeOrderId), { status: "Cancelled" });
        alert("Your order has been cancelled.");
      } catch (err) {
        console.error("Cancellation error:", err);
        alert("Failed to cancel order: " + err.message);
      }
    }
  });
}

function updateDietFilterPills() {
  const vegPill = document.getElementById("filter-veg");
  const nonvegPill = document.getElementById("filter-nonveg");

  if (filterVegOnly) vegPill.classList.add("active");
  else vegPill.classList.remove("active");

  if (filterNonVegOnly) nonvegPill.classList.add("active");
  else nonvegPill.classList.remove("active");
}

// Cart Logic
function updateCartItemQty(itemId, qty) {
  if (qty <= 0) {
    delete cart[itemId];
  } else {
    const menuItem = menuItems.find(item => item.id === itemId);
    if (menuItem) {
      cart[itemId] = { item: menuItem, quantity: qty };
    }
  }
  
  updateFloatingCartBar();
  renderMenu();
}

function updateFloatingCartBar() {
  const bar = document.getElementById("floating-cart");
  const qtyText = document.getElementById("cart-qty-text");
  const totalText = document.getElementById("cart-total-text");

  const totalQty = Object.values(cart).reduce((acc, curr) => acc + curr.quantity, 0);
  const subtotal = Object.values(cart).reduce((acc, curr) => acc + (curr.item.price * curr.quantity), 0);

  if (totalQty > 0) {
    bar.style.display = "flex";
    qtyText.textContent = `${totalQty} item${totalQty > 1 ? 's' : ''} added`;
    totalText.textContent = `₹${subtotal}`;
  } else {
    bar.style.display = "none";
  }
}

function openCartDrawer() {
  document.getElementById("cart-modal").classList.add("open");
  renderCartDrawerList();
}

function closeCartDrawer() {
  document.getElementById("cart-modal").classList.remove("open");
}

// Render Cart items list inside modal drawer
function renderCartDrawerList() {
  const listEl = document.getElementById("cart-items-list-el");
  listEl.innerHTML = "";

  const cartArray = Object.values(cart);
  if (cartArray.length === 0) {
    listEl.innerHTML = `<p style="text-align:center; padding:30px; color:var(--text-muted)">Your cart is empty.</p>`;
    document.getElementById("bill-subtotal").textContent = "₹0";
    document.getElementById("bill-tip").textContent = "₹0";
    document.getElementById("bill-total").textContent = "₹0";
    return;
  }

  let subtotal = 0;
  cartArray.forEach(({ item, quantity }) => {
    const itemTotal = item.price * quantity;
    subtotal += itemTotal;

    let displayName = item.name;
    if (currentLanguage === "bn" && item.name_bn) displayName = item.name_bn;
    else if (currentLanguage === "hi" && item.name_hi) displayName = item.name_hi;

    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <div class="cart-item-details">
        <span class="cart-item-name">${displayName}</span>
        <span class="cart-item-price-desc">₹${item.price} &times; ${quantity}</span>
      </div>
      <div class="qty-selector">
        <button class="qty-btn cart-dec-btn" data-id="${item.id}">-</button>
        <span class="qty-value">${quantity}</span>
        <button class="qty-btn cart-inc-btn" data-id="${item.id}">+</button>
      </div>
    `;
    listEl.appendChild(row);
  });

  // Calculate total: subtotal + selected tip amount (no tax/GST added as requested)
  const total = subtotal + tipAmount;

  document.getElementById("bill-subtotal").textContent = `₹${subtotal}`;
  
  const tipRow = document.getElementById("tip-summary-row");
  if (tipAmount > 0) {
    tipRow.style.display = "flex";
    document.getElementById("bill-tip").textContent = `₹${tipAmount}`;
  } else {
    tipRow.style.display = "none";
  }

  document.getElementById("bill-total").textContent = `₹${total}`;
}

// Submit Order helper
async function submitOrder(paymentMethod, paymentStatus, paymentId = "") {
  const subtotal = Object.values(cart).reduce((acc, curr) => acc + (curr.item.price * curr.quantity), 0);
  const total = subtotal + tipAmount;

  const orderItems = Object.values(cart).map(({ item, quantity }) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    quantity: quantity
  }));

  const orderData = {
    table_id: sessionId,
    table_number: tableData.table_number,
    items: orderItems,
    tip_amount: tipAmount,
    total_amount: total,
    status: "Pending",
    payment_method: paymentMethod,
    payment_status: paymentStatus,
    payment_id: paymentId,
    created_at: new Date().toISOString()
  };

  try {
    const ordersCol = collection(db, "orders");
    const orderDocRef = await addDoc(ordersCol, orderData);
    
    // Save to LocalStorage to track order status on refresh
    addActiveOrder(orderDocRef.id);
    
    // Clear Cart
    cart = {};
    updateFloatingCartBar();
    closeCartDrawer();
    
    // Reset Tip Selection
    tipAmount = 0;
    document.querySelectorAll(".tip-btn").forEach(b => b.classList.remove("active"));
    document.querySelector('.tip-btn[data-tip="0"]').classList.add("active");
    document.getElementById("custom-tip-input-wrapper").style.display = "none";
    document.getElementById("custom-tip-input").value = "";
    
    // Start tracking page view
    startOrderTracking(orderDocRef.id);
  } catch (error) {
    console.error("Error creating order:", error);
    alert("Could not place order. Please try again or contact staff.");
  }
}

// Helper to get Vercel Serverless Function URL (Absolute for Firebase/Local, Relative for Vercel)
const getCloudFunctionUrl = () => {
  const vercelDomain = "https://resturant-lac-three.vercel.app";
  if (window.location.hostname.endsWith("vercel.app")) {
    return "/api/createCashfreeOrder";
  }
  // Fallback to absolute Vercel backend URL when hosted on Firebase or local servers
  return `${vercelDomain}/api/createCashfreeOrder`;
};

// Checkout flow
async function checkoutOrder(paymentMethod) {
  const subtotal = Object.values(cart).reduce((acc, curr) => acc + (curr.item.price * curr.quantity), 0);
  const total = subtotal + tipAmount;

  if (paymentMethod === "Counter") {
    // Simply submit order as Pending Payment at Counter
    submitOrder("Counter", "Pending");
  } else if (paymentMethod === "Cashfree") {
    const btnOnline = document.getElementById("pay-online-btn");
    const originalText = btnOnline.innerHTML;
    btnOnline.innerHTML = "Processing Payment...";
    btnOnline.disabled = true;

    try {
      // 1. Fetch paymentSessionId from your Firebase Cloud Function automatically!
      const functionUrl = getCloudFunctionUrl();
      console.log("Calling Firebase Function at:", functionUrl);

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          orderAmount: total,
          orderCurrency: "INR",
          customerId: "cust_" + (sessionId || "guest"),
          customerPhone: "9999999999",
          customerEmail: "guest@zzrestaurant.com"
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || "Failed to generate payment session ID.");
      }

      const data = await response.json();
      const paymentSessionId = data.payment_session_id;

      // 2. Check if the function returned a demo session (fallback if API keys are not configured yet)
      if (paymentSessionId.startsWith("cf_demo_session_")) {
        btnOnline.innerHTML = originalText;
        btnOnline.disabled = false;
        
        const confirmPayment = confirm(`[DEMO MODE] Simulate successful online payment of ₹${total} via Cashfree?`);
        if (confirmPayment) {
          submitOrder("Cashfree", "Paid", "cf_mock_" + Math.random().toString(36).substr(2, 9));
        } else {
          alert("Payment cancelled.");
        }
        return;
      }

      // 3. Trigger Real Cashfree checkout SDK
      const cashfree = Cashfree({
        mode: CASHFREE_MODE // "sandbox" or "production"
      });

      cashfree.checkout({
        paymentSessionId: paymentSessionId,
        redirectTarget: "_modal" // Opens overlay modal checkout frame
      }).then((result) => {
        btnOnline.innerHTML = originalText;
        btnOnline.disabled = false;

        if (result.error) {
          console.error("Cashfree Checkout error:", result.error);
          alert("Payment failed: " + result.error.message);
        } else if (result.paymentDetails) {
          console.log("Cashfree payment success:", result.paymentDetails);
          submitOrder("Cashfree", "Paid", result.paymentDetails.cfPaymentId || "cf_success");
        }
      });

    } catch (err) {
      console.error("Cashfree Checkout error:", err);
      alert("Error initiating Cashfree: " + err.message + "\nEnsure your Cloud Function is deployed or try local emulator.");
      btnOnline.innerHTML = originalText;
      btnOnline.disabled = false;
    }
  }
}

// Real-time tracking listeners
function startOrderTracking(orderId) {
  showScreen("screen-tracking");
  
  // Render tabs for switching between multiple active orders
  const activeOrderIds = getActiveOrders();
  const tabsContainer = document.getElementById("tracking-orders-tabs");
  
  if (activeOrderIds.length > 1) {
    tabsContainer.style.display = "flex";
    tabsContainer.innerHTML = "";
    
    activeOrderIds.forEach((id, idx) => {
      const tab = document.createElement("div");
      tab.className = "diet-pill";
      tab.textContent = `Order ${idx + 1}`;
      
      // Style active tab
      if (id === orderId) {
        tab.style.borderColor = "var(--accent-gold)";
        tab.style.color = "var(--accent-gold)";
        tab.style.background = "rgba(197, 168, 128, 0.15)";
      }
      
      tab.addEventListener("click", () => {
        startOrderTracking(id);
      });
      
      tabsContainer.appendChild(tab);
    });
  } else {
    tabsContainer.style.display = "none";
  }

  const orderDocRef = doc(db, "orders", orderId);
  
  if (orderTrackingListener) orderTrackingListener(); // unsubscribe previous

  orderTrackingListener = onSnapshot(orderDocRef, (docSnap) => {
    if (!docSnap.exists()) {
      removeActiveOrder(orderId);
      const remaining = getActiveOrders();
      if (remaining.length > 0) {
        startOrderTracking(remaining[remaining.length - 1]);
      } else {
        showScreen("screen-menu");
        initActiveOrderBannerCheck();
      }
      return;
    }

    const order = docSnap.data();
    
    // Fill details
    const orderIdEl = document.getElementById("tracking-order-id-el");
    orderIdEl.textContent = `Order ID: #${docSnap.id.substr(-6).toUpperCase()}`;
    orderIdEl.dataset.orderId = docSnap.id;
    
    const statusTextEl = document.getElementById("tracking-status-text-el");
    statusTextEl.textContent = order.status;
    if (order.status === "Cancelled") {
      statusTextEl.style.color = "var(--danger)";
    } else {
      statusTextEl.style.color = "var(--accent-gold)";
    }
    
    // Toggle Cancel button visibility (only show when Pending or Accepted)
    const cancelWrapper = document.getElementById("customer-cancel-order-wrapper");
    if (order.status === "Pending" || order.status === "Accepted") {
      cancelWrapper.style.display = "block";
    } else {
      cancelWrapper.style.display = "none";
    }
    
    // Update payment status badge with payment method details
    const pBadge = document.getElementById("tracking-payment-badge-el");
    const payMethodLabel = order.payment_method === "Cashfree" ? "Online" : "Cash";
    let displayPaymentStatus = order.payment_status;
    if (order.status === "Cancelled" && order.payment_status === "Pending") {
      displayPaymentStatus = order.payment_method === "Cashfree" ? "Failed" : "Unpaid";
    }

    let statusBadgeClass = "payment-pending";
    if (displayPaymentStatus === "Paid") statusBadgeClass = "payment-paid";
    else if (displayPaymentStatus === "Failed" || displayPaymentStatus === "Unpaid") statusBadgeClass = "payment-failed";

    pBadge.textContent = `Payment: ${displayPaymentStatus} (${payMethodLabel})`;
    pBadge.className = `order-payment-badge ${statusBadgeClass}`;

    // Recalculate and draw ordered items list
    const summaryItemsEl = document.getElementById("tracking-summary-items");
    summaryItemsEl.innerHTML = "";
    order.items.forEach(item => {
      const menuItem = menuItems.find(m => m.id === item.id);
      let displayName = item.name;
      if (menuItem) {
        if (currentLanguage === "bn" && menuItem.name_bn) displayName = menuItem.name_bn;
        else if (currentLanguage === "hi" && menuItem.name_hi) displayName = menuItem.name_hi;
      }

      const row = document.createElement("div");
      row.className = "summary-item-row";
      row.innerHTML = `
        <span>${displayName} &times; ${item.quantity}</span>
        <span>₹${item.price * item.quantity}</span>
      `;
      summaryItemsEl.appendChild(row);
    });

    document.getElementById("tracking-summary-total").textContent = `₹${order.total_amount}`;

    // Stepper updates
    updateStepperProgress(order.status);

    // If order is delivered or cancelled, clean localStorage so next order is fresh
    if (order.status === "Delivered" || order.status === "Cancelled") {
      removeActiveOrder(orderId);
      const remaining = getActiveOrders();
      if (remaining.length > 0) {
        startOrderTracking(remaining[remaining.length - 1]);
      } else {
        if (orderTrackingListener) orderTrackingListener();
        showScreen("screen-menu");
        initActiveOrderBannerCheck();
      }
    }
  });
}

function updateStepperProgress(status) {
  // Reset all steps
  const steps = {
    "Pending": ["step-placed"],
    "Accepted": ["step-placed", "step-accepted"],
    "Preparing": ["step-placed", "step-accepted", "step-preparing"],
    "Delivered": ["step-placed", "step-accepted", "step-preparing", "step-delivered"],
    "Cancelled": []
  };

  const activeSteps = steps[status] || ["step-placed"];

  const allStepIds = ["step-placed", "step-accepted", "step-preparing", "step-delivered"];
  allStepIds.forEach(id => {
    const stepEl = document.getElementById(id);
    if (!stepEl) return;
    
    stepEl.classList.remove("active", "completed");
    stepEl.style.opacity = status === "Cancelled" ? "0.4" : "1";
    
    if (status !== "Cancelled" && activeSteps.includes(id)) {
      if (id === activeSteps[activeSteps.length - 1]) {
        stepEl.classList.add("active");
      } else {
        stepEl.classList.add("completed");
      }
    }
  });
}

// Active Order banner listener inside menu view
function initActiveOrderBannerCheck() {
  const activeOrderIds = getActiveOrders();
  const banner = document.getElementById("active-order-banner");

  if (activeOrderBannerListener) {
    activeOrderBannerListener();
    activeOrderBannerListener = null;
  }

  if (activeOrderIds.length === 0) {
    banner.style.display = "none";
    return;
  }

  // Listen to the latest active order status for the banner preview
  const latestOrderId = activeOrderIds[activeOrderIds.length - 1];
  const orderDocRef = doc(db, "orders", latestOrderId);
  
  activeOrderBannerListener = onSnapshot(orderDocRef, (docSnap) => {
    // If order was deleted or doesn't exist
    if (!docSnap.exists()) {
      removeActiveOrder(latestOrderId);
      initActiveOrderBannerCheck();
      return;
    }

    const order = docSnap.data();
    
    if (order.status === "Delivered" || order.status === "Cancelled") {
      removeActiveOrder(latestOrderId);
      initActiveOrderBannerCheck();
      return;
    }

    // Display banner on menu screen
    banner.style.display = "flex";
    
    const bannerStatusEl = document.getElementById("active-order-banner-status");
    if (activeOrderIds.length > 1) {
      bannerStatusEl.textContent = `You have ${activeOrderIds.length} orders in progress`;
    } else {
      bannerStatusEl.textContent = `Order Status: ${order.status}`;
    }
    
    banner.onclick = () => {
      startOrderTracking(latestOrderId);
    };
  }, (err) => {
    console.error("Banner tracking subscription failed:", err);
    banner.style.display = "none";
  });
}

const UI_TRANSLATIONS = {
  en: {
    searchPlaceholder: "Search delicious food...",
    allCategories: "All Items",
    starters: "Starters",
    mains: "Mains",
    drinks: "Drinks",
    vegOnly: "Veg Only",
    nonVeg: "Non-Veg",
    yourOrder: "Your Order",
    noTip: "No Tip",
    customTip: "Custom",
    addTip: "Add a Tip for the Staff",
    customTipPlaceholder: "Enter tip amount (₹)",
    subtotal: "Subtotal",
    tipAmount: "Tip Amount",
    totalBill: "Total Bill",
    payBtn: "Pay & Place Order (UPI / Cards)",
    orderInProgress: "Order In Progress",
    trackOrder: "Track Order →",
    orderPlaced: "Order Placed",
    orderPlacedDesc: "Sent to the kitchen. Waiting for response.",
    orderAccepted: "Order Accepted",
    orderAcceptedDesc: "Restaurant staff has accepted your order.",
    orderPreparing: "Preparing",
    orderPreparingDesc: "Our Chef is preparing your delicious meal.",
    orderServed: "Served / Delivered",
    orderServedDesc: "Bon Appétit! Enjoy your fresh meal.",
    itemsOrdered: "Items Ordered",
    totalBillPaid: "Total Bill Paid",
    orderMore: "Order More Items",
    cancelOrder: "Cancel Order",
    viewCart: "View Cart",
    itemsAdded: "items added",
    paymentPending: "Payment: Pending",
    paymentPaid: "Payment: Paid",
    paymentFailed: "Payment: Failed",
    verifyingSession: "Verifying your table session...",
    invalidQr: "Invalid QR Code",
    invalidQrDesc: "This table session is expired, modified, or doesn't exist. Please scan the official QR code present on your table to access the digital menu.",
    goHome: "Go to Homepage"
  },
  bn: {
    searchPlaceholder: "খাবার খুঁজুন...",
    allCategories: "সব খাবার",
    starters: "স্টারটার্স",
    mains: "মেন কোর্স",
    drinks: "পানীয়",
    vegOnly: "শুধু নিরামিষ",
    nonVeg: "আমিষ",
    yourOrder: "আপনার অর্ডার",
    noTip: "টিপস ছাড়া",
    customTip: "অন্যান্য",
    addTip: "স্টাফদের জন্য টিপস দিন",
    customTipPlaceholder: "টিপসের পরিমাণ লিখুন (₹)",
    subtotal: "সাবটোটাল",
    tipAmount: "টিপসের পরিমাণ",
    totalBill: "মোট বিল",
    payBtn: "অর্ডার করুন এবং পে করুন",
    orderInProgress: "অর্ডার তৈরি হচ্ছে",
    trackOrder: "অর্ডার ট্র্যাক করুন →",
    orderPlaced: "অর্ডার পাঠানো হয়েছে",
    orderPlacedDesc: "রান্নাঘরে পাঠানো হয়েছে। রেসপন্সের অপেক্ষা করা হচ্ছে।",
    orderAccepted: "অর্ডার গৃহীত হয়েছে",
    orderAcceptedDesc: "রেস্টুরেন্ট স্টাফ আপনার অর্ডার গ্রহণ করেছে।",
    orderPreparing: "প্রস্তুত করা হচ্ছে",
    orderPreparingDesc: "শেফ আপনার সুস্বাদু খাবার তৈরি করছেন।",
    orderServed: "পরিবেশন করা হয়েছে",
    orderServedDesc: "উপভোগ করুন আপনার খাবার!",
    itemsOrdered: "অর্ডার করা খাবার",
    totalBillPaid: "মোট বিল পরিশোধিত",
    orderMore: "আরো অর্ডার করুন",
    cancelOrder: "অর্ডার বাতিল করুন",
    viewCart: "কার্ট দেখুন",
    itemsAdded: "খাবার যুক্ত করা হয়েছে",
    paymentPending: "পেমেন্ট: বাকি আছে",
    paymentPaid: "পেমেন্ট: সম্পন্ন",
    paymentFailed: "পেমেন্ট: ব্যর্থ",
    verifyingSession: "আপনার টেবিল যাচাই করা হচ্ছে...",
    invalidQr: "অবৈধ কিউআর কোড",
    invalidQrDesc: "এই কিউআর সেশনটি শেষ হয়ে গেছে বা সঠিক নয়। ডিজিটাল মেনু দেখতে টেবিলে থাকা কিউআর কোডটি আবার স্ক্যান করুন।",
    goHome: "হোমপেজে যান"
  },
  hi: {
    searchPlaceholder: "स्वादिष्ट भोजन खोजें...",
    allCategories: "सभी व्यंजन",
    starters: "स्टार्टर्स",
    mains: "मुख्य भोजन",
    drinks: "पेय पदार्थ",
    vegOnly: "केवल शाकाहारी",
    nonVeg: "मांसाहारी",
    yourOrder: "आपका ऑर्डर",
    noTip: "कोई टिप नहीं",
    customTip: "अन्य",
    addTip: "स्टाफ के लिए टिप जोड़ें",
    customTipPlaceholder: "टिप राशि दर्ज करें (₹)",
    subtotal: "उप-योग (Subtotal)",
    tipAmount: "टिप की राशि",
    totalBill: "कुल बिल",
    payBtn: "भुगतान करें और ऑर्डर दें",
    orderInProgress: "ऑर्डर प्रगति पर है",
    trackOrder: "ऑर्डर ट्रैक करें →",
    orderPlaced: "ऑर्डर दिया गया",
    orderPlacedDesc: "रसोई में भेज दिया गया है। प्रतिक्रिया की प्रतीक्षा है।",
    orderAccepted: "ऑर्डर स्वीकार किया गया",
    orderAcceptedDesc: "कर्मचारियों ने आपका ऑर्डर स्वीकार कर लिया है।",
    orderPreparing: "तैयार किया जा रहा है",
    orderPreparingDesc: "हमारे शेफ आपका स्वादिष्ट भोजन तैयार कर रहे हैं।",
    orderServed: "परोसा गया / डिलीवर",
    orderServedDesc: "भोजन का आनंद लें!",
    itemsOrdered: "ऑर्डर किए गए व्यंजन",
    totalBillPaid: "कुल भुगतान किया गया बिल",
    orderMore: "और ऑर्डर करें",
    cancelOrder: "ऑर्डर रद्द करें",
    viewCart: "कार्ट देखें",
    itemsAdded: "आइटम जोड़े गए",
    paymentPending: "भुगतान: लंबित",
    paymentPaid: "भुगतान: सफल",
    paymentFailed: "भुगतान: असफल",
    verifyingSession: "टेबल सत्र सत्यापित किया जा रहा है...",
    invalidQr: "अमान्य क्यूआर कोड",
    invalidQrDesc: "यह टेबल सत्र समाप्त हो गया है या अमान्य है। डिजिटल मेनू देखने के लिए कृपया टेबल पर मौजूद क्यूআর कोड को फिर से स्कैन करें।",
    goHome: "होमपेज पर जाएं"
  }
};

function applyLanguage(lang) {
  const trans = UI_TRANSLATIONS[lang] || UI_TRANSLATIONS.en;
  
  // Placeholder for search input
  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.placeholder = trans.searchPlaceholder;
  
  // Category tabs text (dynamically rendered)
  renderCategoryTabs();
  
  // Veg / Non-Veg filters
  const vegPill = document.getElementById("filter-veg");
  if (vegPill) vegPill.innerHTML = `<span class="veg-icon"></span> ${trans.vegOnly}`;
  const nonVegPill = document.getElementById("filter-nonveg");
  if (nonVegPill) nonVegPill.innerHTML = `<span class="nonveg-icon"></span> ${trans.nonVeg}`;
  
  // Cart header
  const cartHeaderTitle = document.querySelector("#cart-modal .cart-title");
  if (cartHeaderTitle) cartHeaderTitle.textContent = trans.yourOrder;
  
  // Tip title
  const tipTitle = document.querySelector("#cart-modal .tip-section p");
  if (tipTitle) tipTitle.textContent = trans.addTip;
  
  // Tip buttons
  const tipButtons = document.querySelectorAll("#cart-modal .tip-btn");
  if (tipButtons && tipButtons.length >= 5) {
    tipButtons[0].textContent = trans.noTip;
    tipButtons[4].textContent = trans.customTip;
  }
  
  // Custom tip input placeholder
  const customTipInput = document.getElementById("custom-tip-input");
  if (customTipInput) customTipInput.placeholder = trans.customTipPlaceholder;
  
  // Bill Summary labels
  const billRows = document.querySelectorAll("#cart-modal .bill-row");
  if (billRows && billRows.length >= 3) {
    billRows[0].querySelector("span:first-child").textContent = trans.subtotal;
    billRows[1].querySelector("span:first-child").textContent = trans.tipAmount;
    billRows[2].querySelector("span:first-child").textContent = trans.totalBill;
  }
  
  // Pay button
  const payBtnSpan = document.querySelector("#pay-online-btn span");
  if (payBtnSpan) payBtnSpan.textContent = trans.payBtn;
  
  // Stepper labels
  const stepPlacedTitle = document.querySelector("#step-placed .step-title");
  const stepPlacedDesc = document.querySelector("#step-placed .step-desc");
  if (stepPlacedTitle) stepPlacedTitle.textContent = trans.orderPlaced;
  if (stepPlacedDesc) stepPlacedDesc.textContent = trans.orderPlacedDesc;

  const stepAcceptedTitle = document.querySelector("#step-accepted .step-title");
  const stepAcceptedDesc = document.querySelector("#step-accepted .step-desc");
  if (stepAcceptedTitle) stepAcceptedTitle.textContent = trans.orderAccepted;
  if (stepAcceptedDesc) stepAcceptedDesc.textContent = trans.orderAcceptedDesc;

  const stepPreparingTitle = document.querySelector("#step-preparing .step-title");
  const stepPreparingDesc = document.querySelector("#step-preparing .step-desc");
  if (stepPreparingTitle) stepPreparingTitle.textContent = trans.orderPreparing;
  if (stepPreparingDesc) stepPreparingDesc.textContent = trans.orderPreparingDesc;

  const stepDeliveredTitle = document.querySelector("#step-delivered .step-title");
  const stepDeliveredDesc = document.querySelector("#step-delivered .step-desc");
  if (stepDeliveredTitle) stepDeliveredTitle.textContent = trans.orderServed;
  if (stepDeliveredDesc) stepDeliveredDesc.textContent = trans.orderServedDesc;

  // Order More & Cancel Order buttons
  const orderMoreBtn = document.getElementById("order-more-btn");
  if (orderMoreBtn) orderMoreBtn.textContent = trans.orderMore;
  
  const cancelOrderBtn = document.getElementById("customer-cancel-order-btn");
  if (cancelOrderBtn) cancelOrderBtn.textContent = trans.cancelOrder;
  
  // Floating cart view cart button
  const viewCartBtn = document.getElementById("view-cart-btn");
  if (viewCartBtn) {
    // Keep the SVG icon but replace the text
    viewCartBtn.innerHTML = `
      ${trans.viewCart}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
    `;
  }
}

function renderCategoryTabs() {
  const container = document.getElementById("category-tabs-el");
  if (!container) return;
  
  // Extract unique categories dynamically from menuItems
  const uniqueCats = [...new Set(menuItems.map(item => item.category))];
  
  // Sort categories: standard order first, then custom categories alphabetically
  const standardOrder = ["Starters", "Main Course", "Drinks"];
  const categories = uniqueCats.sort((a, b) => {
    const idxA = standardOrder.indexOf(a);
    const idxB = standardOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  let allLabel = "All Items";
  if (currentLanguage === "bn") allLabel = "সব খাবার";
  else if (currentLanguage === "hi") allLabel = "सभी व्यंजन";
  
  let html = `<div class="category-tab ${activeCategory === "all" ? "active" : ""}" data-category="all">${allLabel}</div>`;
  
  categories.forEach(cat => {
    let catLabel = cat;
    // Translate standard ones, leave custom ones as-is
    if (currentLanguage === "bn") {
      if (cat === "Starters") catLabel = "স্টারটার্স";
      else if (cat === "Main Course") catLabel = "মেন কোর্স";
      else if (cat === "Drinks") catLabel = "পানীয়";
    } else if (currentLanguage === "hi") {
      if (cat === "Starters") catLabel = "स्टार्टर्स";
      else if (cat === "Main Course") catLabel = "मुख्य भोजन";
      else if (cat === "Drinks") catLabel = "पेय पदार्थ";
    }
    
    html += `<div class="category-tab ${activeCategory === cat ? "active" : ""}" data-category="${cat}">${catLabel}</div>`;
  });
  
  container.innerHTML = html;
}
