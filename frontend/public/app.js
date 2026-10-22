// Лепсинский мёд — SPA на чистом JS: hash-роутинг, JWT в localStorage, корзина в localStorage
const state = {
  token: localStorage.getItem("token"),
  me: null,
  cart: readCart(),
  settings: { delivery_prices: { pickup: 0, post: 1500, courier: 2500 }, free_delivery_from: 20000 },
};

const STATUSES = {
  new: "Новый", confirmed: "Подтверждён", shipped: "Отправлен", delivered: "Доставлен", cancelled: "Отменён",
};
const STEPS = ["new", "confirmed", "shipped", "delivered"];
const ADMIN_NEXT = {
  new: ["confirmed", "cancelled"], confirmed: ["shipped", "cancelled"], shipped: ["delivered"], delivered: [], cancelled: [],
};
const DELIVERY = {
  pickup: { title: "Самовывоз с пасеки", note: "с. Лепсинск" },
  post: { title: "Казпочта", note: "по всему Казахстану, 5–10 дней" },
  courier: { title: "Курьер", note: "Талдыкорган и Алматы, 1–3 дня" },
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $("#app");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
const money = (n) => `${Number(n).toLocaleString("ru-RU")} ₸`;
const weight = (g) => (g >= 1000 ? `${g / 1000} кг` : `${g} г`);
const fmtDate = (v) => new Date(v).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

function toast(text, isError = false) {
  const el = $("#toast");
  el.textContent = text;
  el.className = "toast" + (isError ? " error" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), 3500);
}

// ---------- API ----------
async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && state.token) logout(false);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = data.detail || `Ошибка ${res.status}`;
    if (Array.isArray(msg)) msg = msg.map((e) => `${e.loc.at(-1)}: ${e.msg}`).join("; ");
    throw new Error(msg);
  }
  return data;
}

async function loadMe() {
  if (!state.token) { state.me = null; return; }
  try { state.me = await api("/auth/me"); } catch { state.me = null; }
}

function saveToken(token) {
  state.token = token;
  localStorage.setItem("token", token);
}

function logout(redirect = true) {
  state.token = null;
  state.me = null;
  localStorage.removeItem("token");
  renderNav();
  if (redirect) location.hash = "#/";
}

// ---------- cart ----------
function readCart() {
  try { return JSON.parse(localStorage.getItem("cart")) || {}; } catch { return {}; }
}
function saveCart() {
  localStorage.setItem("cart", JSON.stringify(state.cart));
  renderNav();
}
function addToCart(product, qty = 1) {
  const current = state.cart[product.id] || 0;
  const next = Math.min(current + qty, product.stock);
  if (next === current) { toast(`Больше «${product.name}» нет в наличии`, true); return; }
  state.cart[product.id] = next;
  saveCart();
  toast(`«${product.name}» в корзине · ${next} шт.`);
}
const cartCount = () => Object.values(state.cart).reduce((a, b) => a + b, 0);

function deliveryPrice(method, itemsTotal) {
  if (itemsTotal >= state.settings.free_delivery_from) return 0;
  return state.settings.delivery_prices[method] ?? 0;
}

// ---------- illustrations ----------
function jar(color, label = "ЛЕПСЫ") {
  return `<svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="25" y="5" width="50" height="19" rx="5" fill="#8A5A24"/>
    <rect x="25" y="5" width="50" height="7" rx="3.5" fill="#B07834"/>
    <path d="M23 24h54v4c8 4 12 10 12 19v64c0 9-7 15-15 15H26c-8 0-15-6-15-15V47c0-9 4-15 12-19z" fill="#fff" fill-opacity=".6" stroke="#E6D2AE" stroke-width="2"/>
    <path d="M15 45c0-6 3-10 9-11h52c6 1 9 5 9 11v65c0 7-5 12-12 12H27c-7 0-12-5-12-12z" fill="${color}"/>
    <path d="M23 50v54" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/>
    <rect x="25" y="64" width="50" height="34" rx="6" fill="#FFF8EC" stroke="#C47A17" stroke-width="1.2"/>
    <polygon points="50,69 56,72.5 56,79.5 50,83 44,79.5 44,72.5" fill="#E9A23B"/>
    <text x="50" y="93" text-anchor="middle" font-family="Lora, Georgia, serif" font-size="7.5" font-weight="700" fill="#3B2A1A">${esc(label)}</text>
  </svg>`;
}

function comb(color) {
  const id = `comb${color.slice(1)}`;
  return `<svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><pattern id="${id}" width="14" height="24" patternUnits="userSpaceOnUse" patternTransform="scale(.9)">
      <path d="M7 0l7 4v8l-7 4-7-4V4zM0 16l7 4v8M14 16l-7 4" fill="${color}" stroke="#F7D58C" stroke-width="1.4"/>
    </pattern></defs>
    <rect x="8" y="10" width="104" height="112" rx="6" fill="#B07834"/>
    <rect x="16" y="18" width="88" height="96" rx="3" fill="url(#${id})"/>
    <rect x="16" y="18" width="88" height="96" rx="3" fill="#fff" fill-opacity=".12"/>
  </svg>`;
}

const productArt = (p) => (p.variety === "Соты" ? comb(p.color) : jar(p.color, p.weight_g >= 1000 ? "ЛЕПСЫ" : weight(p.weight_g)));
const artBg = (color) => `background: radial-gradient(circle at 50% 62%, ${color}55 0%, #FBF1DF 68%);`;

function scale(label, n) {
  return `<div class="scale">${label} <span class="dots">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span></div>`;
}

const MOUNTAINS = `<svg class="mountains" viewBox="0 0 1440 260" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M0 150 L120 70 L210 120 L330 30 L450 115 L560 55 L690 125 L820 40 L940 110 L1060 50 L1190 120 L1310 60 L1440 110 V260 H0Z" fill="#C98A3E" fill-opacity=".55"/>
  <path d="M330 30 L360 50 L340 48 L320 60 L305 46Z M820 40 L850 62 L828 58 L808 70 L795 56Z M1060 50 L1088 70 L1066 66 L1048 76 L1036 64Z" fill="#FFF8EC" fill-opacity=".9"/>
  <path d="M0 190 L160 110 L300 170 L470 95 L620 165 L780 105 L930 170 L1100 100 L1260 165 L1440 120 V260 H0Z" fill="#8C5A2B"/>
  <path d="M0 225 C200 185 380 215 560 200 C760 182 930 220 1120 198 C1270 182 1360 200 1440 192 V260 H0Z" fill="#5D7B3A"/>
  <path d="M0 248 C240 232 480 252 720 240 C960 228 1200 250 1440 238 V260 H0Z" fill="#FFF8EC"/>
</svg>`;

const VILLAGE = `<svg viewBox="0 0 600 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Рисунок: пасека у подножия гор">
  <rect width="600" height="420" fill="#F9E4B7"/>
  <circle cx="470" cy="90" r="46" fill="#FFF3CF"/>
  <path d="M0 220 L90 120 L160 170 L260 70 L360 165 L440 110 L600 200 V420 H0Z" fill="#B9C7A3"/>
  <path d="M260 70 L290 100 L270 96 L250 110 L238 92Z M90 120 L112 142 L96 140 L80 150 L72 136Z" fill="#fff"/>
  <path d="M0 260 L120 190 L230 245 L340 180 L470 240 L600 210 V420 H0Z" fill="#7F9A5A"/>
  <path d="M0 300 C150 270 300 300 600 275 V420 H0Z" fill="#9DB86E"/>
  <path d="M-10 360 C120 330 220 380 330 350 C440 320 520 360 610 335" stroke="#8EC3D9" stroke-width="16" fill="none"/>
  <g fill="#6B4A2B"><rect x="70" y="262" width="34" height="26"/><rect x="200" y="252" width="40" height="30"/></g>
  <g fill="#A9472E"><path d="M64 264 L87 244 L110 264Z"/><path d="M194 254 L220 232 L246 254Z"/></g>
  <g>
    <rect x="360" y="290" width="30" height="24" rx="2" fill="#E9A23B"/><rect x="356" y="284" width="38" height="8" rx="2" fill="#8A5A24"/>
    <rect x="410" y="300" width="30" height="24" rx="2" fill="#F1C66B"/><rect x="406" y="294" width="38" height="8" rx="2" fill="#8A5A24"/>
    <rect x="460" y="288" width="30" height="24" rx="2" fill="#D98E2B"/><rect x="456" y="282" width="38" height="8" rx="2" fill="#8A5A24"/>
  </g>
  <g fill="#3B2A1A"><circle cx="400" cy="262" r="3"/><circle cx="430" cy="250" r="3"/><circle cx="452" cy="268" r="3"/></g>
  <g fill="#fff" fill-opacity=".8"><ellipse cx="398" cy="259" rx="4" ry="2"/><ellipse cx="428" cy="247" rx="4" ry="2"/><ellipse cx="450" cy="265" rx="4" ry="2"/></g>
  <g fill="#F4E04D"><circle cx="40" cy="320" r="4"/><circle cx="120" cy="330" r="4"/><circle cx="300" cy="318" r="4"/><circle cx="540" cy="305" r="4"/></g>
  <g fill="#C66BB0"><circle cx="80" cy="340" r="4"/><circle cx="260" cy="332" r="4"/><circle cx="500" cy="320" r="4"/></g>
</svg>`;

// ---------- modal ----------
function openModal(html, onMount) {
  $("#modal-body").innerHTML = html;
  $("#modal").classList.remove("hidden");
  onMount?.($("#modal-body"));
}
function closeModal() { $("#modal").classList.add("hidden"); }
$("#modal").addEventListener("click", (e) => {
  if (e.target.id === "modal" || e.target.hasAttribute("data-close")) closeModal();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
const formData = (form) => Object.fromEntries(new FormData(form).entries());

// ---------- navigation ----------
function renderNav() {
  const me = state.me;
  const route = (location.hash || "#/").split("?")[0];
  const link = (href, text, cls = "") => `<a href="${href}" class="${cls} ${route === href ? "active" : ""}">${text}</a>`;
  let html = link("#/", "Главная") + link("#/catalog", "Каталог") + link("#/quiz", "Подобрать мёд");
  if (me) {
    html += link("#/orders", "Мои заказы");
    if (me.role === "admin") html += link("#/admin", "Пасечнику");
    html += link("#/profile", esc(me.username));
    html += `<a href="#" id="logout">Выйти</a>`;
  } else {
    html += link("#/login", "Войти");
  }
  const count = cartCount();
  html += link("#/cart", `Корзина${count ? `<span class="count">${count}</span>` : ""}`, "cart-link");
  $("#nav").innerHTML = html;
  $("#logout")?.addEventListener("click", (e) => { e.preventDefault(); logout(); });
}
$("#burger").addEventListener("click", () => $("#nav").classList.toggle("open"));

const routes = {
  "#/": pageHome,
  "#/catalog": pageCatalog,
  "#/quiz": pageQuiz,
  "#/cart": pageCart,
  "#/login": pageLogin,
  "#/register": pageRegister,
  "#/orders": pageOrders,
  "#/profile": pageProfile,
  "#/admin": pageAdmin,
};
const PRIVATE = ["#/orders", "#/profile", "#/admin"];

// pages that load data first must not draw over a newer page
const stale = (nav) => nav !== state.nav;

async function router() {
  const route = (location.hash || "#/").split("?")[0];
  if (PRIVATE.includes(route) && !state.me) { location.hash = "#/login"; return; }
  if (route === "#/admin" && state.me?.role !== "admin") { location.hash = "#/"; return; }
  renderNav();
  closeModal();
  $("#nav").classList.remove("open");
  window.scrollTo(0, 0);
  state.nav = (state.nav || 0) + 1;
  try {
    await (routes[route] || pageHome)();
  } catch (err) {
    app.innerHTML = `<div class="container"><div class="empty"><span class="icon">🐝</span>${esc(err.message)}</div></div>`;
  }
}

// ---------- product card & detail ----------
function productCard(p) {
  const inCart = state.cart[p.id] || 0;
  const stockBadge = p.stock === 0
    ? '<span class="badge red tag">Нет в наличии</span>'
    : p.stock < 5 ? `<span class="badge tag">Осталось ${p.stock}</span>` : "";
  return `
    <article class="product">
      <div class="art" data-open="${p.id}" style="${artBg(p.color)}">${stockBadge}${productArt(p)}</div>
      <div class="body">
        <span class="badge gray" style="align-self:flex-start">${esc(p.variety)}</span>
        <h3 data-open="${p.id}">${esc(p.name)}</h3>
        <div class="taste">${esc(p.taste)}</div>
        ${scale("Сладость", p.sweetness)}${scale("Яркость", p.intensity)}
        <div class="meta">${weight(p.weight_g)} · пасека на ${p.altitude_m} м</div>
        <div class="buy">
          <span class="price">${money(p.price)}</span>
          <button class="btn honey small" data-add="${p.id}" ${p.stock === 0 ? "disabled" : ""}>
            ${inCart ? `В корзине: ${inCart}` : "В корзину"}</button>
        </div>
      </div>
    </article>`;
}

function bindProducts(root, products, rerender) {
  const byId = (id) => products.find((p) => p.id === Number(id));
  $$("[data-add]", root).forEach((b) => b.addEventListener("click", () => {
    addToCart(byId(b.dataset.add));
    rerender?.();
  }));
  $$("[data-open]", root).forEach((el) => el.addEventListener("click", () => openProduct(byId(el.dataset.open), rerender)));
}

function openProduct(p, onChange) {
  let qty = 1;
  openModal(`
    <div class="detail">
      <div class="art" style="${artBg(p.color)}">${productArt(p)}</div>
      <div>
        <span class="badge gray">${esc(p.variety)}</span>
        <h2 style="margin-top:8px">${esc(p.name)}</h2>
        <p class="muted"><i>${esc(p.taste)}</i></p>
        <p>${esc(p.description)}</p>
        <div class="specs">
          <div>Вес<b>${weight(p.weight_g)}</b></div>
          <div>Высота пасеки<b>${p.altitude_m} м</b></div>
          <div>Сбор<b>${p.harvest_year} год</b></div>
          <div>В наличии<b>${p.stock} шт.</b></div>
        </div>
        ${scale("Сладость", p.sweetness)}${scale("Яркость вкуса", p.intensity)}
        <div class="buy" style="display:flex;align-items:center;gap:14px;margin-top:18px;flex-wrap:wrap">
          <span class="price">${money(p.price)}</span>
          <div class="qty"><button data-q="-1">−</button><span id="q">1</span><button data-q="1">+</button></div>
          <button class="btn" id="add" ${p.stock === 0 ? "disabled" : ""}>Добавить в корзину</button>
        </div>
      </div>
    </div>`, (root) => {
    $$("[data-q]", root).forEach((b) => b.addEventListener("click", () => {
      qty = Math.max(1, Math.min(p.stock || 1, qty + Number(b.dataset.q)));
      $("#q", root).textContent = qty;
    }));
    $("#add", root).addEventListener("click", () => {
      addToCart(p, qty);
      closeModal();
      onChange?.();
    });
  });
}

// ---------- home ----------
async function pageHome() {
  const nav = state.nav;
  const products = await api("/products?sort=price_desc");
  if (stale(nav)) return;
  app.innerHTML = `
    <section class="hero">
      <div class="sun"></div>
      <div class="hero-inner">
        <div class="eyebrow">с. Лепсинск · Джунгарский Алатау</div>
        <h1>Мёд с альпийских лугов, где пчёлы работают выше облаков</h1>
        <p class="lead">Горный, луговой, донниковый и мёд в сотах — с небольших семейных пасек у подножия гор.
          Без нагрева, без смешивания, прямо из медогонки в банку.</p>
        <div class="hero-actions">
          <a class="btn" href="#/catalog">Выбрать мёд</a>
          <a class="btn ghost" href="#/quiz">Подобрать по вкусу →</a>
        </div>
        <div class="facts">
          <div><b>до 1800 м</b><span>высота горных пасек</span></div>
          <div><b>${products.length} видов</b><span>мёда и продуктов пчеловодства</span></div>
          <div><b>2026</b><span>сбор этого сезона</span></div>
        </div>
      </div>
      ${MOUNTAINS}
    </section>

    <section class="section">
      <div class="story">
        <div>
          <div class="eyebrow">Откуда мёд</div>
          <h2>Село Лепсинск</h2>
          <p>Лепсинск стоит на реке Лепсы, у самого подножия Джунгарского Алатау, на востоке области Жетысу.
            Село основали казаки в середине XIX века, и с тех пор пчеловодство здесь — семейное дело,
            которое передают от деда к внуку.</p>
          <p>Летом склоны над селом превращаются в сплошной цветущий ковёр: донник и эспарцет внизу,
            кипрей, душица и десятки горных трав выше. Чистый воздух, отсутствие промышленности
            и короткое горное лето делают местный мёд густым и ароматным.</p>
          <a class="btn light" href="#/catalog">Смотреть сорта</a>
        </div>
        <div class="story-art">${VILLAGE}</div>
      </div>
    </section>

    <section class="section" style="padding-top:0">
      <div class="features">
        <div class="feature"><div class="icon">🏔️</div><h3>Горные пасеки</h3><p class="muted">Ульи вывозят на луга на высоту от 900 до 1800 метров — каждому сорту своя высота.</p></div>
        <div class="feature"><div class="icon">🍯</div><h3>Без нагрева</h3><p class="muted">Мёд не греют и не фильтруют под давлением, поэтому он естественно кристаллизуется.</p></div>
        <div class="feature"><div class="icon">🐝</div><h3>Один сезон</h3><p class="muted">На каждой банке — год сбора и высота пасеки. Остатки прошлых лет не смешиваем.</p></div>
        <div class="feature"><div class="icon">📦</div><h3>Доставка</h3><p class="muted">Казпочтой по всему Казахстану, курьером в Талдыкорган и Алматы. От ${money(state.settings.free_delivery_from)} — бесплатно.</p></div>
      </div>
    </section>

    <section class="section" style="background:#FBEFD6">
      <div class="section-head"><div><div class="eyebrow">Год на пасеке</div><h2>Как рождается лепсинский мёд</h2></div></div>
      <div class="timeline">
        <div class="month"><b>Май</b><p>Пчёлы делают первый облёт, семьи набирают силу на весенних первоцветах.</p></div>
        <div class="month"><b>Июнь</b><p>Цветут донник и эспарцет — самые светлые и нежные сорта.</p></div>
        <div class="month"><b>Июль</b><p>Ульи поднимают в горы: кипрей и альпийское разнотравье.</p></div>
        <div class="month"><b>Август</b><p>Откачка горного мёда и запечатанных сот.</p></div>
        <div class="month"><b>Сентябрь</b><p>Пасеки спускаются в село и готовятся к зимовке.</p></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><div class="eyebrow">Популярное</div><h2>Сорта этого сезона</h2></div>
        <a class="btn ghost" href="#/catalog">Весь каталог →</a>
      </div>
      <div class="container" style="padding:0"><div id="featured" class="grid"></div></div>
    </section>

    <section class="section" style="padding-top:0">
      <div class="card" style="max-width:1180px;margin:0 auto;display:flex;gap:24px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:#3B2A1A;color:#FFF3D6;border:0">
        <div><h2 style="color:#fff">Не знаете, какой мёд выбрать?</h2>
          <p style="margin:0">Ответьте на 3 вопроса — подскажем сорт под ваш вкус.</p></div>
        <a class="btn honey" href="#/quiz">Подобрать мёд</a>
      </div>
    </section>`;

  const featured = products.slice(0, 4);
  const draw = () => {
    $("#featured").innerHTML = featured.map(productCard).join("");
    bindProducts($("#featured"), featured, draw);
  };
  draw();
}

// ---------- catalog ----------
async function pageCatalog() {
  const nav = state.nav;
  const varieties = await api("/products/varieties");
  if (stale(nav)) return;
  const filter = { q: "", variety: "", sort: "name", in_stock: false };
  app.innerHTML = `
    <div class="container">
      <div class="eyebrow">Каталог</div>
      <h1>Мёд и дары пасеки</h1>
      <p class="muted">Сбор 2026 года. Нажмите на банку, чтобы узнать подробности.</p>
      <div class="toolbar">
        <input id="q" placeholder="Поиск: горный, донник, соты…">
        <select id="sort">
          <option value="name">По названию</option>
          <option value="price_asc">Сначала дешевле</option>
          <option value="price_desc">Сначала дороже</option>
          <option value="new">Новинки</option>
        </select>
        <label class="chip" style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="stock" style="width:auto"> В наличии</label>
      </div>
      <div class="chips" id="chips">
        <button class="chip active" data-v="">Все</button>
        ${varieties.map((v) => `<button class="chip" data-v="${esc(v)}">${esc(v)}</button>`).join("")}
      </div>
      <div id="list" class="grid"></div>
    </div>`;

  let products = [];
  const draw = () => {
    $("#list").innerHTML = products.length
      ? products.map(productCard).join("")
      : `<div class="empty"><span class="icon">🔍</span>Ничего не нашлось — попробуйте другой запрос</div>`;
    bindProducts($("#list"), products, draw);
  };
  const load = async () => {
    const params = new URLSearchParams({ sort: filter.sort });
    if (filter.q) params.set("q", filter.q);
    if (filter.variety) params.set("variety", filter.variety);
    if (filter.in_stock) params.set("in_stock", "true");
    products = await api(`/products?${params}`);
    draw();
  };
  let timer;
  $("#q").addEventListener("input", (e) => { filter.q = e.target.value.trim(); clearTimeout(timer); timer = setTimeout(load, 300); });
  $("#sort").addEventListener("change", (e) => { filter.sort = e.target.value; load(); });
  $("#stock").addEventListener("change", (e) => { filter.in_stock = e.target.checked; load(); });
  $$("#chips .chip").forEach((chip) => chip.addEventListener("click", () => {
    $$("#chips .chip").forEach((c) => c.classList.toggle("active", c === chip));
    filter.variety = chip.dataset.v;
    load();
  }));
  await load();
}

// ---------- honey picker ----------
const QUIZ = [
  {
    question: "Какой вкус вам ближе?",
    options: [
      { icon: "🌼", title: "Нежный и сладкий", text: "Мягкий, сливочный, без горчинки", sweet: 5, bold: 1 },
      { icon: "🌸", title: "Цветочный, сбалансированный", text: "Классика к чаю", sweet: 4, bold: 3 },
      { icon: "🏔️", title: "Яркий, с характером", text: "Пряный, терпкий, насыщенный", sweet: 2, bold: 5 },
    ],
  },
  {
    question: "Для чего вы выбираете мёд?",
    options: [
      { icon: "☕", title: "К чаю каждый день", text: "Чтобы был всегда под рукой", prefer: ["Луговой"], cheap: true },
      { icon: "🎁", title: "В подарок", text: "Что-то особенное", prefer: ["Соты", "Горный"] },
      { icon: "❄️", title: "На зиму, для иммунитета", text: "Когда хочется чего-то полезного", prefer: ["Продукты пчеловодства", "Горный"] },
    ],
  },
  {
    question: "Кто будет есть мёд?",
    options: [
      { icon: "🧒", title: "Дети", text: "Нужен самый мягкий вкус", sweet: 5, bold: 1 },
      { icon: "👨‍👩‍👧", title: "Вся семья", text: "Чтобы понравилось всем", sweet: 4, bold: 3 },
      { icon: "🧐", title: "Ценитель", text: "Хочу попробовать редкое", bold: 5, high: true },
    ],
  },
];

function recommend(products, answers) {
  const pick = (key) => answers.map((a) => a[key]).filter((v) => v !== undefined);
  const avg = (arr, fallback) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : fallback);
  const sweet = avg(pick("sweet"), 3);
  const bold = avg(pick("bold"), 3);
  const prefer = answers.flatMap((a) => a.prefer || []);
  const cheap = answers.some((a) => a.cheap);
  const high = answers.some((a) => a.high);
  return products
    .filter((p) => p.stock > 0)
    .map((p) => {
      let score = 10 - Math.abs(p.sweetness - sweet) * 1.5 - Math.abs(p.intensity - bold) * 1.5;
      if (prefer.includes(p.variety)) score += 2;
      if (cheap) score -= p.price / 5000;
      if (high) score += p.altitude_m / 1000;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ p }) => p);
}

async function pageQuiz() {
  const nav = state.nav;
  const products = await api("/products");
  if (stale(nav)) return;
  const answers = [];

  const drawStep = () => {
    const step = answers.length;
    if (step === QUIZ.length) return drawResult();
    const q = QUIZ[step];
    app.innerHTML = `
      <div class="container quiz">
        <div class="eyebrow">Подбор мёда · вопрос ${step + 1} из ${QUIZ.length}</div>
        <h1>${q.question}</h1>
        <div class="progress"><div style="width:${(step / QUIZ.length) * 100}%"></div></div>
        <div class="options">
          ${q.options.map((o, i) => `<button class="option" data-i="${i}"><span class="icon">${o.icon}</span><b>${o.title}</b><span>${o.text}</span></button>`).join("")}
        </div>
        ${step ? '<p style="margin-top:20px"><a href="#" id="back">← Назад</a></p>' : ""}
      </div>`;
    $$(".option").forEach((b) => b.addEventListener("click", () => { answers.push(q.options[b.dataset.i]); drawStep(); }));
    $("#back")?.addEventListener("click", (e) => { e.preventDefault(); answers.pop(); drawStep(); });
  };

  const drawResult = () => {
    const top = recommend(products, answers);
    app.innerHTML = `
      <div class="container">
        <div class="quiz">
          <div class="eyebrow">Ваш мёд</div>
          <h1>Вот что мы бы вам налили</h1>
          <div class="progress"><div style="width:100%"></div></div>
          <p class="muted">Первый вариант подходит лучше всего. Можно сразу положить в корзину.</p>
        </div>
        <div id="result" class="grid" style="margin-top:20px"></div>
        <p style="text-align:center;margin-top:28px"><button class="btn ghost" id="again">Пройти ещё раз</button></p>
      </div>`;
    const draw = () => {
      $("#result").innerHTML = top.length ? top.map(productCard).join("") : `<div class="empty">Сейчас всё раскупили — загляните позже</div>`;
      bindProducts($("#result"), top, draw);
    };
    draw();
    $("#again").addEventListener("click", () => { answers.length = 0; drawStep(); });
  };
  drawStep();
}

// ---------- cart & checkout ----------
async function pageCart() {
  const ids = Object.keys(state.cart);
  const nav = state.nav;
  const all = ids.length ? await api("/products") : [];
  if (stale(nav)) return;
  // drop products that disappeared or went out of stock
  const lines = [];
  for (const id of ids) {
    const p = all.find((x) => x.id === Number(id));
    if (!p || p.stock === 0) { delete state.cart[id]; continue; }
    state.cart[id] = Math.min(state.cart[id], p.stock);
    lines.push(p);
  }
  saveCart();

  if (!lines.length) {
    app.innerHTML = `<div class="container"><div class="empty"><span class="icon">🍯</span>
      <h2>Корзина пока пуста</h2><p>Загляните в каталог — там ${all.length || "много"} вкусных банок.</p>
      <a class="btn" href="#/catalog">В каталог</a></div></div>`;
    return;
  }

  const me = state.me;
  let delivery = "post";
  app.innerHTML = `
    <div class="container">
      <div class="eyebrow">Оформление</div>
      <h1>Корзина</h1>
      <div class="cart">
        <div class="card"><div id="lines"></div></div>
        <div class="card summary">
          <h3>Доставка</h3>
          <div class="delivery-options">
            ${Object.entries(DELIVERY).map(([k, d]) => `
              <label><input type="radio" name="delivery" value="${k}" ${k === delivery ? "checked" : ""}>
                <span>${d.title}<br><small class="muted">${d.note}</small></span><em>${state.settings.delivery_prices[k] ? money(state.settings.delivery_prices[k]) : "бесплатно"}</em></label>`).join("")}
          </div>
          <div id="totals"></div>
          <form id="checkout">
            <h3 style="margin-top:20px">Получатель</h3>
            <label>Имя</label><input name="customer_name" required minlength="2" value="${esc(me?.full_name)}">
            <label>Телефон</label><input name="phone" required minlength="5" placeholder="+7 7__ ___ __ __" value="${esc(me?.phone)}">
            <div id="address-box"><label>Адрес доставки</label><input name="address" value="${esc(me?.address)}" placeholder="Город, улица, дом, квартира"></div>
            <label>Комментарий</label><textarea name="comment" placeholder="Например: позвонить за час"></textarea>
            ${me ? '<button class="btn block">Оформить заказ</button>'
              : '<button type="button" class="btn block" id="go-login">Войти, чтобы оформить</button><p class="muted" style="font-size:13px;text-align:center">Корзина сохранится</p>'}
          </form>
        </div>
      </div>
    </div>`;

  const draw = () => {
    $("#lines").innerHTML = lines.map((p) => `
      <div class="line">
        <div style="${artBg(p.color)};border-radius:12px;display:flex;justify-content:center">${productArt(p)}</div>
        <div><b>${esc(p.name)}</b><div class="muted" style="font-size:13px">${weight(p.weight_g)} · ${money(p.price)}</div>
          <div class="qty" style="margin-top:6px"><button data-dec="${p.id}">−</button><span>${state.cart[p.id]}</span><button data-inc="${p.id}">+</button></div></div>
        <b class="line-sum">${money(p.price * state.cart[p.id])}</b>
        <button class="remove" data-rm="${p.id}" title="Убрать">×</button>
      </div>`).join("");
    const itemsTotal = lines.reduce((s, p) => s + p.price * state.cart[p.id], 0);
    const fee = deliveryPrice(delivery, itemsTotal);
    const left = state.settings.free_delivery_from - itemsTotal;
    $("#totals").innerHTML = `
      ${delivery !== "pickup" && left > 0 ? `<div class="hint">Добавьте мёда ещё на ${money(left)} — и доставка будет бесплатной 🐝</div>` : ""}
      <div class="row"><span>Товары</span><b>${money(itemsTotal)}</b></div>
      <div class="row"><span>Доставка</span><b>${fee ? money(fee) : "бесплатно"}</b></div>
      <div class="row total"><span>Итого</span><span>${money(itemsTotal + fee)}</span></div>`;
    $("#address-box").classList.toggle("hidden", delivery === "pickup");

    const change = (id, delta) => {
      const p = lines.find((x) => x.id === Number(id));
      const next = state.cart[id] + delta;
      if (next > p.stock) { toast(`В наличии только ${p.stock} шт.`, true); return; }
      if (next <= 0) { delete state.cart[id]; lines.splice(lines.indexOf(p), 1); } else state.cart[id] = next;
      saveCart();
      lines.length ? draw() : pageCart();
    };
    $$("[data-inc]").forEach((b) => b.addEventListener("click", () => change(b.dataset.inc, 1)));
    $$("[data-dec]").forEach((b) => b.addEventListener("click", () => change(b.dataset.dec, -1)));
    $$("[data-rm]").forEach((b) => b.addEventListener("click", () => change(b.dataset.rm, -state.cart[b.dataset.rm])));
  };
  $$("input[name=delivery]").forEach((r) => r.addEventListener("change", () => { delivery = r.value; draw(); }));
  draw();

  $("#go-login")?.addEventListener("click", () => {
    sessionStorage.setItem("afterLogin", "#/cart");
    location.hash = "#/login";
  });
  $("#checkout").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    try {
      const order = await api("/orders", {
        method: "POST",
        body: { ...data, delivery, items: Object.entries(state.cart).map(([id, q]) => ({ product_id: Number(id), quantity: q })) },
      });
      state.cart = {};
      saveCart();
      toast(`Заказ №${order.id} оформлен! Пасечник скоро свяжется с вами.`);
      location.hash = "#/orders";
    } catch (err) { toast(err.message, true); }
  });
}

// ---------- auth ----------
function afterAuth() {
  const next = sessionStorage.getItem("afterLogin") || "#/catalog";
  sessionStorage.removeItem("afterLogin");
  location.hash = next;
}

function pageLogin() {
  app.innerHTML = `
    <div class="container"><div class="card form-card">
      <div class="eyebrow">Добро пожаловать</div>
      <h1>Вход</h1>
      <form id="login-form">
        <label>Логин</label><input name="username" required autocomplete="username">
        <label>Пароль</label><input name="password" type="password" required autocomplete="current-password">
        <button class="btn block">Войти</button>
      </form>
      <p style="margin-top:16px">Впервые у нас? <a href="#/register">Создать аккаунт</a></p>
      <p class="muted" style="font-size:13px">Демо: <b>demo</b> / demo123 · пасечник: <b>admin</b> / admin12345</p>
    </div></div>`;
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const { access_token } = await api("/auth/login", { method: "POST", body: formData(e.target) });
      saveToken(access_token);
      await loadMe();
      toast(`Рады видеть, ${state.me.full_name || state.me.username}!`);
      afterAuth();
    } catch (err) { toast(err.message, true); }
  });
}

function pageRegister() {
  app.innerHTML = `
    <div class="container"><div class="card form-card">
      <div class="eyebrow">Новый покупатель</div>
      <h1>Регистрация</h1>
      <form id="reg-form">
        <label>Как к вам обращаться</label><input name="full_name" placeholder="Имя и фамилия">
        <label>Логин</label><input name="username" required minlength="3" pattern="[A-Za-z0-9_.\\-]+" title="Латиница, цифры, _ . -">
        <label>Email</label><input name="email" type="email" required>
        <label>Пароль</label><input name="password" type="password" required minlength="6" autocomplete="new-password">
        <button class="btn block">Создать аккаунт</button>
      </form>
      <p style="margin-top:16px">Уже есть аккаунт? <a href="#/login">Войти</a></p>
    </div></div>`;
  $("#reg-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    try {
      await api("/auth/register", { method: "POST", body: data });
      const { access_token } = await api("/auth/login", { method: "POST", body: { username: data.username, password: data.password } });
      saveToken(access_token);
      await loadMe();
      toast("Аккаунт создан!");
      afterAuth();
    } catch (err) { toast(err.message, true); }
  });
}

// ---------- my orders ----------
function steps(status) {
  if (status === "cancelled") return '<p><span class="badge red">Заказ отменён</span></p>';
  const idx = STEPS.indexOf(status);
  return `<div class="steps">${STEPS.map((s, i) => `<div class="${i <= idx ? "done" : ""}">${STATUSES[s]}</div>`).join("")}</div>`;
}

function orderCard(o, { admin = false } = {}) {
  let actions = "";
  if (!admin && o.status === "new") {
    actions += `<button class="btn light small" data-edit="${o.id}">Изменить</button>
                <button class="btn danger small" data-cancel="${o.id}">Отменить</button>`;
  }
  if (!admin && ["new", "cancelled"].includes(o.status)) actions += `<button class="btn danger small" data-del="${o.id}">Удалить</button>`;
  return `
    <div class="card order">
      <div class="order-head">
        <div><h3 style="margin:0">Заказ №${o.id}</h3><span class="muted">${fmtDate(o.created_at)}${admin ? ` · ${esc(o.username)}` : ""}</span></div>
        <span class="price">${money(o.total)}</span>
      </div>
      ${steps(o.status)}
      <ul>${o.items.map((i) => `<li>${esc(i.product_name)} × ${i.quantity} — ${money(i.price * i.quantity)}</li>`).join("")}</ul>
      <p class="muted" style="margin:10px 0 0;font-size:14px">${DELIVERY[o.delivery].title}${o.address ? ` · ${esc(o.address)}` : ""} · доставка ${o.delivery_price ? money(o.delivery_price) : "бесплатно"}<br>
        ${esc(o.customer_name)}, ${esc(o.phone)}${o.comment ? ` · «${esc(o.comment)}»` : ""}</p>
      ${actions ? `<div class="actions">${actions}</div>` : ""}
    </div>`;
}

async function pageOrders() {
  const nav = state.nav;
  const orders = await api("/orders");
  if (stale(nav)) return;
  if (!orders.length) {
    app.innerHTML = `<div class="container"><div class="empty"><span class="icon">📦</span>
      <h2>Заказов пока нет</h2><a class="btn" href="#/catalog">Выбрать мёд</a></div></div>`;
    return;
  }
  app.innerHTML = `<div class="container" style="max-width:820px">
    <div class="eyebrow">Личный кабинет</div><h1>Мои заказы</h1>
    <p class="muted">Новый заказ можно изменить или отменить, пока пасечник его не подтвердил.</p>
    <div id="orders">${orders.map((o) => orderCard(o)).join("")}</div></div>`;

  const byId = (id) => orders.find((o) => o.id === Number(id));
  $$("[data-edit]").forEach((b) => b.addEventListener("click", () => editOrder(byId(b.dataset.edit))));
  $$("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Отменить заказ? Мёд вернётся на полку.")) return;
    try { await api(`/orders/${b.dataset.cancel}`, { method: "PUT", body: { status: "cancelled" } }); toast("Заказ отменён"); pageOrders(); } catch (err) { toast(err.message, true); }
  }));
  $$("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Удалить заказ из истории?")) return;
    try { await api(`/orders/${b.dataset.del}`, { method: "DELETE" }); toast("Заказ удалён"); pageOrders(); } catch (err) { toast(err.message, true); }
  }));
}

function editOrder(o) {
  const items = o.items.filter((i) => i.product_id);
  openModal(`
    <h2>Заказ №${o.id}</h2>
    <form id="edit-order">
      <h3>Состав</h3>
      ${items.map((i, n) => `<div class="line" style="grid-template-columns:1fr auto"><span>${esc(i.product_name)} · ${money(i.price)}</span>
        <input type="number" name="q${n}" min="0" max="50" value="${i.quantity}" style="width:80px"></div>`).join("")}
      <p class="muted" style="font-size:13px">Поставьте 0, чтобы убрать позицию.</p>
      <label>Доставка</label>
      <select name="delivery">${Object.entries(DELIVERY).map(([k, d]) => `<option value="${k}" ${k === o.delivery ? "selected" : ""}>${d.title}</option>`).join("")}</select>
      <div class="form-row">
        <div><label>Имя</label><input name="customer_name" required minlength="2" value="${esc(o.customer_name)}"></div>
        <div><label>Телефон</label><input name="phone" required minlength="5" value="${esc(o.phone)}"></div>
      </div>
      <label>Адрес</label><input name="address" value="${esc(o.address)}">
      <label>Комментарий</label><textarea name="comment">${esc(o.comment)}</textarea>
      <button class="btn block">Сохранить изменения</button>
    </form>`, (root) => {
    $("#edit-order", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = formData(e.target);
      const newItems = items
        .map((i, n) => ({ product_id: i.product_id, quantity: Number(data[`q${n}`]) }))
        .filter((i) => i.quantity > 0);
      if (!newItems.length) { toast("В заказе должна остаться хотя бы одна позиция — или отмените его", true); return; }
      try {
        await api(`/orders/${o.id}`, {
          method: "PUT",
          body: { items: newItems, delivery: data.delivery, customer_name: data.customer_name, phone: data.phone, address: data.address, comment: data.comment },
        });
        closeModal();
        toast("Заказ обновлён");
        pageOrders();
      } catch (err) { toast(err.message, true); }
    });
  });
}

// ---------- profile ----------
function pageProfile() {
  const me = state.me;
  app.innerHTML = `
    <div class="container"><div class="card form-card" style="max-width:560px">
      <div class="eyebrow">${me.role === "admin" ? "Пасечник" : "Покупатель"} · с ${fmtDate(me.created_at)}</div>
      <h1>${esc(me.full_name || me.username)}</h1>
      <p class="muted">Эти данные подставляются при оформлении заказа.</p>
      <form id="profile-form">
        <label>Имя</label><input name="full_name" value="${esc(me.full_name)}">
        <div class="form-row">
          <div><label>Email</label><input name="email" type="email" value="${esc(me.email)}"></div>
          <div><label>Телефон</label><input name="phone" value="${esc(me.phone)}"></div>
        </div>
        <label>Адрес доставки</label><input name="address" value="${esc(me.address)}">
        <label>Новый пароль (необязательно)</label><input name="password" type="password" minlength="6" autocomplete="new-password">
        <button class="btn block">Сохранить</button>
      </form>
    </div></div>`;
  $("#profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    if (!data.password) delete data.password;
    try {
      state.me = await api("/auth/me", { method: "PATCH", body: data });
      toast("Профиль сохранён");
      renderNav();
    } catch (err) { toast(err.message, true); }
  });
}

// ---------- admin ----------
async function pageAdmin() {
  const nav = state.nav;
  const s = await api("/admin/stats");
  if (stale(nav)) return;
  app.innerHTML = `
    <div class="container">
      <div class="eyebrow">Панель пасечника</div>
      <h1>Управление магазином</h1>
      <div class="stats">
        <div class="stat"><b>${money(s.revenue)}</b><span>выручка (без отменённых)</span></div>
        <div class="stat"><b>${s.honey_sold_kg} кг</b><span>мёда продано</span></div>
        <div class="stat"><b>${s.orders}</b><span>заказов · новых: ${s.orders_by_status.new || 0}</span></div>
        <div class="stat"><b>${s.products}</b><span>товаров в каталоге</span></div>
        <div class="stat"><b>${s.users}</b><span>покупателей</span></div>
      </div>
      ${s.low_stock.length ? `<div class="hint">⚠️ Заканчивается: ${s.low_stock.map((p) => `${esc(p.name)} (${p.stock})`).join(", ")}</div>` : ""}
      ${s.top_products.length ? `<p class="muted">Хиты продаж: ${s.top_products.map((p) => `${esc(p.name)} — ${p.quantity} шт.`).join(" · ")}</p>` : ""}
      <div class="tabs">
        <button class="chip active" data-tab="orders">Заказы</button>
        <button class="chip" data-tab="products">Товары</button>
        <button class="chip" data-tab="users">Пользователи</button>
      </div>
      <div id="admin-body"></div>
    </div>`;
  const tabs = { orders: adminOrders, products: adminProducts, users: adminUsers };
  $$("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    $$("[data-tab]").forEach((x) => x.classList.toggle("active", x === b));
    tabs[b.dataset.tab]();
  }));
  await adminOrders();
}

async function adminOrders() {
  const orders = await api("/orders");
  const body = $("#admin-body");
  if (!orders.length) { body.innerHTML = `<div class="empty">Заказов пока нет</div>`; return; }
  body.innerHTML = `<div class="table-wrap"><table>
    <tr><th>№</th><th>Дата</th><th>Покупатель</th><th>Состав</th><th>Доставка</th><th>Сумма</th><th>Статус</th><th></th></tr>
    ${orders.map((o) => `<tr>
      <td><b>${o.id}</b></td><td>${fmtDate(o.created_at)}</td>
      <td>${esc(o.customer_name)}<br><small class="muted">${esc(o.phone)} · ${esc(o.username)}</small></td>
      <td>${o.items.map((i) => `${esc(i.product_name)} × ${i.quantity}`).join("<br>")}</td>
      <td>${DELIVERY[o.delivery].title}<br><small class="muted">${esc(o.address)}</small></td>
      <td><b>${money(o.total)}</b></td>
      <td>${ADMIN_NEXT[o.status].length
        ? `<select data-status="${o.id}"><option value="">${STATUSES[o.status]}</option>${ADMIN_NEXT[o.status].map((s) => `<option value="${s}">→ ${STATUSES[s]}</option>`).join("")}</select>`
        : `<span class="badge ${o.status === "cancelled" ? "red" : "green"}">${STATUSES[o.status]}</span>`}</td>
      <td><button class="btn danger small" data-del="${o.id}">Удалить</button></td></tr>`).join("")}
  </table></div>`;
  $$("[data-status]", body).forEach((sel) => sel.addEventListener("change", async () => {
    if (!sel.value) return;
    try { await api(`/orders/${sel.dataset.status}`, { method: "PUT", body: { status: sel.value } }); toast(`Заказ №${sel.dataset.status}: ${STATUSES[sel.value]}`); } catch (err) { toast(err.message, true); }
    pageAdmin();
  }));
  $$("[data-del]", body).forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Удалить заказ? Если он не отправлен, мёд вернётся на склад.")) return;
    try { await api(`/orders/${b.dataset.del}`, { method: "DELETE" }); toast("Заказ удалён"); } catch (err) { toast(err.message, true); }
    pageAdmin();
  }));
}

async function adminProducts() {
  const products = await api("/products?include_inactive=true");
  const body = $("#admin-body");
  body.innerHTML = `
    <p><button class="btn" id="add-product">+ Добавить товар</button></p>
    <div class="table-wrap"><table>
      <tr><th>Товар</th><th>Сорт</th><th>Вес</th><th>Цена</th><th>Остаток</th><th>Витрина</th><th></th></tr>
      ${products.map((p) => `<tr>
        <td><span class="swatch" style="background:${p.color}"></span><b>${esc(p.name)}</b></td>
        <td>${esc(p.variety)}</td><td>${weight(p.weight_g)}</td><td>${money(p.price)}</td>
        <td>${p.stock < 5 ? `<span class="badge red">${p.stock}</span>` : p.stock}</td>
        <td>${p.is_active ? '<span class="badge green">показан</span>' : '<span class="badge gray">скрыт</span>'}</td>
        <td class="actions" style="margin:0"><button class="btn light small" data-edit="${p.id}">Изменить</button>
          <button class="btn danger small" data-del="${p.id}">Удалить</button></td></tr>`).join("")}
    </table></div>`;
  $("#add-product").addEventListener("click", () => productForm(null));
  $$("[data-edit]", body).forEach((b) => b.addEventListener("click", () => productForm(products.find((p) => p.id === Number(b.dataset.edit)))));
  $$("[data-del]", body).forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Удалить товар? В старых заказах он останется под своим названием.")) return;
    try { await api(`/products/${b.dataset.del}`, { method: "DELETE" }); toast("Товар удалён"); } catch (err) { toast(err.message, true); }
    adminProducts();
  }));
}

function productForm(p) {
  const v = p || { name: "", variety: "Луговой", description: "", taste: "", color: "#E9A23B", weight_g: 1000, price: 5000, stock: 10, harvest_year: 2026, altitude_m: 1000, sweetness: 3, intensity: 3, is_active: true };
  const num = (name, label, min, max) => `<div><label>${label}</label><input type="number" name="${name}" min="${min}" max="${max}" value="${v[name]}" required></div>`;
  openModal(`
    <h2>${p ? "Редактировать товар" : "Новый товар"}</h2>
    <form id="product-form">
      <div class="form-row">
        <div><label>Название</label><input name="name" required minlength="2" value="${esc(v.name)}"></div>
        <div><label>Сорт</label><input name="variety" required list="varieties" value="${esc(v.variety)}">
          <datalist id="varieties"><option>Горный</option><option>Луговой</option><option>Соты</option><option>Продукты пчеловодства</option></datalist></div>
      </div>
      <label>Вкус (коротко)</label><input name="taste" value="${esc(v.taste)}">
      <label>Описание</label><textarea name="description">${esc(v.description)}</textarea>
      <div class="form-row">
        ${num("price", "Цена, ₸", 1, 1000000)}${num("stock", "Остаток, шт.", 0, 100000)}
        ${num("weight_g", "Вес, г", 10, 10000)}${num("altitude_m", "Высота пасеки, м", 0, 5000)}
        ${num("sweetness", "Сладость 1–5", 1, 5)}${num("intensity", "Яркость 1–5", 1, 5)}
        ${num("harvest_year", "Год сбора", 2000, 2100)}
        <div><label>Цвет мёда</label><input type="color" name="color" value="${v.color}" style="height:46px;padding:4px"></div>
      </div>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="is_active" ${v.is_active ? "checked" : ""} style="width:auto"> Показывать в каталоге</label>
      <button class="btn block">${p ? "Сохранить" : "Добавить"}</button>
    </form>`, (root) => {
    $("#product-form", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = formData(e.target);
      for (const k of ["price", "stock", "weight_g", "altitude_m", "sweetness", "intensity", "harvest_year"]) data[k] = Number(data[k]);
      data.is_active = e.target.is_active.checked;
      try {
        await api(p ? `/products/${p.id}` : "/products", { method: p ? "PUT" : "POST", body: data });
        closeModal();
        toast(p ? "Товар обновлён" : "Товар добавлен");
        adminProducts();
      } catch (err) { toast(err.message, true); }
    });
  });
}

async function adminUsers() {
  const users = await api("/admin/users");
  const body = $("#admin-body");
  body.innerHTML = `<div class="table-wrap"><table>
    <tr><th>ID</th><th>Логин</th><th>Имя</th><th>Email</th><th>Роль</th><th>Статус</th><th></th></tr>
    ${users.map((u) => `<tr>
      <td>${u.id}</td><td><b>${esc(u.username)}</b></td><td>${esc(u.full_name)}</td><td>${esc(u.email)}</td>
      <td><select data-role="${u.id}"><option value="user" ${u.role === "user" ? "selected" : ""}>покупатель</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>пасечник</option></select></td>
      <td>${u.is_active ? '<span class="badge green">активен</span>' : '<span class="badge red">заблокирован</span>'}</td>
      <td class="actions" style="margin:0"><button class="btn light small" data-block="${u.id}" data-active="${u.is_active}">${u.is_active ? "Заблокировать" : "Разблокировать"}</button>
        <button class="btn danger small" data-del="${u.id}">Удалить</button></td></tr>`).join("")}
  </table></div>`;
  const patch = async (id, payload) => {
    try { await api(`/admin/users/${id}`, { method: "PATCH", body: payload }); toast("Пользователь обновлён"); } catch (err) { toast(err.message, true); }
    adminUsers();
  };
  $$("[data-role]", body).forEach((el) => el.addEventListener("change", () => patch(el.dataset.role, { role: el.value })));
  $$("[data-block]", body).forEach((el) => el.addEventListener("click", () => patch(el.dataset.block, { is_active: el.dataset.active !== "true" })));
  $$("[data-del]", body).forEach((el) => el.addEventListener("click", async () => {
    if (!confirm("Удалить пользователя вместе с его заказами?")) return;
    try { await api(`/admin/users/${el.dataset.del}`, { method: "DELETE" }); toast("Пользователь удалён"); } catch (err) { toast(err.message, true); }
    adminUsers();
  }));
}

// ---------- boot ----------
window.addEventListener("hashchange", router);
Promise.all([
  loadMe(),
  api("/settings").then((s) => { state.settings = s; }).catch(() => {}),
]).then(router);
