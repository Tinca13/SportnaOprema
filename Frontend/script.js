const API = "http://localhost:3000/api";
let currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");

/* ===== 1. POMOŽNE FUNKCIJE (UTIL & UI) ===== */

function setUserPill() {
    const el = document.getElementById("userPill");
    const loginBtn = document.querySelector('button[onclick="openLogin()"]');
    const logoutBtn = document.querySelector('button[onclick="logout()"]');
    
    if (!el) return;

    if (currentUser) {
        el.innerText = currentUser.email;
        if (loginBtn) loginBtn.style.display = "none";
        if (logoutBtn) logoutBtn.style.display = "block";
    } else {
        el.innerText = "Ni prijave";
        if (loginBtn) loginBtn.style.display = "block";
        if (logoutBtn) logoutBtn.style.display = "none";
    }
}

function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.innerText = msg;
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 3000);
}

/* ===== 2. MODAL LOGIKA (LOGIN/LOGOUT) ===== */

function openLogin() {
     const modal = document.getElementById("modalWrap");
    if (modal) modal.style.display = "flex";
}

function closeLogin(e) {
    // Zapre modal, če kliknemo gumb ali ozadje (ne pa vsebine modala)
    if (e && e.target !== document.getElementById("modalWrap")) return;
    const modal = document.getElementById("modalWrap");
    if (modal) modal.style.display = "none";
}

async function login() {
    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");
    // Preveri, če ti vrstici dejansko dobita vrednost:
    console.log("Email vnos:", emailEl.value); 
    console.log("Geslo vnos:", passwordEl.value);
    if (!emailEl || !passwordEl) return;

    try {
        const res = await fetch(`${API}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailEl.value, password: passwordEl.value }),
        });

        const data = await res.json();

        if (res.ok) {
            localStorage.setItem("currentUser", JSON.stringify(data.user));
            currentUser = data.user;
            setUserPill();
            closeLogin();
            toast("Uspešno ste se prijavili!");
            if (typeof loadRentals === "function") loadRentals();
        } else {
            toast(data.error || "Napačni podatki za prijavo");
        }
    } catch (err) {
        console.error("Login error:", err);
        toast("Napaka pri povezavi s strežnikom.");
    }
}

function logout() {
    localStorage.removeItem("currentUser");
    currentUser = null;
    setUserPill();
    toast("Odjavljeni ste.");
    const rentalContainer = document.getElementById("rentals");
    if (rentalContainer) rentalContainer.innerHTML = "";
}

/* ===== 3. PRIKAZ IN PODATKI (RENDER & DATA) ===== */

function renderItems(items) {
    const container = document.getElementById("items");
    if (!container) return;

    container.innerHTML = "";

    if (!items || items.length === 0) {
        container.innerHTML = "<p>Ni opreme, ki bi ustrezala iskanju.</p>";
        return;
    }

    items.forEach(item => {
        const isAvailable = item.quantity_available > 0;
        const div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <b class="title">${item.name}</b>
                <span class="badge ${isAvailable ? 'ok' : 'bad'}">
                    ${isAvailable ? 'Na zalogi: ' + item.quantity_available : 'Razprodano'}
                </span>
            </div>
            <span class="meta">(${item.category_name})</span>
            <div class="hr"></div>
            <div class="price">${item.price_per_day} € / dan</div>
        `;
        container.appendChild(div);
    });
}

async function loadItems() {
    const catFilter = document.getElementById("catFilter");
    const searchInput = document.getElementById("search");
    const container = document.getElementById("items");

    try {
        const params = new URLSearchParams();
        if (catFilter && catFilter.value) params.append("category_id", catFilter.value.trim());
        if (searchInput && searchInput.value) params.append("search", searchInput.value.trim());

        const res = await fetch(`${API}/items?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

        const items = await res.json();
        renderItems(items);
    } catch (err) {
        console.error("Fetch error:", err);
        if (container) container.innerHTML = "Napaka pri nalaganju podatkov.";
    }
}

/* ===== 4. DOGODKI (EVENTS) ===== */

window.addEventListener("DOMContentLoaded", () => {
    console.log("INIT OK");
    setUserPill();
    loadItems();

    // Poslušalci za iskanje in filtriranje
    const catFilter = document.getElementById("catFilter");
    const searchInput = document.getElementById("search");

    if (catFilter) catFilter.addEventListener("change", loadItems);
    if (searchInput) searchInput.addEventListener("input", loadItems);
});