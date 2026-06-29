// js/admin.js - Admin Panel Dashboard Application Logic
import { 
  db, 
  auth, 
  collection, 
  doc, 
  getDoc,
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "./firebase-config.js";

// Global Variables
let currentTab = "orders";
let activeQrTable = null;
let qrcodeInstance = null;
let currentEditingMenuItemId = null;
let activeTablesList = [];
let showAllCompleted = false;

// Auth State Monitor
onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("admin-login-screen").style.display = "none";
    document.getElementById("admin-dashboard-layout").style.display = "grid";
    
    // Load data listeners
    initDashboard();
  } else {
    document.getElementById("admin-login-screen").style.display = "flex";
    document.getElementById("admin-dashboard-layout").style.display = "none";
  }
});

// Admin Login form submit
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  
  errorEl.style.display = "none";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error("Login failed:", error);
    errorEl.textContent = error.message.includes("auth/") 
      ? "Invalid admin credentials. Use admin@restaurant.com & password123"
      : error.message;
    errorEl.style.display = "block";
  }
});

// Logout handler
document.getElementById("logout-btn").addEventListener("click", () => {
  signOut(auth);
});

// Dashboard Tab Navigation switcher
const navItems = {
  "nav-orders": "orders",
  "nav-menu": "menu",
  "nav-tables": "tables",
  "nav-settings": "settings"
};

Object.entries(navItems).forEach(([navId, tabName]) => {
  document.getElementById(navId).addEventListener("click", (e) => {
    // Toggle active classes on nav
    document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
    document.getElementById(navId).classList.add("active");

    // Hide all sections
    document.querySelectorAll(".admin-section").forEach(sec => sec.style.display = "none");
    
    // Show active section
    document.getElementById(`section-${tabName}`).style.display = "block";
    currentTab = tabName;
  });
});

// Initialize Dashboard Data Listeners
function initDashboard() {
  listenToOrders();
  listenToMenu();
  listenToTables();
  setupMenuCrudEvents();
  setupTableEvents();
  setupSettingsEvents();
}

// ----------------------------------------------------
// Section 1: LIVE ORDERS DASHBOARD LOGIC
// ----------------------------------------------------
function listenToOrders() {
  const ordersCol = collection(db, "orders");
  
  onSnapshot(ordersCol, (snapshot) => {
    const orders = [];
    let revenue = 0;
    let activeCount = 0;
    let unpaidCount = 0;

    snapshot.forEach(docSnap => {
      const order = { id: docSnap.id, ...docSnap.data() };
      orders.push(order);

      // Stat Calculations
      if (order.payment_status === "Paid") {
        revenue += order.total_amount;
      }
      if (order.status !== "Delivered" && order.status !== "Cancelled") {
        activeCount++;
      }
      if (order.payment_method === "Counter" && order.payment_status === "Pending" && order.status !== "Cancelled") {
        unpaidCount++;
      }
    });

    // Update Stats counters
    document.getElementById("stat-revenue").textContent = `₹${revenue}`;
    document.getElementById("stat-active").textContent = activeCount;
    document.getElementById("stat-unpaid").textContent = unpaidCount;

    // Render Order Cards
    renderOrderColumns(orders);
  });
}

function renderOrderColumns(orders) {
  const colPending = document.getElementById("list-pending");
  const colPreparing = document.getElementById("list-preparing");
  const colCompleted = document.getElementById("list-completed");

  // Clear lists
  colPending.innerHTML = "";
  colPreparing.innerHTML = "";
  colCompleted.innerHTML = "";

  let countPending = 0;
  let countPreparing = 0;
  let countCompleted = 0;

  // Sort orders by timestamp descending
  orders.sort((a,b) => (b.created_at || "").localeCompare(a.created_at || ""));

  // Separate completed/cancelled orders to handle limiting/viewing more
  const completedOrdersList = orders.filter(o => o.status === "Delivered" || o.status === "Cancelled");
  
  // Decide how many completed orders to render in the column
  const maxCompletedToShow = 5;
  const completedToRender = showAllCompleted 
    ? completedOrdersList 
    : completedOrdersList.slice(0, maxCompletedToShow);

  orders.forEach(order => {
    const isCompleted = order.status === "Delivered" || order.status === "Cancelled";
    
    // If it's a completed/cancelled order and NOT in the list we decided to render, we skip it
    if (isCompleted && !completedToRender.includes(order)) {
      countCompleted++; // Still increment the counter for badge count
      return;
    }

    const card = document.createElement("div");
    const dateStr = order.created_at ? new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now";
    
    // Items list
    const itemsHtml = order.items.map(item => `
      <div class="order-card-item">
        <span>${item.name} &times; ${item.quantity}</span>
        <span style="color:var(--text-muted)">₹${item.price * item.quantity}</span>
      </div>
    `).join("");

    // Payment status badge
    let displayPaymentStatus = order.payment_status;
    if (order.status === "Cancelled" && order.payment_status === "Pending") {
      displayPaymentStatus = order.payment_method === "Cashfree" ? "Failed" : "Unpaid";
    }

    let payStatusClass = "payment-pending";
    if (displayPaymentStatus === "Paid") payStatusClass = "payment-paid";
    else if (displayPaymentStatus === "Failed" || displayPaymentStatus === "Unpaid") payStatusClass = "payment-failed";

    const payStatusLabel = `${order.payment_method === 'Cashfree' ? 'Online' : 'Cash'}: ${displayPaymentStatus}`;
    const payStatusLabelCompact = `${order.payment_method === 'Cashfree' ? 'Online' : 'Cash'} - ${displayPaymentStatus}`;

    // Order Status badge
    let statusClass = "payment-pending";
    if (order.status === "Delivered") statusClass = "payment-paid";
    else if (order.status === "Cancelled") statusClass = "payment-failed";

    const statusBadgeHtml = `<span class="order-payment-badge ${statusClass}">${order.status}</span>`;

    // Mark as Paid option visible for cash unpaid orders in any column
    const showMarkAsPaid = order.payment_method === "Counter" && order.payment_status === "Pending" && order.status !== "Cancelled";
    const markAsPaidBtn = showMarkAsPaid 
      ? `<button class="btn btn-outline pay-action-btn" data-id="${order.id}">Collect Cash</button>` 
      : "";

    if (isCompleted) {
      // Completed / Closed column: Render Compact Card
      countCompleted++;
      card.className = "admin-order-card glass fade-in compact-order-card";
      
      let actionsHtml = "";
      if (showMarkAsPaid) {
        actionsHtml = markAsPaidBtn;
      } else {
        actionsHtml = `<span style="font-size:0.8rem; color:var(--text-muted); text-align:center;">Archived</span>`;
      }

      card.innerHTML = `
        <div class="compact-header" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="order-table-num" style="font-size:0.95rem; font-weight:600;">${order.table_number}</span>
            <span style="color:var(--text-muted); font-size:0.8rem;">${dateStr}</span>
            <span class="order-payment-badge ${payStatusClass}">${payStatusLabelCompact}</span>
            ${statusBadgeHtml}
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="order-card-total" style="font-size:0.95rem; margin-bottom:0; font-weight:700; color:var(--accent-gold);">₹${order.total_amount}</span>
            <button class="btn toggle-details-btn" style="padding:4px 8px; font-size:0.72rem; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:var(--accent-gold); border-radius:8px; cursor:pointer; height:auto; font-family:var(--font-body);">Show All</button>
          </div>
        </div>
        <div class="compact-details-body" style="display:none; margin-top:12px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:12px;">
          <div class="order-card-items" style="margin-bottom:12px;">
            ${itemsHtml}
          </div>
          <div class="order-card-footer" style="margin-bottom:8px;">
            <span class="order-payment-badge ${payStatusClass}">${payStatusLabel}</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
            ${actionsHtml}
          </div>
        </div>
      `;

      // Setup click toggle events for compact layout
      const header = card.querySelector(".compact-header");
      const details = card.querySelector(".compact-details-body");
      const toggleBtn = card.querySelector(".toggle-details-btn");

      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = details.style.display === "block";
        details.style.display = isOpen ? "none" : "block";
        toggleBtn.textContent = isOpen ? "Show All" : "Hide";
      });

      header.addEventListener("click", () => {
        const isOpen = details.style.display === "block";
        details.style.display = isOpen ? "none" : "block";
        toggleBtn.textContent = isOpen ? "Show All" : "Hide";
      });

      colCompleted.appendChild(card);
    } else {
      // Pending, Accepted, Preparing: Render Standard Card
      card.className = "admin-order-card glass fade-in";
      
      let actionsHtml = "";
      if (order.status === "Pending") {
        countPending++;
        actionsHtml = `
          <div class="order-card-actions">
            <button class="btn btn-primary accept-action-btn" data-id="${order.id}">Accept</button>
            <button class="btn btn-secondary cancel-action-btn" data-id="${order.id}" style="color:var(--danger)">Decline</button>
          </div>
          ${markAsPaidBtn}
        `;
        colPending.appendChild(card);
      } else if (order.status === "Accepted" || order.status === "Preparing") {
        countPreparing++;
        const nextStatusLabel = order.status === "Accepted" ? "Start Cooking" : "Serve Meal";
        const nextStatusVal = order.status === "Accepted" ? "Preparing" : "Delivered";

        actionsHtml = `
          <div class="order-card-actions">
            <button class="btn btn-primary advance-action-btn" data-id="${order.id}" data-status="${nextStatusVal}">${nextStatusLabel}</button>
          </div>
          ${markAsPaidBtn}
        `;
        colPreparing.appendChild(card);
      }

      card.innerHTML = `
        <div class="order-card-header">
          <span class="order-table-num">${order.table_number}</span>
          <span class="order-time">${dateStr}</span>
        </div>
        <div class="order-card-items">
          ${itemsHtml}
        </div>
        <div class="order-card-footer">
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <span class="order-payment-badge ${payStatusClass}">${payStatusLabel}</span>
            ${statusBadgeHtml}
          </div>
          <span class="order-card-total">₹${order.total_amount}</span>
        </div>
        <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
          ${actionsHtml}
        </div>
      `;
    }
  });

  // Render a "View All / Show Less" button at the bottom of the Completed column if there are more than 5 completed orders
  if (completedOrdersList.length > maxCompletedToShow) {
    const colToggleBtn = document.createElement("button");
    colToggleBtn.className = "btn btn-secondary";
    colToggleBtn.style.width = "100%";
    colToggleBtn.style.marginTop = "16px";
    colToggleBtn.style.padding = "10px";
    colToggleBtn.style.fontSize = "0.85rem";
    colToggleBtn.style.borderRadius = "8px";
    colToggleBtn.style.cursor = "pointer";
    colToggleBtn.style.fontWeight = "600";
    colToggleBtn.style.fontFamily = "var(--font-body)";
    
    colToggleBtn.textContent = showAllCompleted 
      ? "Show Less" 
      : `View All (${completedOrdersList.length} orders)`;
      
    colToggleBtn.addEventListener("click", () => {
      showAllCompleted = !showAllCompleted;
      renderOrderColumns(orders);
    });
    colCompleted.appendChild(colToggleBtn);
  }

  // Update column badge counters
  document.getElementById("count-pending").textContent = countPending;
  document.getElementById("count-preparing").textContent = countPreparing;
  document.getElementById("count-completed").textContent = countCompleted;

  // Add click events to action buttons
  setupOrderCardActionCallbacks();
}

function setupOrderCardActionCallbacks() {
  // Accept Order
  document.querySelectorAll(".accept-action-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.dataset.id;
      await updateDoc(doc(db, "orders", id), { status: "Accepted" });
    });
  });

  // Decline/Cancel Order
  document.querySelectorAll(".cancel-action-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.dataset.id;
      if (confirm("Are you sure you want to cancel this order?")) {
        await updateDoc(doc(db, "orders", id), { status: "Cancelled" });
      }
    });
  });

  // Transition: Accept -> Preparing -> Served
  document.querySelectorAll(".advance-action-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.dataset.id;
      const nextStatus = btn.dataset.status;
      await updateDoc(doc(db, "orders", id), { status: nextStatus });
    });
  });

  // Manual payment updates (Collect Cash/Mark as Paid)
  document.querySelectorAll(".pay-action-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.dataset.id;
      if (confirm("Confirm that cash has been received and mark order as Paid?")) {
        await updateDoc(doc(db, "orders", id), { payment_status: "Paid" });
      }
    });
  });
}

// ----------------------------------------------------
// Section 2: MENU CRUD LOGIC
// ----------------------------------------------------
function listenToMenu() {
  const menuCol = collection(db, "menu");
  
  onSnapshot(menuCol, (snapshot) => {
    const tbody = document.getElementById("menu-crud-tbody");
    tbody.innerHTML = "";

    snapshot.forEach(docSnap => {
      const item = { id: docSnap.id, ...docSnap.data() };
      const tr = document.createElement("tr");

      const imgHtml = item.image_url 
        ? `<img class="table-img" src="${item.image_url}" alt="${item.name}">`
        : `<div class="table-img" style="background:#222; display:flex; align-items:center; justify-content:center; color:#555;">No Img</div>`;
      
      const typeBadge = item.is_veg 
        ? `<span class="badge-veg"><span class="veg-icon"></span>Veg</span>`
        : `<span class="badge-nonveg"><span class="nonveg-icon"></span>Non-Veg</span>`;

      const checkedStr = item.in_stock ? "checked" : "";

      tr.innerHTML = `
        <td>${imgHtml}</td>
        <td style="font-weight:600;">${item.name}</td>
        <td>${item.category}</td>
        <td style="font-weight:600; color:var(--accent-gold);">₹${item.price}</td>
        <td>${typeBadge}</td>
        <td>
          <label class="switch">
            <input type="checkbox" class="stock-toggle-input" data-id="${item.id}" ${checkedStr}>
            <span class="slider"></span>
          </label>
        </td>
        <td>
          <div class="action-btns">
            <button class="btn btn-secondary edit-menu-item-btn" data-id="${item.id}" style="padding: 6px 12px; font-size:0.8rem;">Edit</button>
            <button class="btn btn-danger delete-menu-item-btn" data-id="${item.id}" style="padding: 6px 12px; font-size:0.8rem;">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Stock toggles events
    document.querySelectorAll(".stock-toggle-input").forEach(input => {
      input.addEventListener("change", async (e) => {
        const id = input.dataset.id;
        const newStockVal = input.checked;
        await updateDoc(doc(db, "menu", id), { in_stock: newStockVal });
      });
    });

    // Edit/Delete click events
    setupMenuActionCallbacks();
  });
}

function setupMenuCrudEvents() {
  const modal = document.getElementById("menu-modal");
  const addBtn = document.getElementById("add-menu-item-btn");
  const closeBtn = document.getElementById("menu-modal-close-btn");
  const cancelBtn = document.getElementById("menu-cancel-btn");
  const backdrop = document.getElementById("menu-modal-backdrop");
  const form = document.getElementById("menu-form");

  // Show Add Item Modal
  addBtn.addEventListener("click", () => {
    currentEditingMenuItemId = null;
    document.getElementById("menu-modal-title-el").textContent = "Add Menu Item";
    form.reset();
    document.getElementById("menu-name-bn").value = "";
    document.getElementById("menu-description-bn").value = "";
    document.getElementById("menu-name-hi").value = "";
    document.getElementById("menu-description-hi").value = "";
    document.getElementById("menu-custom-category-group").style.display = "none";
    document.getElementById("menu-custom-category").value = "";
    document.getElementById("menu-custom-category").required = false;
    document.getElementById("menu-in-stock").checked = true;
    modal.classList.add("open");
  });

  // Category dropdown change listener to toggle custom input
  document.getElementById("menu-category").addEventListener("change", (e) => {
    const customGroup = document.getElementById("menu-custom-category-group");
    const customInput = document.getElementById("menu-custom-category");
    if (e.target.value === "Others") {
      customGroup.style.display = "block";
      customInput.required = true;
      customInput.focus();
    } else {
      customGroup.style.display = "none";
      customInput.required = false;
      customInput.value = "";
    }
  });

  // Hide Modal
  const hideModal = () => {
    modal.classList.remove("open");
  };
  closeBtn.addEventListener("click", hideModal);
  cancelBtn.addEventListener("click", hideModal);
  backdrop.addEventListener("click", hideModal);

  // Form Submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("menu-name").value;
    const name_bn = document.getElementById("menu-name-bn").value.trim();
    const name_hi = document.getElementById("menu-name-hi").value.trim();
    
    let category = document.getElementById("menu-category").value;
    if (category === "Others") {
      category = document.getElementById("menu-custom-category").value.trim();
      if (!category) {
        alert("Please enter a custom category name.");
        return;
      }
    }

    const price = Number(document.getElementById("menu-price").value);
    const description = document.getElementById("menu-description").value;
    const description_bn = document.getElementById("menu-description-bn").value.trim();
    const description_hi = document.getElementById("menu-description-hi").value.trim();
    const image_url = document.getElementById("menu-image").value || "";
    const is_veg = document.getElementById("menu-is-veg").checked;
    const in_stock = document.getElementById("menu-in-stock").checked;

    const itemData = {
      name,
      name_bn,
      name_hi,
      category,
      price,
      description,
      description_bn,
      description_hi,
      image_url,
      is_veg,
      in_stock,
      created_at: new Date().toISOString()
    };

    try {
      if (currentEditingMenuItemId) {
        // Edit Mode
        await updateDoc(doc(db, "menu", currentEditingMenuItemId), itemData);
      } else {
        // Add Mode
        await addDoc(collection(db, "menu"), itemData);
      }
      hideModal();
    } catch (err) {
      console.error("Error saving menu item:", err);
      alert("Error saving item: " + err.message);
    }
  });
}

function setupMenuActionCallbacks() {
  // Edit click
  document.querySelectorAll(".edit-menu-item-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.dataset.id;
      currentEditingMenuItemId = id;
      
      try {
        const itemSnap = await getDoc(doc(db, "menu", id));
        if (itemSnap.exists()) {
          const item = itemSnap.data();
          
          document.getElementById("menu-modal-title-el").textContent = "Edit Menu Item";
          document.getElementById("menu-name").value = item.name;
          document.getElementById("menu-name-bn").value = item.name_bn || "";
          document.getElementById("menu-name-hi").value = item.name_hi || "";
          const standardCategories = ["Starters", "Main Course", "Drinks"];
          const selectCat = document.getElementById("menu-category");
          const customGroup = document.getElementById("menu-custom-category-group");
          const customInput = document.getElementById("menu-custom-category");
          
          if (standardCategories.includes(item.category)) {
            selectCat.value = item.category;
            customGroup.style.display = "none";
            customInput.value = "";
            customInput.required = false;
          } else {
            selectCat.value = "Others";
            customGroup.style.display = "block";
            customInput.value = item.category;
            customInput.required = true;
          }
          
          document.getElementById("menu-price").value = item.price;
          document.getElementById("menu-description").value = item.description;
          document.getElementById("menu-description-bn").value = item.description_bn || "";
          document.getElementById("menu-description-hi").value = item.description_hi || "";
          document.getElementById("menu-image").value = item.image_url || "";
          document.getElementById("menu-is-veg").checked = !!item.is_veg;
          document.getElementById("menu-in-stock").checked = !!item.in_stock;

          document.getElementById("menu-modal").classList.add("open");
        }
      } catch (err) {
        console.error("Error loading menu item details:", err);
      }
    });
  });

  // Delete click
  document.querySelectorAll(".delete-menu-item-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.dataset.id;
      if (confirm("Are you sure you want to delete this menu item permanently?")) {
        try {
          await deleteDoc(doc(db, "menu", id));
        } catch (err) {
          console.error("Error deleting menu item:", err);
        }
      }
    });
  });
}

// ----------------------------------------------------
// Section 3: TABLES & QR GENERATOR LOGIC
// ----------------------------------------------------
function listenToTables() {
  const tablesCol = collection(db, "tables");
  
  onSnapshot(tablesCol, (snapshot) => {
    const listEl = document.getElementById("tables-list-el");
    listEl.innerHTML = "";
    activeTablesList = []; // Reset table names list

    snapshot.forEach(docSnap => {
      const table = { id: docSnap.id, ...docSnap.data() };
      activeTablesList.push(table.table_number.toLowerCase());
      
      const card = document.createElement("div");
      card.className = "table-card";
      card.dataset.id = table.id;
      card.dataset.name = table.table_number;

      card.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2">
          <path d="M3 3h18v18H3zM3 9h18M9 21V9"/>
        </svg>
        <span class="table-card-name">${table.table_number}</span>
      `;
      listEl.appendChild(card);
    });

    // Add click handlers for selection
    document.querySelectorAll(".table-card").forEach(card => {
      card.addEventListener("click", (e) => {
        const tableCard = e.currentTarget;
        const id = tableCard.dataset.id;
        const name = tableCard.dataset.name;
        selectQrTable(id, name);
      });
    });
  });
}

function setupTableEvents() {
  const form = document.getElementById("add-table-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("new-table-name").value.trim();
    if (!name) return;

    // Check if table name already exists to prevent duplicate QR codes
    if (activeTablesList.includes(name.toLowerCase())) {
      alert(`A table with name "${name}" already exists! Please use a unique name.`);
      return;
    }

    // Cryptographic-grade random UUID token generation (8 characters is short and user-friendly, yet safe from guessing since it has 36^8 combinations = ~2.8 Trillion)
    const secureToken = Array.from({ length: 8 }, () => Math.random().toString(36).charAt(2)).join("");

    try {
      // Write into tables using the secureToken as document ID to prevent guessing/iteration
      const tableRef = doc(db, "tables", secureToken);
      await setDoc(tableRef, {
        table_number: name,
        created_at: new Date().toISOString()
      });
      form.reset();
      // Auto select the newly created table
      selectQrTable(secureToken, name);
    } catch (err) {
      console.error("Error creating table:", err);
      alert("Error adding table: " + err.message);
    }
  });

  // QR Code Image Download
  document.getElementById("download-qr-btn").addEventListener("click", downloadQrImage);

  // Delete Table Action
  document.getElementById("delete-table-btn").addEventListener("click", async () => {
    if (!activeQrTable) return;
    if (confirm(`Are you sure you want to delete "${activeQrTable.name}" permanently? This will invalidate its QR code.`)) {
      try {
        await deleteDoc(doc(db, "tables", activeQrTable.id));
        
        // Clear preview panel
        activeQrTable = null;
        document.getElementById("qr-display-content").style.display = "none";
        document.getElementById("qr-placeholder-content").style.display = "block";
      } catch (err) {
        console.error("Error deleting table:", err);
        alert("Error deleting table: " + err.message);
      }
    }
  });
}

function selectQrTable(id, name) {
  activeQrTable = { id, name };
  
  // Highlight active table card
  document.querySelectorAll(".table-card").forEach(el => {
    if (el.dataset.id === id) el.style.borderColor = "var(--accent-gold)";
    else el.style.borderColor = "rgba(255,255,255,0.05)";
  });

  // Show preview layout
  document.getElementById("qr-placeholder-content").style.display = "none";
  document.getElementById("qr-display-content").style.display = "block";

  // Fill details
  document.getElementById("preview-table-title").textContent = name;
  document.getElementById("preview-table-uuid").textContent = `UUID: ${id}`;
  
  // Construct URL. In production, this uses the actual domain.
  // Locally, it will link to the menu.html on current port.
  const secureUrl = `${window.location.origin}/menu.html?session_id=${id}`;
  document.getElementById("preview-table-url").textContent = secureUrl;

  // Clear previous QR code canvas
  const canvasEl = document.getElementById("qrcode-canvas");
  canvasEl.innerHTML = "";

  // Render QR Code using David Shim's CDN Library
  qrcodeInstance = new QRCode(canvasEl, {
    text: secureUrl,
    width: 200,
    height: 200,
    colorDark : "#0b0c10",
    colorLight : "#ffffff",
    correctLevel : QRCode.CorrectLevel.H
  });
}

function downloadQrImage() {
  if (!activeQrTable) return;

  // Find canvas or image tag rendered inside #qrcode-canvas
  const canvas = document.getElementById("qrcode-canvas").querySelector("canvas");
  const img = document.getElementById("qrcode-canvas").querySelector("img");

  let imgSource = "";
  if (canvas) {
    imgSource = canvas.toDataURL("image/png");
  } else if (img) {
    imgSource = img.src;
  }

  if (imgSource) {
    const downloadLink = document.createElement("a");
    downloadLink.href = imgSource;
    downloadLink.download = `QR_${activeQrTable.name.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  } else {
    alert("Could not generate downloadable image.");
  }
}

async function setupSettingsEvents() {
  const settingsForm = document.getElementById("settings-form");
  const langSelect = document.getElementById("settings-default-lang");
  
  // Load current settings
  try {
    const settingsSnap = await getDoc(doc(db, "settings", "general"));
    if (settingsSnap.exists()) {
      const settings = settingsSnap.data();
      if (settings.default_language) {
        langSelect.value = settings.default_language;
      }
    }
  } catch (err) {
    console.error("Error loading settings:", err);
  }
  
  settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const defaultLanguage = langSelect.value;
    
    try {
      await setDoc(doc(db, "settings", "general"), {
        default_language: defaultLanguage,
        updated_at: new Date().toISOString()
      });
      alert("Settings saved successfully!");
    } catch (err) {
      console.error("Error saving settings:", err);
      alert("Error saving settings: " + err.message);
    }
  });
}
