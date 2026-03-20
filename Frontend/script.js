const API = "http://localhost:3000/api";
let currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");
let cart = []; // Seznam izbranih artiklov

/* ===== 1. UI IN OSVEŽEVANJE ===== */

function setUserPill() {
    const el = document.getElementById("userPill");
    const loginBtn = document.querySelector('button[onclick="openLogin()"]');
    const logoutBtn = document.querySelector('button[onclick="logout()"]');
    
    if (!el) return;

    if (currentUser) {
        el.innerText = `${currentUser.email} (${currentUser.role})`;
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

/* ===== 2. PRIJAVA IN ODJAVA ===== */

function openLogin() {
    document.getElementById("modalWrap").style.display = "flex";
}

function closeLogin(e) {
    if (e && e.target !== document.getElementById("modalWrap")) return;
    document.getElementById("modalWrap").style.display = "none";
}

async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
        const res = await fetch(`${API}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem("currentUser", JSON.stringify(data.user));
            currentUser = data.user;
            setUserPill();
            closeLogin();
            loadItems();   // Ponovno naloži artikle, da se omogočijo gumbi
            loadRentals(); // Naloži izposoje na desni
            toast("Uspešna prijava!");
        } else {
            toast(data.error || "Napaka pri prijavi");
        }
    } catch (err) {
        toast("Napaka pri povezavi.");
    }
}

function logout() {
    localStorage.removeItem("currentUser");
    currentUser = null;
    cart = [];
    setUserPill();
    loadItems(); // Gumbi se onemogočijo
    document.getElementById("rentals").innerHTML = "";
    document.getElementById("checkoutSection").style.display = "none";
    toast("Odjavljeni ste.");
}

/* ===== 3. ARTIKLI IN IZPOSOJA ===== */

function renderItems(items) {
    const container = document.getElementById("items");
    if (!container) return;
    container.innerHTML = "";

    items.forEach(item => {
        const div = document.createElement("div");
        div.className = "card";

        const hasStock = item.quantity_available > 0;
        const isLoggedIn = currentUser !== null;

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <b class="title">${item.name}</b>
            </div>
            <span class="category">(${item.category_name})</span>
            <div class="hr"></div>
            <div class="price">${item.price_per_day} € / dan</div>
            <span class="badge ${hasStock ? 'ok' : 'bad'}">
                    ${hasStock ? 'Zaloga: ' + item.quantity_available : 'Ni zaloge'}
            </span>
            <button 
                class="btn ${isLoggedIn && hasStock ? 'primary' : 'btn-disabled'}" 
                onclick="addToCart(${item.id}, '${item.name.replace(/'/g, "\\'")}')"
                ${!isLoggedIn || !hasStock ? 'disabled' : ''}
                style="width: 100%; margin-top: 10px;">
                ${isLoggedIn ? (hasStock ? 'Izposodi si' : 'Ni zaloge') : 'Prijava potrebna'}
            </button>
        `;
        container.appendChild(div);
    });
}

async function loadItems() {
    try {
        const catFilter = document.getElementById("catFilter").value;
        const res = await fetch(`${API}/items${catFilter ? '?category_id=' + catFilter : ''}`);
        const items = await res.json();
        renderItems(items);
    } catch (err) {
        console.error("Napaka pri artiklih:", err);
    }
}

function addToCart(id, name) {
    const existing = cart.find(i => i.item_id === id);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ item_id: id, name: name, quantity: 1 });
    }
    
    document.getElementById("checkoutSection").style.display = "block";
    const cartList = document.getElementById("cartList");
    if (cartList) {
        cartList.innerHTML = cart.map(i => `<li>${i.name} (${i.quantity}x)</li>`).join("");
    }
    toast("Dodano v izbor.");
}

async function checkout() {
    if (!currentUser || !currentUser.id) {
        toast("Niste prijavljeni!");
        return;
    }
    if (cart.length === 0) {
        toast("Košarica je prazna!");
        return;
    }

    // Generiranje datumov v formatu YYYY-MM-DD
    const now = new Date();
    const date_from = now.toISOString().split('T')[0]; // Danes
    
    const later = new Date();
    later.setDate(now.getDate() + 7); // Vrnitev čez 7 dni
    const date_to = later.toISOString().split('T')[0];

    const payload = {
        user_id: currentUser.id,
        date_from: date_from,
        date_to: date_to,
        items: cart.map(i => ({ 
            item_id: i.item_id, 
            quantity: i.quantity 
        }))
    };

    console.log("Pošiljam podatke za izposojo:", payload);

    try {
        const res = await fetch(`${API}/rentals`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok) {
            toast("Izposoja uspešna!");
            cart = [];
            document.getElementById("checkoutSection").style.display = "none";
            loadItems();   // Osveži zalogo na ekranu
            loadRentals(); // Osveži seznam na desni
        } else {
            toast(data.message || "Napaka pri izposoji.");
        }
    } catch (e) {
        console.error("Napaka:", e);
        toast("Napaka pri povezavi s strežnikom.");
    }
}

/* ===== 4. SEZNAM IZPOSOJ (DESNA STRAN) ===== */

async function loadRentals() {
    const container = document.getElementById("rentals");
    // POPRAVEK: Izberemo h2 znotraj panela rentals
    const titleEl = document.querySelector(".panel.rentals h2"); 
    
    if (!currentUser || !container) return;

    // Posodobimo naslov
    if (titleEl) {
        titleEl.innerText = currentUser.role === 'admin' ? "Upravljanje izposoj (Admin)" : "Moje izposoje";
    }
   
    try {
        // Pošljemo user_id IN role, da backend ve, kaj vrniti
        const res = await fetch(`${API}/rentals/my?user_id=${currentUser.id}&role=${currentUser.role}`);
        const rentals = await res.json();
  
        container.innerHTML = rentals.map(r => {
            let buttons = "";
            
            // Logika za gumbe - samo za ADMINA
            if (currentUser.role === 'admin') {
                if (r.status === 'REQUESTED') {
                    buttons = `<button class="btn success small" onclick="approveRental(${r.id})" style="width:100%; margin-top:8px;">Odobri izposojo</button>`;
                } else if (r.status === 'APPROVED') {
                    buttons = `<button class="btn primary small" onclick="returnRental(${r.id})" style="width:100%; margin-top:8px;">Vrni opremo</button>`;
                }
            }

            return `
                <div class="rental-card" style="border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; border-radius: 8px; background: #fff;">
                    <div style="display: flex; justify-content: space-between;">
                        <b>Izposoja #${r.id}</b>
                        <span class="badge ${r.status.toLowerCase()}">${r.status}</span>
                    </div>
                    <div style="font-size: 0.8em; color: #666; margin: 4px 0;">
                        Termin: ${r.date_from} do ${r.date_to}
                    </div>
                    <ul style="margin: 5px 0; padding-left: 18px; font-size: 0.9em;">
                        ${r.items.map(it => `<li>${it.name} (${it.quantity}x)</li>`).join("")}
                    </ul>
                    ${buttons}
                </div>
            `;
        }).join("");
    } catch (e) {
        console.error(e);
        container.innerHTML = "Napaka pri nalaganju podatkov.";
    }
}

// Dodaj še funkcijo za odobritev, če je še nimaš
async function approveRental(id) {
    if (!confirm("Želiš odobriti to izposojo? Zaloga se bo zmanjšala.")) return;
    try {
        const res = await fetch(`${API}/rentals/${id}/approve`, { method: "POST" });
        if (res.ok) {
            toast("Izposoja odobrena!");
            loadRentals();
            loadItems(); // Osveži zalogo na karticah
        } else {
            const err = await res.json();
            alert(err.message);
        }
    } catch (e) {
        toast("Napaka pri povezavi.");
    }
}

/* ===== 5. ZAČETEK ===== */

window.addEventListener("DOMContentLoaded", () => {
    setUserPill();
    loadItems();
    if (currentUser) loadRentals();

    const catFilter = document.getElementById("catFilter");
    if (catFilter) catFilter.addEventListener("change", loadItems);
});

/* ===== 6. NAPOLNI KOŠARICO ===== */
function addToCart(id, name) {
    // 1. Preveri, če je artikel že v košarici
    const existing = cart.find(i => i.item_id === id);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ item_id: id, name: name, quantity: 1 });
    }
    
    // 2. Prikaži sekcijo košarice
    document.getElementById("checkoutSection").style.display = "block";
    
    // 3. Osveži seznam v košarici
    const cartList = document.getElementById("cartList");
    if (cartList) {
        cartList.innerHTML = cart.map(i => `<li>${i.name} (${i.quantity}x)</li>`).join("");
    }
    toast("Dodano v izbor.");
}

/* ===== 6. VRNI IZDELKE ===== */
async function returnRental(id) {
    if (!confirm("Označi opremo kot vrnjeno? (Zaloga se bo povečala)")) return;
    try {
        const res = await fetch(`${API}/rentals/${id}/return`, { 
            method: "POST" 
        });
        
        if (res.ok) {
            toast("Oprema uspešno vrnjena!");
            loadRentals();
            loadItems(); // Osveži zalogo na karticah
        } else {
            const err = await res.json();
            alert(err.message || "Napaka pri vračilu.");
        }
    } catch (e) {
        console.error(e);
        toast("Napaka pri povezavi.");
    }
}