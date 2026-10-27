# 🍽️ Digital Restaurant Ordering & Administration System

> A premium, responsive, and real-time digital restaurant management application. It features an interactive customer-facing menu with multi-language support, a robust admin dashboard for live order tracking, and serverless payment processing.

### 🌐 Quick Access

| 🌍 **Live Website** | 📱 **Scan to View Menu** |
| :---: | :---: |
| [**Visit Live Demo**](https://zzrestaurant.netlify.app/) <br><br> *(zzrestaurant.netlify.app)* | <img src="https://github.com/user-attachments/assets/58bb995e-3718-401b-82bb-da90e77840d2" width="150" alt="Menu QR Code" /> |

---

## 🚀 Features

### 🍽️ Customer Menu
* **Interactive Ordering:** Real-time cart management and order placement.
* **Smart Filtering:** Filter items by category (Starters, Main Course, Drinks) and Veg/Non-Veg preferences.
* **Localization:** Multi-language support (English, Hindi, Bengali) for titles and descriptions.
* **Responsive Design:** Optimized for mobile, tablet, and desktop screens with smooth micro-animations.

### 👑 Admin Dashboard
* **Real-time Order Monitor:** Live tracking of orders with automatic updates (Pending, Preparing, Completed).
* **Menu Management:** Add, update, or delete menu items and toggle stock availability in real time.
* **Table QR Setup:** View and configure table-specific ordering details.

### 💳 Backend & Integration
* **Serverless Functions:** Vercel serverless functions for secure server-side logic.
* **Payment Gateway:** Cashfree SDK integration for generating secure customer checkouts.
* **Real-time Database:** Firebase Firestore for instant synchronization between customers and the kitchen.

---

## 🛠️ Tech Stack
* **Frontend:** Vanilla HTML5, CSS3, Modern ES Modules (JavaScript)
* **Database & Auth:** Firebase Firestore, Firebase Authentication
* **Backend:** Vercel Serverless Functions (Node.js)
* **Payment Gateway:** Cashfree PG API

---

## 📁 Directory Structure

```
├── api/
│   └── createCashfreeOrder.js  # Serverless Cashfree integration
├── public/
│   ├── index.html              # Customer ordering portal
│   ├── admin.html              # Admin management interface
│   ├── menu.html               # Main menu template
│   ├── css/                    # Modular stylesheets
│   └── js/
│       ├── firebase-config.js  # Database & Authentication config
│       ├── customer.js         # Client-side ordering logic
│       └── admin.js            # Admin panel control logic
├── firestore.rules             # Database security rules
├── vercel.json                 # Vercel deployment configuration
├── firebase.json               # Firebase deployment configuration
└── package.json                # Project dependencies
```

---

## ⚙️ Setup & Installation

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed.

### 2. Clone and Install Dependencies
```bash
npm install
```

### 3. Configure Credentials

#### Firebase Config
Update the config block in `public/js/firebase-config.js` with your web application credentials from the Firebase Console:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

#### Cashfree & Serverless Environment
Set up your Cashfree credentials as environment variables in Vercel or your local environment (`.env`):
```env
CASHFREE_APP_ID=your_cashfree_app_id
CASHFREE_SECRET_KEY=your_cashfree_secret_key
CASHFREE_MODE=sandbox # Change to "production" for live payments
```

### 4. Local Development
Run the local dev server using:
```bash
npm run dev
# Or host statically using Vercel CLI
vercel dev
```

---

## 🚀 Deployment
Deploy to Vercel instantly using the Vercel CLI:
```bash
vercel
```
