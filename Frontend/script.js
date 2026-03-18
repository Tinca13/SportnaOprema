const API = "http://localhost:3000/api";

let currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");

/* ===== UTIL ===== */

function setUserPill(){
const el = document.getElementById("userPill");
if(!el) return;
el.innerText = currentUser ? currentUser.email : "Ni prijave";
}

function toast(msg){
const el = document.getElementById("toast");
if(!el) return;
el.innerText = msg;
el.style.display = "block";
setTimeout(() => el.style.display = "none", 3000);
}

/* ===== DATA ===== */

async function loadItems() {
  console.log("loadItems called");

  const container = document.getElementById("items");
  const catFilter = document.getElementById("catFilter");
  const searchInput = document.getElementById("search");

  if (!container) return;

  // 1. Get current filter values
  const categoryId = catFilter ? catFilter.value : "";

  try {
    // 2. Build the URL with query parameters
    // This creates: http://localhost:3000/api/items?category_id=1&search=bolt
    const url = new URL(`${API}/items`);
    if (categoryId) url.searchParams.append("category_id", categoryId);
   
    const res = await fetch(url);
    const items = await res.json();

    console.log("FILTERED ITEMS:", items);

    container.innerHTML = "";

    if (items.length === 0) {
      container.innerHTML = "Ni opreme, ki bi ustrezala iskanju.";
      return;
    }

    items.forEach(item => {
      const div = document.createElement("div");
      // Added a class 'card' for better styling if your CSS supports it
      div.className = "item-card"; 
      div.innerHTML = `
        <b>${item.name}</b> (${item.category_name})<br>
        ${item.price_per_day} € / dan<br><br>
      `;
      container.appendChild(div);
    });

  } catch (err) {
    console.error("Fetch error:", err);
    container.innerHTML = "Napaka pri nalaganju podatkov.";
  }
}

/* ===== INIT ===== */

window.addEventListener("DOMContentLoaded", () => {
console.log("INIT OK");
loadItems();
});