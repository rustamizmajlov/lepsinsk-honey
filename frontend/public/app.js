// SkillSwap SPA — vanilla JS, hash routing, JWT in localStorage
const state = { token: localStorage.getItem("token"), me: null };

const LEVELS = { beginner: "Начальный", intermediate: "Средний", expert: "Эксперт" };
const FORMATS = { online: "Онлайн", offline: "Офлайн", both: "Онлайн / офлайн" };
const STATUSES = {
  pending: "Ожидает", accepted: "Принята", rejected: "Отклонена",
  completed: "Завершена", cancelled: "Отменена",
};

const $ = (sel, root = document) => root.querySelector(sel);
const app = $("#app");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function fmtDate(value) {
  return value ? new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

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
  if (res.status === 401 && state.token) {
    logout(false);
  }
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

function logout(redirect = true) {
  state.token = null;
  state.me = null;
  localStorage.removeItem("token");
  renderNav();
  if (redirect) location.hash = "#/";
}

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

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// ---------- navigation ----------
function renderNav() {
  const me = state.me;
  const route = location.hash || "#/";
  const link = (href, text) => `<a href="${href}" class="${route === href ? "active" : ""}">${text}</a>`;
  let html = link("#/", "Каталог");
  if (me) {
    html += link("#/my-skills", "Мои навыки") + link("#/swaps", "Заявки") + link("#/profile", "Профиль");
    if (me.role === "admin") html += link("#/admin", "Админка");
    html += `<span class="credits" title="Тайм-кредиты">⏱ ${me.credits} ч</span>`;
    html += `<a href="#" id="logout">Выйти (${esc(me.username)})</a>`;
  } else {
    html += link("#/login", "Войти") + link("#/register", "Регистрация");
  }
  $("#nav").innerHTML = html;
  $("#logout")?.addEventListener("click", (e) => { e.preventDefault(); logout(); });
}

const routes = {
  "#/": pageCatalog,
  "#/login": pageLogin,
  "#/register": pageRegister,
  "#/my-skills": pageMySkills,
  "#/swaps": pageSwaps,
  "#/profile": pageProfile,
  "#/admin": pageAdmin,
};
const PRIVATE = ["#/my-skills", "#/swaps", "#/profile", "#/admin"];

async function router() {
  const route = location.hash || "#/";
  if (PRIVATE.includes(route) && !state.me) { location.hash = "#/login"; return; }
  if (route === "#/admin" && state.me?.role !== "admin") { location.hash = "#/"; return; }
  renderNav();
  closeModal();
  try {
    await (routes[route] || pageCatalog)();
  } catch (err) {
    app.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

async function refreshMe() {
  await loadMe();
  renderNav();
}

// ---------- catalog ----------
function skillCard(s, { mine = false } = {}) {
  const me = state.me;
  let actions = "";
  if (mine || me?.role === "admin") {
    actions += `<button class="btn secondary" data-edit="${s.id}">Изменить</button>
                <button class="btn danger" data-delete="${s.id}">Удалить</button>`;
  }
  if (!mine && me && s.owner.id !== me.id) {
    actions += `<button class="btn" data-request="${s.id}">Записаться</button>`;
  }
  if (!me) actions += `<a class="btn secondary" href="#/login">Войдите, чтобы записаться</a>`;
  return `
    <div class="card">
      <div class="meta">
        <span class="badge">${esc(s.category)}</span>
        <span class="badge gray">${LEVELS[s.level]}</span>
        <span class="badge gray">${FORMATS[s.format]}</span>
        ${s.is_active ? "" : '<span class="badge cancelled">Скрыт</span>'}
      </div>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.description) || "Без описания"}</p>
      <p>👤 ${esc(s.owner.username)} · ⏱ ${s.hours_cost} кредит(а) за час</p>
      <div class="actions">${actions}</div>
    </div>`;
}

async function pageCatalog() {
  const categories = await api("/skills/categories");
  app.innerHTML = `
    <section class="hero">
      <h1>Учите и учитесь — без денег</h1>
      <p>SkillSwap — банк времени. Проведите час занятия по своему навыку и получите тайм-кредит,
         который можно потратить на обучение у другого участника.</p>
    </section>
    <div class="toolbar">
      <input id="q" placeholder="Поиск: python, гитара, английский…">
      <select id="category"><option value="">Все категории</option>
        ${categories.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
      <select id="level"><option value="">Любой уровень</option>
        ${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <select id="format"><option value="">Любой формат</option>
        <option value="online">Онлайн</option><option value="offline">Офлайн</option></select>
    </div>
    <div id="list" class="grid"></div>`;

  const load = async () => {
    const params = new URLSearchParams();
    for (const id of ["q", "category", "level", "format"]) {
      const v = $("#" + id).value.trim();
      if (v) params.set(id, v);
    }
    const skills = await api(`/skills?${params}`);
    $("#list").innerHTML = skills.length
      ? skills.map((s) => skillCard(s)).join("")
      : `<div class="empty">Ничего не найдено</div>`;
    bindSkillActions($("#list"), skills, load);
  };
  let timer;
  $("#q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  for (const id of ["category", "level", "format"]) $("#" + id).addEventListener("change", load);
  await load();
}

function bindSkillActions(root, skills, reload) {
  const byId = (id) => skills.find((s) => s.id === Number(id));
  root.querySelectorAll("[data-request]").forEach((b) =>
    b.addEventListener("click", () => openSwapForm(byId(b.dataset.request))));
  root.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => openSkillForm(byId(b.dataset.edit), reload)));
  root.querySelectorAll("[data-delete]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Удалить навык? Связанные заявки тоже будут удалены.")) return;
      try {
        await api(`/skills/${b.dataset.delete}`, { method: "DELETE" });
        toast("Навык удалён");
        reload();
      } catch (err) { toast(err.message, true); }
    }));
}

// ---------- skill form (create / update) ----------
function openSkillForm(skill, onSaved) {
  const s = skill || { title: "", description: "", category: "", level: "beginner", format: "online", hours_cost: 1, is_active: true };
  const opts = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${v}</option>`).join("");
  openModal(`
    <h2>${skill ? "Редактировать навык" : "Новый навык"}</h2>
    <form id="skill-form">
      <label>Название</label><input name="title" required minlength="3" value="${esc(s.title)}">
      <label>Категория</label><input name="category" required minlength="2" value="${esc(s.category)}" placeholder="IT, Языки, Музыка…">
      <label>Описание</label><textarea name="description">${esc(s.description)}</textarea>
      <label>Уровень</label><select name="level">${opts(LEVELS, s.level)}</select>
      <label>Формат</label><select name="format">${opts(FORMATS, s.format)}</select>
      <label>Стоимость часа (кредиты, 1–5)</label><input name="hours_cost" type="number" min="1" max="5" value="${s.hours_cost}">
      ${skill ? `<label><input type="checkbox" name="is_active" ${s.is_active ? "checked" : ""} style="width:auto"> Показывать в каталоге</label>` : ""}
      <button class="btn block">${skill ? "Сохранить" : "Опубликовать"}</button>
    </form>`, (root) => {
    $("#skill-form", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = formData(e.target);
      data.hours_cost = Number(data.hours_cost);
      if (skill) data.is_active = e.target.is_active.checked;
      try {
        await api(skill ? `/skills/${skill.id}` : "/skills", { method: skill ? "PUT" : "POST", body: data });
        closeModal();
        toast(skill ? "Навык обновлён" : "Навык опубликован");
        onSaved?.();
      } catch (err) { toast(err.message, true); }
    });
  });
}

// ---------- swap form (create / update) ----------
function openSwapForm(skill, swap, onSaved) {
  const sk = skill || swap.skill;
  const scheduled = swap?.scheduled_at ? swap.scheduled_at.slice(0, 16) : "";
  openModal(`
    <h2>${swap ? "Изменить заявку" : "Заявка на обучение"}</h2>
    <p class="subtitle">«${esc(sk.title)}» у ${esc(sk.owner.username)} · ${sk.hours_cost} кредит(а)/час</p>
    <form id="swap-form">
      <label>Сколько часов</label><input name="hours" type="number" min="1" max="20" value="${swap?.hours ?? 1}">
      <label>Желаемое время</label><input name="scheduled_at" type="datetime-local" value="${scheduled}">
      <label>Сообщение преподавателю</label><textarea name="message" placeholder="Расскажите о своих целях">${esc(swap?.message ?? "")}</textarea>
      <button class="btn block">${swap ? "Сохранить" : "Отправить заявку"}</button>
    </form>`, (root) => {
    $("#swap-form", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = formData(e.target);
      const body = { hours: Number(data.hours), message: data.message, scheduled_at: data.scheduled_at || null };
      try {
        if (swap) await api(`/swaps/${swap.id}`, { method: "PUT", body });
        else await api("/swaps", { method: "POST", body: { ...body, skill_id: sk.id } });
        closeModal();
        toast(swap ? "Заявка обновлена" : "Заявка отправлена");
        onSaved?.();
      } catch (err) { toast(err.message, true); }
    });
  });
}

// ---------- auth pages ----------
function pageLogin() {
  app.innerHTML = `
    <div class="card form-card">
      <h1>Вход</h1>
      <form id="login-form">
        <label>Логин</label><input name="username" required autocomplete="username">
        <label>Пароль</label><input name="password" type="password" required autocomplete="current-password">
        <button class="btn block">Войти</button>
      </form>
      <p>Нет аккаунта? <a href="#/register">Зарегистрируйтесь</a></p>
    </div>`;
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const { access_token } = await api("/auth/login", { method: "POST", body: formData(e.target) });
      state.token = access_token;
      localStorage.setItem("token", access_token);
      await loadMe();
      toast(`Добро пожаловать, ${state.me.username}!`);
      location.hash = "#/";
    } catch (err) { toast(err.message, true); }
  });
}

function pageRegister() {
  app.innerHTML = `
    <div class="card form-card">
      <h1>Регистрация</h1>
      <p class="subtitle">Новым участникам начисляется 3 стартовых тайм-кредита</p>
      <form id="reg-form">
        <label>Логин</label><input name="username" required minlength="3" pattern="[A-Za-z0-9_.\\-]+" title="Латиница, цифры, _ . -">
        <label>Email</label><input name="email" type="email" required>
        <label>Пароль</label><input name="password" type="password" required minlength="6">
        <button class="btn block">Создать аккаунт</button>
      </form>
      <p>Уже есть аккаунт? <a href="#/login">Войти</a></p>
    </div>`;
  $("#reg-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    try {
      await api("/auth/register", { method: "POST", body: data });
      const { access_token } = await api("/auth/login", { method: "POST", body: { username: data.username, password: data.password } });
      state.token = access_token;
      localStorage.setItem("token", access_token);
      await loadMe();
      toast("Аккаунт создан!");
      location.hash = "#/my-skills";
    } catch (err) { toast(err.message, true); }
  });
}

// ---------- my skills ----------
async function pageMySkills() {
  app.innerHTML = `
    <h1>Мои навыки</h1>
    <p class="subtitle">То, чему вы готовы научить других</p>
    <div class="toolbar"><button class="btn" id="add-skill">+ Добавить навык</button></div>
    <div id="list" class="grid"></div>`;
  const load = async () => {
    const skills = await api(`/skills?owner_id=${state.me.id}&include_inactive=true`);
    $("#list").innerHTML = skills.length
      ? skills.map((s) => skillCard(s, { mine: true })).join("")
      : `<div class="empty">Вы ещё не добавили ни одного навыка</div>`;
    bindSkillActions($("#list"), skills, load);
  };
  $("#add-skill").addEventListener("click", () => openSkillForm(null, load));
  await load();
}

// ---------- swaps ----------
async function pageSwaps() {
  let box = "incoming";
  app.innerHTML = `
    <h1>Заявки на обмен</h1>
    <p class="subtitle">Завершённое занятие переводит кредиты от ученика к преподавателю</p>
    <div class="tabs">
      <button data-box="incoming" class="active">Входящие (я учу)</button>
      <button data-box="outgoing">Исходящие (я учусь)</button>
    </div>
    <div id="list"></div>`;

  const load = async () => {
    const swaps = await api(`/swaps?box=${box}`);
    const list = $("#list");
    if (!swaps.length) { list.innerHTML = `<div class="empty">Заявок пока нет</div>`; return; }
    list.innerHTML = `<div class="grid">${swaps.map((s) => swapCard(s, box)).join("")}</div>`;
    list.querySelectorAll("[data-status]").forEach((b) => b.addEventListener("click", async () => {
      try {
        await api(`/swaps/${b.dataset.id}`, { method: "PUT", body: { status: b.dataset.status } });
        toast("Статус обновлён");
        await refreshMe();
        load();
      } catch (err) { toast(err.message, true); }
    }));
    list.querySelectorAll("[data-edit-swap]").forEach((b) => b.addEventListener("click", () =>
      openSwapForm(null, swaps.find((s) => s.id === Number(b.dataset.editSwap)), load)));
    list.querySelectorAll("[data-del-swap]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Удалить заявку?")) return;
      try {
        await api(`/swaps/${b.dataset.delSwap}`, { method: "DELETE" });
        toast("Заявка удалена");
        load();
      } catch (err) { toast(err.message, true); }
    }));
  };

  app.querySelectorAll("[data-box]").forEach((b) => b.addEventListener("click", () => {
    box = b.dataset.box;
    app.querySelectorAll("[data-box]").forEach((x) => x.classList.toggle("active", x === b));
    load();
  }));
  await load();
}

function swapCard(s, box) {
  const btn = (status, text, cls = "secondary") =>
    `<button class="btn ${cls}" data-id="${s.id}" data-status="${status}">${text}</button>`;
  let actions = "";
  if (box === "incoming") {
    if (s.status === "pending") actions += btn("accepted", "Принять", "success") + btn("rejected", "Отклонить", "danger");
  } else {
    if (s.status === "pending") actions += `<button class="btn secondary" data-edit-swap="${s.id}">Изменить</button>` + btn("cancelled", "Отменить", "danger");
    if (["pending", "rejected", "cancelled"].includes(s.status)) actions += `<button class="btn danger" data-del-swap="${s.id}">Удалить</button>`;
  }
  if (s.status === "accepted") actions += btn("completed", "Занятие проведено", "success") + btn("cancelled", "Отменить", "danger");
  const who = box === "incoming" ? `Ученик: ${esc(s.requester.username)}` : `Преподаватель: ${esc(s.skill.owner.username)}`;
  return `
    <div class="card">
      <div class="meta"><span class="badge ${s.status}">${STATUSES[s.status]}</span><span class="badge gray">#${s.id}</span></div>
      <h3>${esc(s.skill.title)}</h3>
      <p>${who}</p>
      <p>⏱ ${s.hours} ч · стоимость ${s.total_cost} кредит(а)</p>
      <p>📅 ${fmtDate(s.scheduled_at)}</p>
      ${s.message ? `<p>💬 ${esc(s.message)}</p>` : ""}
      <div class="actions">${actions}</div>
    </div>`;
}

// ---------- profile ----------
function pageProfile() {
  const me = state.me;
  app.innerHTML = `
    <div class="card form-card">
      <h1>${esc(me.username)}</h1>
      <p class="subtitle">${me.role === "admin" ? "Администратор" : "Участник"} · баланс ${me.credits} кредит(а) · с ${fmtDate(me.created_at)}</p>
      <form id="profile-form">
        <label>Email</label><input name="email" type="email" value="${esc(me.email)}">
        <label>О себе</label><textarea name="bio">${esc(me.bio)}</textarea>
        <label>Новый пароль (необязательно)</label><input name="password" type="password" minlength="6" autocomplete="new-password">
        <button class="btn block">Сохранить</button>
      </form>
    </div>`;
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
  const stats = await api("/admin/stats");
  app.innerHTML = `
    <h1>Панель администратора</h1>
    <div class="stats">
      <div class="stat"><b>${stats.users}</b><span>пользователей</span></div>
      <div class="stat"><b>${stats.skills}</b><span>навыков</span></div>
      <div class="stat"><b>${stats.swaps}</b><span>заявок</span></div>
      <div class="stat"><b>${stats.completed_swaps}</b><span>завершённых обменов</span></div>
      <div class="stat"><b>${stats.hours_exchanged}</b><span>часов обучения</span></div>
    </div>
    <div class="tabs">
      <button data-tab="users" class="active">Пользователи</button>
      <button data-tab="skills">Навыки</button>
      <button data-tab="swaps">Заявки</button>
    </div>
    <div id="admin-body" class="table-wrap"></div>`;

  const tabs = { users: adminUsers, skills: adminSkills, swaps: adminSwaps };
  app.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    app.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("active", x === b));
    tabs[b.dataset.tab]();
  }));
  await adminUsers();
}

async function adminUsers() {
  const users = await api("/admin/users");
  const body = $("#admin-body");
  body.innerHTML = `<table>
    <tr><th>ID</th><th>Логин</th><th>Email</th><th>Роль</th><th>Кредиты</th><th>Статус</th><th></th></tr>
    ${users.map((u) => `<tr>
      <td>${u.id}</td><td>${esc(u.username)}</td><td>${esc(u.email)}</td>
      <td><select data-role="${u.id}">
        <option value="user" ${u.role === "user" ? "selected" : ""}>user</option>
        <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option></select></td>
      <td><input type="number" min="0" value="${u.credits}" data-credits="${u.id}" style="width:80px"></td>
      <td>${u.is_active ? '<span class="badge completed">активен</span>' : '<span class="badge rejected">заблокирован</span>'}</td>
      <td class="actions">
        <button class="btn secondary" data-block="${u.id}" data-active="${u.is_active}">${u.is_active ? "Заблокировать" : "Разблокировать"}</button>
        <button class="btn danger" data-del-user="${u.id}">Удалить</button>
      </td></tr>`).join("")}
  </table>`;

  const patch = async (id, payload) => {
    try {
      await api(`/admin/users/${id}`, { method: "PATCH", body: payload });
      toast("Пользователь обновлён");
    } catch (err) { toast(err.message, true); }
    adminUsers();
  };
  body.querySelectorAll("[data-role]").forEach((el) => el.addEventListener("change", () => patch(el.dataset.role, { role: el.value })));
  body.querySelectorAll("[data-credits]").forEach((el) => el.addEventListener("change", () => patch(el.dataset.credits, { credits: Number(el.value) })));
  body.querySelectorAll("[data-block]").forEach((el) => el.addEventListener("click", () => patch(el.dataset.block, { is_active: el.dataset.active !== "true" })));
  body.querySelectorAll("[data-del-user]").forEach((el) => el.addEventListener("click", async () => {
    if (!confirm("Удалить пользователя вместе с его навыками и заявками?")) return;
    try {
      await api(`/admin/users/${el.dataset.delUser}`, { method: "DELETE" });
      toast("Пользователь удалён");
    } catch (err) { toast(err.message, true); }
    adminUsers();
  }));
}

async function adminSkills() {
  const skills = await api("/skills?include_inactive=true&limit=200");
  const body = $("#admin-body");
  body.innerHTML = `<table>
    <tr><th>ID</th><th>Название</th><th>Категория</th><th>Владелец</th><th>Видимость</th><th></th></tr>
    ${skills.map((s) => `<tr>
      <td>${s.id}</td><td>${esc(s.title)}</td><td>${esc(s.category)}</td><td>${esc(s.owner.username)}</td>
      <td>${s.is_active ? "в каталоге" : "скрыт"}</td>
      <td class="actions"><button class="btn secondary" data-edit="${s.id}">Изменить</button>
        <button class="btn danger" data-delete="${s.id}">Удалить</button></td></tr>`).join("")}
  </table>`;
  bindSkillActions(body, skills, adminSkills);
}

async function adminSwaps() {
  const swaps = await api("/swaps");
  const body = $("#admin-body");
  body.innerHTML = `<table>
    <tr><th>ID</th><th>Навык</th><th>Ученик</th><th>Преподаватель</th><th>Часы</th><th>Статус</th><th></th></tr>
    ${swaps.map((s) => `<tr>
      <td>${s.id}</td><td>${esc(s.skill.title)}</td><td>${esc(s.requester.username)}</td><td>${esc(s.skill.owner.username)}</td>
      <td>${s.hours}</td><td><span class="badge ${s.status}">${STATUSES[s.status]}</span></td>
      <td><button class="btn danger" data-del-swap="${s.id}">Удалить</button></td></tr>`).join("")}
  </table>`;
  body.querySelectorAll("[data-del-swap]").forEach((el) => el.addEventListener("click", async () => {
    if (!confirm("Удалить заявку?")) return;
    try {
      await api(`/swaps/${el.dataset.delSwap}`, { method: "DELETE" });
      toast("Заявка удалена");
    } catch (err) { toast(err.message, true); }
    adminSwaps();
  }));
}

// ---------- boot ----------
window.addEventListener("hashchange", router);
loadMe().then(router);
