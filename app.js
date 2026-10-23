/* مثمر — مساحة شخصية لإدارة المهام والأولويات (RTL, localStorage) */
(function () {
  "use strict";

  /* ---------- ثوابت وهوية ---------- */
  const KEYS = {
    users: "muthmir:users:v1",
    session: "muthmir:session:v1",
    data: "muthmir:data:v1:"
  };

  const DEMO = {
    email: "demo@muthmir.app",
    password: "Muthmir2026!",
    name: "ريم العتيبي"
  };

  const PRIORITIES = {
    high: { label: "عالية", hint: "ابدأ بها", rank: 0 },
    medium: { label: "متوسطة", hint: "خطوة مهمة", rank: 1 },
    low: { label: "منخفضة", hint: "لاحقًا", rank: 2 }
  };

  const CATEGORIES = {
    work: { label: "العمل", icon: "briefcase" },
    personal: { label: "شخصي", icon: "user" },
    health: { label: "الصحة", icon: "heart" },
    learning: { label: "تعلّم", icon: "book" },
    home: { label: "المنزل", icon: "home" },
    other: { label: "أخرى", icon: "tag" }
  };

  const REMINDER_OPTIONS = [
    { value: "", label: "بدون تذكير" },
    { value: "0", label: "في موعد الاستحقاق" },
    { value: "10", label: "قبل 10 دقائق" },
    { value: "30", label: "قبل 30 دقيقة" },
    { value: "60", label: "قبل ساعة" },
    { value: "1440", label: "قبل يوم" }
  ];

  const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const MONTHS_SHORT = ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"];
  const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const WEEKDAYS_SHORT = ["أحد", "اثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.prototype.slice.call((root || document).querySelectorAll(selector));
  const icon = (name, cls) => '<svg class="' + (cls || "") + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const state = {
    authMode: "login",
    authBusy: false,
    user: null,
    data: null,
    view: "today",
    search: "",
    priority: "all",
    category: "all",
    sort: "priority"
  };

  let els = {};
  let reminderTimer = null;
  let pendingTaskRender = null;
  let lastKnownDay = "";
  let activeModal = null;

  /* ---------- أدوات عامة ---------- */
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(value));
  }

  function uid(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return (prefix || "id") + "_" + window.crypto.randomUUID();
    }
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function firstName(name) {
    const clean = String(name || "").trim();
    return clean.split(/\s+/)[0] || "صديقنا";
  }

  function initialOf(name) {
    const chars = Array.from(String(name || "").trim());
    return chars.length ? chars[0] : "؟";
  }

  function avatarStyle(name) {
    const palettes = [
      ["linear-gradient(145deg, #e1c47d, #b68b3f)", "#2a200b"],
      ["linear-gradient(145deg, #c9e0d4, #8fb6a1)", "#14352a"],
      ["linear-gradient(145deg, #ebcdbf, #c39380)", "#3d251c"],
      ["linear-gradient(145deg, #cedde2, #94b2bb)", "#17333c"],
      ["linear-gradient(145deg, #d8d2e6, #aaa0c3)", "#2b2440"]
    ];
    let hash = 0;
    const chars = Array.from(String(name || "م"));
    for (let i = 0; i < chars.length; i++) hash = (hash * 31 + chars[i].charCodeAt(0)) >>> 0;
    return palettes[hash % palettes.length];
  }

  function pad2(number) {
    return String(number).padStart(2, "0");
  }

  function todayKey() {
    const now = new Date();
    return now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());
  }

  function dateFromKey(key) {
    if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const parts = key.split("-").map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isValidDateKey(key) {
    return /^\d{4}-\d{2}-\d{2}$/.test(key) && dateFromKey(key) !== null;
  }

  function addDays(key, amount) {
    const date = dateFromKey(key) || new Date();
    date.setDate(date.getDate() + amount);
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function dayDiff(fromKey, toKey) {
    const a = dateFromKey(fromKey);
    const b = dateFromKey(toKey);
    if (!a || !b) return 0;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function formatDateLong(key) {
    const date = dateFromKey(key);
    if (!date) return "—";
    return WEEKDAYS[date.getDay()] + "، " + date.getDate() + " " + MONTHS[date.getMonth()] + " " + date.getFullYear();
  }

  function formatDateShort(key) {
    const date = dateFromKey(key);
    if (!date) return "—";
    return date.getDate() + " " + MONTHS[date.getMonth()];
  }

  function formatDayLabel(key) {
    const date = dateFromKey(key);
    if (!date) return "—";
    const diff = dayDiff(todayKey(), key);
    if (diff === 0) return "اليوم";
    if (diff === 1) return "غدًا";
    if (diff === 2) return "بعد غد";
    if (diff === -1) return "أمس";
    if (diff > 2 && diff < 7) return WEEKDAYS[date.getDay()];
    return date.getDate() + " " + MONTHS[date.getMonth()];
  }

  function formatTime(value) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return "";
    const parts = value.split(":").map(Number);
    let hours = parts[0];
    const minutes = parts[1];
    const suffix = hours >= 12 ? "م" : "ص";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return hours + ":" + pad2(minutes) + " " + suffix;
  }

  function formatReminderShort(value) {
    if (value === "0") return "عند الموعد";
    if (value === "10") return "قبل 10 د";
    if (value === "30") return "قبل 30 د";
    if (value === "60") return "قبل ساعة";
    if (value === "1440") return "قبل يوم";
    return "";
  }

  function reminderFullLabel(value) {
    const found = REMINDER_OPTIONS.find(function (option) { return option.value === String(value); });
    return found ? found.label : "بدون تذكير";
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "صباح الخير";
    if (hour < 17) return "مساء النور";
    return "مساء الخير";
  }

  function formatTodayHeadline() {
    const key = todayKey();
    const date = dateFromKey(key);
    return WEEKDAYS[date.getDay()] + "، " + date.getDate() + " " + MONTHS[date.getMonth()] + " " + date.getFullYear();
  }

  function completedDateKey(task) {
    if (!task.completedAt) return "";
    const date = new Date(task.completedAt);
    if (Number.isNaN(date.getTime())) return "";
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function isoAtDate(dateKey, hours, minutes) {
    const date = dateFromKey(dateKey) || new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toISOString();
  }

  function dueTimestamp(task) {
    if (!task.dueDate) return null;
    const date = dateFromKey(task.dueDate);
    if (!date) return null;
    if (task.dueTime && /^\d{2}:\d{2}$/.test(task.dueTime)) {
      const parts = task.dueTime.split(":").map(Number);
      date.setHours(parts[0], parts[1], 0, 0);
    } else {
      date.setHours(23, 59, 0, 0);
    }
    return date.getTime();
  }

  function reminderTimestamp(task) {
    if (!task.reminder || !task.dueDate || !task.dueTime) return null;
    const due = dueTimestamp(task);
    if (!due) return null;
    return due - Number(task.reminder) * 60000;
  }

  function dueLabel(task) {
    if (!task.dueDate) return "بدون موعد";
    const time = task.dueTime ? " · " + formatTime(task.dueTime) : "";
    return formatDayLabel(task.dueDate) + time;
  }

  function dueTone(task) {
    if (!task.dueDate || task.completed) return "";
    if (task.dueDate < todayKey()) return "is-overdue";
    if (task.dueDate === todayKey()) return "is-today";
    return "";
  }

  function plural(count, singular, dual, pluralForm) {
    if (count === 1) return singular;
    if (count === 2) return dual;
    return pluralForm;
  }

  function safeStoreGet(store, key) {
    try { return store.getItem(key); } catch (error) { return null; }
  }

  function safeStoreSet(store, key, value) {
    try { store.setItem(key, value); return true; } catch (error) { return false; }
  }

  function safeStoreRemove(store, key) {
    try { store.removeItem(key); } catch (error) { /* لا شيء */ }
  }

  /* ---------- حسابات وتخزين ---------- */
  function getUsers() {
    const raw = safeStoreGet(localStorage, KEYS.users);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveUsers(users) {
    return safeStoreSet(localStorage, KEYS.users, JSON.stringify(users));
  }

  function userDataKey(userId) {
    return KEYS.data + userId;
  }

  function createEmptyData() {
    return {
      version: 1,
      tasks: [],
      settings: { notificationsAsked: false },
      createdAt: new Date().toISOString()
    };
  }

  function normalizeData(raw) {
    const data = raw && typeof raw === "object" ? raw : {};
    return {
      version: 1,
      tasks: Array.isArray(data.tasks) ? data.tasks.filter(Boolean) : [],
      settings: data.settings && typeof data.settings === "object" ? data.settings : { notificationsAsked: false },
      createdAt: data.createdAt || new Date().toISOString()
    };
  }

  function loadUserData(userId) {
    const raw = safeStoreGet(localStorage, userDataKey(userId));
    if (!raw) {
      const fresh = createEmptyData();
      safeStoreSet(localStorage, userDataKey(userId), JSON.stringify(fresh));
      return fresh;
    }
    try {
      return normalizeData(JSON.parse(raw));
    } catch (error) {
      return createEmptyData();
    }
  }

  function persistData() {
    if (!state.user || !state.data) return false;
    const ok = safeStoreSet(localStorage, userDataKey(state.user.id), JSON.stringify(state.data));
    if (!ok) {
      toast("تعذّر حفظ البيانات. قد تكون مساحة التخزين في المتصفح ممتلئة.", { type: "error" });
    }
    return ok;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes).map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
  }

  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  }

  function randomSalt() {
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return bytesToHex(bytes);
    }
    let salt = "";
    for (let i = 0; i < 32; i++) salt += Math.floor(Math.random() * 16).toString(16);
    return salt;
  }

  function fallbackHash(value) {
    let h1 = 0x811c9dc5;
    let h2 = 0x1000193;
    for (let round = 0; round < 6000; round++) {
      for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i) + round;
        h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
        h2 = Math.imul(h2 + code, 0x85ebca6b) >>> 0;
      }
      h1 = (h1 ^ (h1 >>> 13)) >>> 0;
      h2 = (h2 ^ (h2 >>> 16)) >>> 0;
    }
    return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  }

  async function deriveHash(password, salt, algorithm) {
    const usePBKDF2 = algorithm === "pbkdf2" && window.crypto && window.crypto.subtle && window.TextEncoder;
    if (usePBKDF2) {
      try {
        const encoder = new TextEncoder();
        const key = await window.crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
        const bits = await window.crypto.subtle.deriveBits({
          name: "PBKDF2",
          salt: hexToBytes(salt),
          iterations: 140000,
          hash: "SHA-256"
        }, key, 256);
        return "pbkdf2$" + bytesToHex(new Uint8Array(bits));
      } catch (error) {
        return "fallback$" + fallbackHash(salt + "::" + password);
      }
    }
    return "fallback$" + fallbackHash(salt + "::" + password);
  }

  async function createPasswordHash(password) {
    const salt = randomSalt();
    const algorithm = window.crypto && window.crypto.subtle && window.TextEncoder ? "pbkdf2" : "fallback";
    const hash = await deriveHash(password, salt, algorithm);
    return { salt: salt, passwordHash: hash };
  }

  async function verifyPassword(password, user) {
    if (!user || !user.salt || !user.passwordHash) return false;
    const algorithm = String(user.passwordHash).split("$")[0] === "pbkdf2" ? "pbkdf2" : "fallback";
    const computed = await deriveHash(password, user.salt, algorithm);
    if (computed.length !== user.passwordHash.length) return false;
    let mismatch = 0;
    for (let i = 0; i < computed.length; i++) mismatch |= computed.charCodeAt(i) ^ user.passwordHash.charCodeAt(i);
    return mismatch === 0;
  }

  function readSession() {
    const stores = [localStorage, sessionStorage];
    for (let i = 0; i < stores.length; i++) {
      const raw = safeStoreGet(stores[i], KEYS.session);
      if (!raw) continue;
      try {
        const session = JSON.parse(raw);
        if (session && session.userId && Number(session.expiresAt) > Date.now()) {
          return { session: session, store: stores[i] };
        }
      } catch (error) { /* تجاهل الجلسة التالفة */ }
      safeStoreRemove(stores[i], KEYS.session);
    }
    return null;
  }

  function clearSessions() {
    safeStoreRemove(localStorage, KEYS.session);
    safeStoreRemove(sessionStorage, KEYS.session);
  }

  function createSession(userId, remember) {
    clearSessions();
    const session = {
      userId: userId,
      expiresAt: Date.now() + (remember ? 30 * 86400000 : 12 * 3600000),
      createdAt: Date.now()
    };
    const store = remember ? localStorage : sessionStorage;
    safeStoreSet(store, KEYS.session, JSON.stringify(session));
  }

  /* ---------- بيانات تجريبية ---------- */
  function buildDemoData() {
    const today = todayKey();
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);
    const inThreeDays = addDays(today, 3);
    const inFiveDays = addDays(today, 5);
    const now = Date.now();
    const tasks = [
      {
        id: uid("t"), title: "مراجعة عرض العميل النهائي",
        notes: "التأكد من تحديث الأسعار وإضافة ملاحظات فريق التصميم قبل الإرسال.",
        priority: "high", category: "work", dueDate: today, dueTime: "10:30",
        reminder: "", completed: false, completedAt: null,
        createdAt: new Date(now - 86400000 * 2).toISOString(), updatedAt: new Date(now - 3600000).toISOString(), order: 0
      },
      {
        id: uid("t"), title: "اجتماع فريق المنتج",
        notes: "مراجعة أولويات الربع القادم وتوزيع المهام.",
        priority: "medium", category: "work", dueDate: today, dueTime: "13:00",
        reminder: "", completed: false, completedAt: null,
        createdAt: new Date(now - 86400000 * 2).toISOString(), updatedAt: new Date(now - 86400000).toISOString(), order: 1
      },
      {
        id: uid("t"), title: "30 دقيقة قراءة",
        notes: "استكمال الفصل الثالث من كتاب العادات الذرية.",
        priority: "low", category: "learning", dueDate: today, dueTime: "20:00",
        reminder: "", completed: false, completedAt: null,
        createdAt: new Date(now - 86400000 * 4).toISOString(), updatedAt: new Date(now - 86400000 * 4).toISOString(), order: 2
      },
      {
        id: uid("t"), title: "الرد على بريد الشراكة",
        notes: "إرسال النسخة النهائية من العرض وإرفاق ملف الميزانية.",
        priority: "high", category: "work", dueDate: yesterday, dueTime: "16:00",
        reminder: "", completed: false, completedAt: null,
        createdAt: new Date(now - 86400000 * 3).toISOString(), updatedAt: new Date(now - 86400000 * 3).toISOString(), order: 3
      },
      {
        id: uid("t"), title: "الاشتراك في النادي الصحي",
        notes: "مقارنة الباقات الأسبوعية واختيار الأنسب.",
        priority: "medium", category: "health", dueDate: tomorrow, dueTime: "18:00",
        reminder: "60", completed: false, completedAt: null,
        createdAt: new Date(now - 86400000 * 2).toISOString(), updatedAt: new Date(now - 86400000 * 2).toISOString(), order: 4
      },
      {
        id: uid("t"), title: "ترتيب مكتب العمل",
        notes: "تنظيم الملفات الورقية والتخلص من الأوراق غير الضرورية.",
        priority: "low", category: "home", dueDate: "", dueTime: "",
        reminder: "", completed: false, completedAt: null,
        createdAt: new Date(now - 86400000 * 5).toISOString(), updatedAt: new Date(now - 86400000 * 5).toISOString(), order: 5
      },
      {
        id: uid("t"), title: "إعداد خطة الأسبوع",
        notes: "تحديد الأهداف الثلاثة الأهم ومراجعة التقويم.",
        priority: "high", category: "personal", dueDate: today, dueTime: "09:00",
        reminder: "", completed: true, completedAt: isoAtDate(today, 9, 10),
        createdAt: new Date(now - 86400000 * 3).toISOString(), updatedAt: isoAtDate(today, 9, 10), order: 6
      },
      {
        id: uid("t"), title: "مراجعة درس التصميم",
        notes: "تدوين الملاحظات العملية وتجربة أحد المكونات.",
        priority: "medium", category: "learning", dueDate: yesterday, dueTime: "21:00",
        reminder: "", completed: true, completedAt: isoAtDate(yesterday, 21, 35),
        createdAt: new Date(now - 86400000 * 6).toISOString(), updatedAt: isoAtDate(yesterday, 21, 35), order: 7
      },
      {
        id: uid("t"), title: "ورشة تجربة المستخدم",
        notes: "التحضير لورشة الفريق: العصف الذهني ورسم رحلة المستخدم.",
        priority: "high", category: "work", dueDate: inThreeDays, dueTime: "11:00",
        reminder: "1440", completed: false, completedAt: null,
        createdAt: new Date(now - 86400000).toISOString(), updatedAt: new Date(now - 86400000).toISOString(), order: 8
      },
      {
        id: uid("t"), title: "شراء هدية العائلة",
        notes: "اختيار هدية مناسبة للمناسبة القادمة.",
        priority: "medium", category: "personal", dueDate: inFiveDays, dueTime: "17:30",
        reminder: "60", completed: false, completedAt: null,
        createdAt: new Date(now - 86400000 * 2).toISOString(), updatedAt: new Date(now - 86400000 * 2).toISOString(), order: 9
      }
    ];
    return {
      version: 1,
      tasks: tasks,
      settings: { notificationsAsked: false },
      createdAt: new Date().toISOString()
    };
  }

  /* ---------- واجهة المصادقة ---------- */
  function authLoginTemplate() {
    return (
      '<div class="auth-card">' +
        '<span class="auth-kicker">مرحبًا بعودتك</span>' +
        '<h1 class="auth-title">سجّل الدخول إلى <span>مثمر</span></h1>' +
        '<p class="auth-lead">مساحتك الشخصية لمهامك وأولوياتك. كل شيء في مكانه، تمامًا كما تركته.</p>' +
        '<form class="auth-form" id="auth-form" novalidate>' +
          '<div class="form-group">' +
            '<label for="auth-email">البريد الإلكتروني</label>' +
            '<div class="input-shell">' + icon("mail") +
              '<input id="auth-email" name="email" type="email" dir="ltr" placeholder="name@example.com" autocomplete="email" inputmode="email">' +
            '</div>' +
            '<p class="field-error" data-error-for="email"></p>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="auth-password">كلمة المرور</label>' +
            '<div class="input-shell">' + icon("lock") +
              '<input id="auth-password" name="password" type="password" dir="ltr" placeholder="••••••••" autocomplete="current-password">' +
              '<button class="pass-toggle" type="button" data-toggle-password="auth-password" aria-label="إظهار كلمة المرور">' + icon("eye") + '</button>' +
            '</div>' +
            '<p class="field-error" data-error-for="password"></p>' +
          '</div>' +
          '<div class="form-row-between">' +
            '<label class="check-line"><input type="checkbox" id="auth-remember" checked><span class="check-box">' + icon("check") + '</span>تذكّرني على هذا الجهاز</label>' +
            '<span style="font-size:10px;color:var(--faint)">دخول آمن محليًا</span>' +
          '</div>' +
          '<div class="auth-alert" id="auth-alert" hidden></div>' +
          '<button class="btn btn-primary btn-lg btn-full" type="submit" id="auth-submit">' +
            '<span>تسجيل الدخول</span>' + icon("arrow-left") +
          '</button>' +
        '</form>' +
        '<div class="auth-divider"><span>أو</span></div>' +
        '<button class="btn-demo" type="button" id="demo-login">' + icon("sparkle") + 'استكشف مساحة عمل تجريبية</button>' +
        '<p class="auth-switch">ليس لديك حساب؟ <button class="link-btn" type="button" data-auth-mode="signup">أنشئ حسابك المجاني</button></p>' +
        '<div class="auth-trust">' + icon("shield") + '<span>كل حساب مساحة مستقلة، وبياناتك لا تغادر جهازك.</span></div>' +
      '</div>'
    );
  }

  function authSignupTemplate() {
    return (
      '<div class="auth-card">' +
        '<span class="auth-kicker">بداية جديدة</span>' +
        '<h1 class="auth-title">اصنع مساحتك في <span>مثمر</span></h1>' +
        '<p class="auth-lead">حساب واحد، خصوصية كاملة، وطريقة أهدأ لإنجاز ما يهم.</p>' +
        '<form class="auth-form" id="auth-form" novalidate>' +
          '<div class="form-group">' +
            '<label for="signup-name">الاسم الكامل</label>' +
            '<div class="input-shell">' + icon("user") +
              '<input id="signup-name" name="name" type="text" placeholder="مثال: أحمد العتيبي" autocomplete="name" maxlength="80">' +
            '</div>' +
            '<p class="field-error" data-error-for="name"></p>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="signup-email">البريد الإلكتروني</label>' +
            '<div class="input-shell">' + icon("mail") +
              '<input id="signup-email" name="email" type="email" dir="ltr" placeholder="name@example.com" autocomplete="email" inputmode="email">' +
            '</div>' +
            '<p class="field-error" data-error-for="email"></p>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="signup-password">كلمة المرور <span>8 أحرف على الأقل</span></label>' +
            '<div class="input-shell">' + icon("lock") +
              '<input id="signup-password" name="password" type="password" dir="ltr" placeholder="••••••••" autocomplete="new-password">' +
              '<button class="pass-toggle" type="button" data-toggle-password="signup-password" aria-label="إظهار كلمة المرور">' + icon("eye") + '</button>' +
            '</div>' +
            '<div class="password-meter" id="password-meter">' +
              '<div class="password-meter-bars"><i></i><i></i><i></i></div>' +
              '<small>استخدم مزيجًا من الحروف والأرقام لحماية أفضل.</small>' +
            '</div>' +
            '<p class="field-error" data-error-for="password"></p>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="signup-confirm">تأكيد كلمة المرور</label>' +
            '<div class="input-shell">' + icon("lock") +
              '<input id="signup-confirm" name="confirm" type="password" dir="ltr" placeholder="••••••••" autocomplete="new-password">' +
              '<button class="pass-toggle" type="button" data-toggle-password="signup-confirm" aria-label="إظهار تأكيد كلمة المرور">' + icon("eye") + '</button>' +
            '</div>' +
            '<p class="field-error" data-error-for="confirm"></p>' +
          '</div>' +
          '<div class="auth-alert" id="auth-alert" hidden></div>' +
          '<button class="btn btn-primary btn-lg btn-full" type="submit" id="auth-submit">' +
            '<span>إنشاء الحساب</span>' + icon("arrow-left") +
          '</button>' +
        '</form>' +
        '<p class="auth-switch">لديك حساب بالفعل؟ <button class="link-btn" type="button" data-auth-mode="login">سجّل الدخول</button></p>' +
        '<div class="auth-trust">' + icon("shield") + '<span>تُحفظ بياناتك محليًا على هذا المتصفح فقط.</span></div>' +
      '</div>'
    );
  }

  function renderAuth(mode) {
    state.authMode = mode || state.authMode || "login";
    if (!els.authRoot) return;
    els.authRoot.innerHTML = state.authMode === "signup" ? authSignupTemplate() : authLoginTemplate();
    const form = $("#auth-form", els.authRoot);
    if (form) form.addEventListener("submit", handleAuthSubmit);
    $$("[data-auth-mode]", els.authRoot).forEach(function (button) {
      button.addEventListener("click", function () {
        state.authMode = button.getAttribute("data-auth-mode");
        renderAuth(state.authMode);
        const firstInput = $("#auth-form input", els.authRoot);
        if (firstInput) setTimeout(function () { firstInput.focus(); }, 60);
      });
    });
    $$("[data-toggle-password]", els.authRoot).forEach(function (button) {
      button.addEventListener("click", function () {
        const input = document.getElementById(button.getAttribute("data-toggle-password"));
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.innerHTML = icon(show ? "eye-off" : "eye");
        button.setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
      });
    });
    const demoButton = $("#demo-login", els.authRoot);
    if (demoButton) demoButton.addEventListener("click", handleDemoLogin);
    const signupPassword = $("#signup-password", els.authRoot);
    if (signupPassword) {
      signupPassword.addEventListener("input", function () {
        updatePasswordMeter(signupPassword.value);
      });
    }
    const firstField = $("#auth-form input", els.authRoot);
    if (firstField) setTimeout(function () { firstField.focus(); }, 120);
  }

  function updatePasswordMeter(password) {
    const meter = $("#password-meter", els.authRoot);
    if (!meter) return;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Za-z]/.test(password) && /\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) score++;
    const bars = $$("i", meter);
    bars.forEach(function (bar, index) { bar.classList.toggle("is-on", index < score); });
    const label = $("small", meter);
    if (label) {
      label.textContent = score === 0
        ? "استخدم مزيجًا من الحروف والأرقام لحماية أفضل."
        : score === 1
          ? "كلمة مرور مقبولة، ويمكنك تقويتها أكثر."
          : score === 2
            ? "كلمة مرور جيدة."
            : "كلمة مرور قوية.";
    }
  }

  function clearAuthErrors(form) {
    $$(".field-error", form).forEach(function (error) { error.classList.remove("is-visible"); error.textContent = ""; });
    $$(".form-group.has-error", form).forEach(function (group) { group.classList.remove("has-error"); });
    const alert = $("#auth-alert", form);
    if (alert) { alert.hidden = true; alert.innerHTML = ""; }
  }

  function setFieldError(form, fieldName, message) {
    const input = form.querySelector('[name="' + fieldName + '"]');
    const error = form.querySelector('[data-error-for="' + fieldName + '"]');
    const group = input ? input.closest(".form-group") : null;
    if (input) input.setAttribute("aria-invalid", "true");
    if (group) group.classList.add("has-error");
    if (error) { error.textContent = message; error.classList.add("is-visible"); }
  }

  function showAuthAlert(message, isSuccess) {
    const alert = $("#auth-alert", els.authRoot);
    if (!alert) { toast(message, { type: isSuccess ? "success" : "error" }); return; }
    alert.className = "auth-alert" + (isSuccess ? " auth-alert--success" : "");
    alert.innerHTML = icon(isSuccess ? "check-circle" : "alert") + "<span>" + esc(message) + "</span>";
    alert.hidden = false;
  }

  function setButtonLoading(button, loading) {
    if (!button) return;
    button.classList.toggle("is-loading", loading);
    button.disabled = loading;
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (state.authBusy) return;
    const form = event.currentTarget;
    clearAuthErrors(form);
    const isSignup = state.authMode === "signup";
    const email = normalizeEmail(form.elements.email.value);
    const password = form.elements.password.value;
    let valid = true;

    if (isSignup) {
      const name = form.elements.name.value.trim();
      const confirm = form.elements.confirm.value;
      if (name.length < 2) { setFieldError(form, "name", "اكتب اسمك الكامل (حرفان على الأقل)."); valid = false; }
      if (!isValidEmail(email)) { setFieldError(form, "email", "أدخل بريدًا إلكترونيًا صحيحًا."); valid = false; }
      if (password.length < 8) { setFieldError(form, "password", "كلمة المرور يجب أن تكون 8 أحرف على الأقل."); valid = false; }
      if (confirm !== password) { setFieldError(form, "confirm", "كلمتا المرور غير متطابقتين."); valid = false; }
      if (!valid) return;
      state.authBusy = true;
      const submit = $("#auth-submit", form);
      setButtonLoading(submit, true);
      try {
        const users = getUsers();
        if (email === DEMO.email) {
          setFieldError(form, "email", "هذا البريد محجوز للمساحة التجريبية. استخدم بريدًا آخر.");
          return;
        }
        if (users.some(function (user) { return normalizeEmail(user.email) === email; })) {
          setFieldError(form, "email", "هذا البريد مرتبط بحساب موجود بالفعل.");
          return;
        }
        const hash = await createPasswordHash(password);
        const user = {
          id: uid("u"),
          name: name,
          email: email,
          salt: hash.salt,
          passwordHash: hash.passwordHash,
          isDemo: false,
          createdAt: new Date().toISOString()
        };
        users.push(user);
        if (!saveUsers(users)) {
          showAuthAlert("تعذّر إنشاء الحساب بسبب مشكلة في التخزين المحلي للمتصفح.");
          return;
        }
        const fresh = createEmptyData();
        safeStoreSet(localStorage, userDataKey(user.id), JSON.stringify(fresh));
        createSession(user.id, true);
        completeSignIn(user, "أهلًا بك في مثمر، " + firstName(name) + "! مساحتك جاهزة.");
      } catch (error) {
        showAuthAlert("حدث خطأ غير متوقع أثناء إنشاء الحساب. حاول مرة أخرى.");
      } finally {
        state.authBusy = false;
        setButtonLoading(submit, false);
      }
      return;
    }

    if (!isValidEmail(email)) { setFieldError(form, "email", "أدخل بريدًا إلكترونيًا صحيحًا."); valid = false; }
    if (!password) { setFieldError(form, "password", "أدخل كلمة المرور."); valid = false; }
    if (!valid) return;

    state.authBusy = true;
    const submit = $("#auth-submit", form);
    setButtonLoading(submit, true);
    try {
      const users = getUsers();
      const user = users.find(function (item) { return normalizeEmail(item.email) === email; });
      if (!user) {
        await sleep(320);
        showAuthAlert("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
        return;
      }
      const ok = await verifyPassword(password, user);
      if (!ok) {
        await sleep(250);
        showAuthAlert("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
        return;
      }
      const remember = $("#auth-remember", form).checked;
      createSession(user.id, remember);
      completeSignIn(user, "سعداء بعودتك، " + firstName(user.name) + ".");
    } catch (error) {
      showAuthAlert("حدث خطأ غير متوقع أثناء تسجيل الدخول. حاول مرة أخرى.");
    } finally {
      state.authBusy = false;
      setButtonLoading(submit, false);
    }
  }

  async function handleDemoLogin(event) {
    const button = event.currentTarget;
    if (state.authBusy) return;
    state.authBusy = true;
    button.classList.add("is-loading");
    button.disabled = true;
    try {
      const users = getUsers();
      let user = users.find(function (item) { return item.isDemo; });
      if (!user) {
        const hash = await createPasswordHash(DEMO.password);
        user = {
          id: uid("u"),
          name: DEMO.name,
          email: DEMO.email,
          salt: hash.salt,
          passwordHash: hash.passwordHash,
          isDemo: true,
          createdAt: new Date().toISOString()
        };
        users.push(user);
        if (!saveUsers(users)) {
          showAuthAlert("تعذّر تجهيز المساحة التجريبية. تحقق من إعدادات التخزين في المتصفح.");
          return;
        }
        safeStoreSet(localStorage, userDataKey(user.id), JSON.stringify(buildDemoData()));
      } else {
        const dataRaw = safeStoreGet(localStorage, userDataKey(user.id));
        if (!dataRaw) {
          safeStoreSet(localStorage, userDataKey(user.id), JSON.stringify(buildDemoData()));
        }
      }
      createSession(user.id, true);
      completeSignIn(user, "هذه مساحة تجريبية كاملة. جرّب كل شيء بحرية.");
    } catch (error) {
      showAuthAlert("تعذّر فتح المساحة التجريبية. حاول مرة أخرى.");
    } finally {
      state.authBusy = false;
      button.classList.remove("is-loading");
      button.disabled = false;
    }
  }

  /* ---------- الدخول إلى التطبيق ---------- */
  function completeSignIn(user, message) {
    state.user = user;
    state.data = loadUserData(user.id);
    state.view = "today";
    state.search = "";
    state.priority = "all";
    state.category = "all";
    state.sort = "priority";
    if (els.searchInput) els.searchInput.value = "";
    updateSearchClear();
    els.authScreen.hidden = true;
    els.workspace.hidden = false;
    document.body.classList.remove("is-locked");
    closeSidebar();
    closeNotifications();
    updateChrome();
    renderView();
    startEngines();
    document.title = "لوحة اليوم — مثمر";
    window.scrollTo({ top: 0, behavior: "auto" });
    if (message) toast(message, { type: "success" });
  }

  function signOut() {
    stopEngines();
    clearSessions();
    state.user = null;
    state.data = null;
    state.view = "today";
    state.search = "";
    state.priority = "all";
    state.category = "all";
    state.sort = "priority";
    closeNotifications();
    closeSidebar();
    if (pendingTaskRender) { clearTimeout(pendingTaskRender); pendingTaskRender = null; }
    els.workspace.hidden = true;
    els.authScreen.hidden = false;
    if (els.searchInput) els.searchInput.value = "";
    updateSearchClear();
    state.authMode = "login";
    renderAuth("login");
    document.title = "مثمر — مساحتك لإنجاز ما يهم";
    window.scrollTo({ top: 0, behavior: "auto" });
    toast("تم تسجيل الخروج بأمان.", { type: "success" });
  }

  function restoreSession() {
    const stored = readSession();
    if (!stored) return false;
    const users = getUsers();
    const user = users.find(function (item) { return item.id === stored.session.userId; });
    if (!user) {
      clearSessions();
      return false;
    }
    state.user = user;
    state.data = loadUserData(user.id);
    els.authScreen.hidden = true;
    els.workspace.hidden = false;
    updateChrome();
    renderView();
    startEngines();
    document.title = "لوحة اليوم — مثمر";
    return true;
  }

  /* ---------- الشريط الجانبي والإحصاءات ---------- */
  function updateChrome() {
    if (!state.user) return;
    const user = state.user;
    const palette = avatarStyle(user.name);
    $$("[data-avatar]").forEach(function (avatar) {
      avatar.textContent = initialOf(user.name);
      avatar.style.background = palette[0];
      avatar.style.color = palette[1];
    });
    $$("[data-user-name]").forEach(function (el) { el.textContent = user.name; });
    $$("[data-user-email]").forEach(function (el) { el.textContent = user.email; });
    updateSidebarWeek();
    updateNavCounts();
    updateNotificationBadge();
    if (!els.notifPanel.hidden) renderNotifications();
  }

  function getWeekSeries() {
    const series = [];
    const today = todayKey();
    for (let index = 6; index >= 0; index--) {
      const key = addDays(today, -index);
      const date = dateFromKey(key);
      const count = state.data.tasks.filter(function (task) {
        return task.completed && completedDateKey(task) === key;
      }).length;
      series.push({
        key: key,
        label: WEEKDAYS_SHORT[date.getDay()],
        short: WEEKDAYS[date.getDay()],
        count: count,
        isToday: key === today
      });
    }
    return series;
  }

  function updateSidebarWeek() {
    const series = getWeekSeries();
    const total = series.reduce(function (sum, day) { return sum + day.count; }, 0);
    const max = Math.max(1, Math.max.apply(null, series.map(function (day) { return day.count; })));
    const countEl = $("[data-side-week-count]");
    if (countEl) countEl.textContent = total;
    const bars = $("[data-side-bars]");
    if (bars) {
      bars.innerHTML = series.map(function (day) {
        const height = day.count === 0 ? 12 : Math.max(20, Math.round((day.count / max) * 100));
        return '<i class="' + (day.count > 0 ? "has-value " : "") + (day.isToday ? "is-today" : "") +
          '" style="height:' + height + '%" title="' + esc(day.short + " · " + day.count + " منجزة") + '"></i>';
      }).join("");
    }
    const copy = $("[data-side-week-copy]");
    if (copy) {
      copy.textContent = total === 0
        ? "كل إنجاز صغير يبني زخمًا."
        : "أنجزت " + total + " " + plural(total, "مهمة", "مهمتين", "مهام") + " خلال آخر 7 أيام.";
    }
  }

  function getStats() {
    const tasks = state.data.tasks;
    const today = todayKey();
    const active = tasks.filter(function (task) { return !task.completed; });
    const dueToday = active.filter(function (task) { return task.dueDate === today; }).length;
    const overdue = active.filter(function (task) { return task.dueDate && task.dueDate < today; }).length;
    const weekStart = addDays(today, -6);
    const doneThisWeek = tasks.filter(function (task) {
      const key = completedDateKey(task);
      return task.completed && key && key >= weekStart && key <= today;
    }).length;
    const completed = tasks.filter(function (task) { return task.completed; }).length;
    const rate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
    return { total: tasks.length, active: active.length, dueToday: dueToday, overdue: overdue, doneThisWeek: doneThisWeek, completed: completed, rate: rate };
  }

  function getTodayProgress() {
    const today = todayKey();
    const scope = state.data.tasks.filter(function (task) {
      return task.dueDate === today || (task.completed && completedDateKey(task) === today);
    });
    const done = scope.filter(function (task) { return task.completed; }).length;
    const total = scope.length;
    return { done: done, total: total, percent: total ? Math.round((done / total) * 100) : 0 };
  }

  function updateNavCounts() {
    if (!state.data) return;
    const today = todayKey();
    const active = state.data.tasks.filter(function (task) { return !task.completed; });
    const counts = {
      today: active.filter(function (task) { return task.dueDate && task.dueDate <= today; }).length,
      all: active.length,
      upcoming: active.filter(function (task) { return task.dueDate && task.dueDate > today; }).length
    };
    Object.keys(counts).forEach(function (key) {
      const badge = document.querySelector('[data-nav-count="' + key + '"]');
      if (badge) badge.textContent = counts[key] > 0 ? (counts[key] > 99 ? "99+" : counts[key]) : "";
    });
  }

  function updateNavState() {
    $$(".nav-item").forEach(function (item) {
      const active = item.getAttribute("data-nav") === state.view && !state.search.trim();
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
  }

  function navigateTo(view) {
    if (["today", "all", "upcoming", "completed", "settings"].indexOf(view) === -1) return;
    state.view = view;
    state.search = "";
    if (els.searchInput) els.searchInput.value = "";
    updateSearchClear();
    closeNotifications();
    closeSidebar();
    renderView();
    updateNavState();
    document.title = ({
      today: "لوحة اليوم",
      all: "كل المهام",
      upcoming: "المهام القادمة",
      completed: "المنجزات",
      settings: "الإعدادات"
    }[view] || "مثمر") + " — مثمر";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateSearchClear() {
    if (!els.searchClear) return;
    const hasText = !!(els.searchInput && els.searchInput.value.trim());
    els.searchClear.hidden = !hasText;
  }

  function openSidebar() {
    els.sidebar.classList.add("is-open");
    els.sidebarScrim.classList.add("is-visible");
    document.body.classList.add("is-locked");
    els.menuBtn.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    if (!els.sidebar) return;
    els.sidebar.classList.remove("is-open");
    if (els.sidebarScrim) els.sidebarScrim.classList.remove("is-visible");
    document.body.classList.remove("is-locked");
    if (els.menuBtn) els.menuBtn.setAttribute("aria-expanded", "false");
  }

  /* ---------- التنبيهات ---------- */
  function attentionTasks() {
    const today = todayKey();
    return state.data.tasks.filter(function (task) {
      return !task.completed && task.dueDate && task.dueDate <= today;
    });
  }

  function updateNotificationBadge() {
    if (!state.data || !els.notifBadge) return;
    const count = attentionTasks().length;
    els.notifBadge.hidden = count === 0;
    els.notifBadge.textContent = count > 9 ? "9+" : String(count);
    if (els.notifBtn) {
      els.notifBtn.setAttribute("aria-label", count > 0 ? "التنبيهات، " + count + " بحاجة إلى انتباهك" : "التنبيهات");
    }
  }

  function openNotifications() {
    if (!state.data) return;
    renderNotifications();
    els.notifPanel.hidden = false;
    els.notifBtn.setAttribute("aria-expanded", "true");
  }

  function closeNotifications() {
    if (!els.notifPanel) return;
    els.notifPanel.hidden = true;
    els.notifBtn.setAttribute("aria-expanded", "false");
  }

  function toggleNotifications() {
    if (els.notifPanel.hidden) openNotifications();
    else closeNotifications();
  }

  function notificationItem(task, kind) {
    let iconName = "clock";
    let tone = "is-today";
    let meta = "";
    if (kind === "overdue") {
      iconName = "alert";
      tone = "is-danger";
      meta = "متأخرة · " + formatDateShort(task.dueDate) + (task.dueTime ? " · " + formatTime(task.dueTime) : "");
    } else if (kind === "today") {
      iconName = "clock";
      tone = "is-today";
      meta = "اليوم" + (task.dueTime ? " · " + formatTime(task.dueTime) : " · بدون وقت محدد");
    } else {
      iconName = "bell";
      tone = "is-soon";
      meta = "تذكير " + formatDayLabel(task.dueDate) + (task.dueTime ? " · " + formatTime(task.dueTime) : "");
    }
    return (
      '<button class="notif-item" type="button" data-edit-task="' + esc(task.id) + '">' +
        '<span class="notif-item-icon ' + tone + '">' + icon(iconName) + '</span>' +
        '<span class="notif-item-main"><strong>' + esc(task.title) + '</strong><small>' + esc(meta) + '</small></span>' +
      '</button>'
    );
  }

  function renderNotifications() {
    if (!state.data || !els.notifPanel) return;
    const today = todayKey();
    const active = state.data.tasks.filter(function (task) { return !task.completed; });
    const overdue = active.filter(function (task) { return task.dueDate && task.dueDate < today; })
      .sort(function (a, b) { return (a.dueDate + (a.dueTime || "23:59")).localeCompare(b.dueDate + (b.dueTime || "23:59")); })
      .slice(0, 4);
    const dueToday = active.filter(function (task) { return task.dueDate === today; })
      .sort(function (a, b) { return (a.dueTime || "23:59").localeCompare(b.dueTime || "23:59"); })
      .slice(0, 4);
    const reminders = active.filter(function (task) {
      return task.reminder && task.dueDate && task.dueTime && task.dueDate >= today;
    }).sort(function (a, b) {
      return (reminderTimestamp(a) || 0) - (reminderTimestamp(b) || 0);
    }).slice(0, 4);

    const supportsNotifications = "Notification" in window;
    const permission = supportsNotifications ? Notification.permission : "unsupported";
    let html = '<div class="notif-head"><div><h2>التنبيهات</h2><p>ما يحتاج انتباهك الآن</p></div>' +
      '<button class="icon-btn" type="button" data-notif-settings aria-label="إدارة الإشعارات">' + icon("settings") + '</button></div>';
    html += '<div class="notif-body">';

    if (supportsNotifications && permission === "default") {
      html += '<div class="notif-permission">' + icon("bell") +
        '<p>فعّل إشعارات المتصفح لتصلك التذكيرات حتى وأنت في تبويب آخر.</p>' +
        '<button class="btn btn-soft" type="button" data-enable-notifications>تفعيل</button></div>';
    }

    if (!overdue.length && !dueToday.length && !reminders.length) {
      html += '<div class="notif-empty"><div class="notif-empty-icon">' + icon("check-circle") + '</div>' +
        '<strong>لا توجد تنبيهات الآن</strong><p>كل شيء تحت السيطرة. استمتع بصفاء ذهنك.</p></div>';
    } else {
      if (overdue.length) {
        html += '<div class="notif-section"><div class="notif-label">متأخرة <span>' + overdue.length + '</span></div>' +
          overdue.map(function (task) { return notificationItem(task, "overdue"); }).join("") + '</div>';
      }
      if (dueToday.length) {
        html += '<div class="notif-section"><div class="notif-label">مستحقة اليوم <span>' + dueToday.length + '</span></div>' +
          dueToday.map(function (task) { return notificationItem(task, "today"); }).join("") + '</div>';
      }
      if (reminders.length) {
        html += '<div class="notif-section"><div class="notif-label">تذكيرات قادمة <span>' + reminders.length + '</span></div>' +
          reminders.map(function (task) { return notificationItem(task, "reminder"); }).join("") + '</div>';
      }
    }

    html += '</div>';
    html += '<div class="notif-foot"><button type="button" data-notif-settings>' + icon("settings") + 'إدارة الإشعارات</button>' +
      '<button type="button" data-add-task>' + icon("plus") + 'إضافة مهمة</button></div>';
    els.notifPanel.innerHTML = html;
  }

  function startEngines() {
    stopEngines();
    lastKnownDay = todayKey();
    checkReminders();
    reminderTimer = window.setInterval(function () {
      if (!state.user) return;
      if (todayKey() !== lastKnownDay) {
        lastKnownDay = todayKey();
        updateChrome();
        renderView();
      }
      checkReminders();
    }, 30000);
  }

  function stopEngines() {
    if (reminderTimer) {
      clearInterval(reminderTimer);
      reminderTimer = null;
    }
  }

  function checkReminders() {
    if (!state.user || !state.data) return;
    const now = Date.now();
    let changed = false;
    state.data.tasks.forEach(function (task) {
      if (task.completed || !task.reminder || !task.dueDate || !task.dueTime) return;
      const remindAt = reminderTimestamp(task);
      const dueAt = dueTimestamp(task);
      if (!remindAt || !dueAt) return;
      if (now < remindAt || now > dueAt + 6 * 3600000) return;
      const signature = task.dueDate + "|" + task.dueTime + "|" + task.reminder;
      if (task.reminderSentAt === signature) return;
      task.reminderSentAt = signature;
      changed = true;
      fireReminder(task);
    });
    if (changed) {
      persistData();
      updateNotificationBadge();
      if (!els.notifPanel.hidden) renderNotifications();
    }
  }

  function fireReminder(task) {
    const when = dueLabel(task);
    toast("تذكير: " + task.title + " — " + when, {
      type: "reminder",
      duration: 9000,
      actionLabel: "عرض المهمة",
      onAction: function () { openTaskModal(task.id); }
    });
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const browserNotification = new Notification("مثمر · حان وقت مهمتك", {
          body: task.title + "\n" + when,
          icon: "favicon.svg",
          tag: "muthmir-" + task.id,
          dir: "rtl",
          lang: "ar"
        });
        browserNotification.onclick = function () {
          window.focus();
          openTaskModal(task.id);
          browserNotification.close();
        };
      } catch (error) { /* بعض المتصفحات تمنع الإشعار خارج HTTPS */ }
    }
  }

  async function enableBrowserNotifications(button) {
    if (!("Notification" in window)) {
      toast("هذا المتصفح لا يدعم إشعارات النظام. ستظل تنبيهات مثمر تعمل داخل الصفحة.", { type: "error" });
      return;
    }
    if (Notification.permission === "denied") {
      toast("الإشعارات محظورة من إعدادات المتصفح. يمكنك السماح بها من إعدادات الموقع.", { type: "error" });
      return;
    }
    if (Notification.permission === "granted") {
      sendTestNotification();
      return;
    }
    if (button) button.disabled = true;
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        state.data.settings.notificationsAsked = true;
        persistData();
        toast("تم تفعيل إشعارات المتصفح. سنذكّرك في الوقت المناسب.", { type: "success" });
        sendTestNotification();
        if (!els.notifPanel.hidden) renderNotifications();
        if (state.view === "settings") renderView();
      } else {
        toast("لم يتم تفعيل إشعارات المتصفح. تذكيرات الصفحة ستعمل كالمعتاد.", { type: "error" });
        if (!els.notifPanel.hidden) renderNotifications();
        if (state.view === "settings") renderView();
      }
    } catch (error) {
      toast("تعذّر طلب إذن الإشعارات.", { type: "error" });
    } finally {
      if (button) button.disabled = false;
    }
  }

  function sendTestNotification() {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      toast("إشعارات المتصفح غير مفعّلة بعد.", { type: "error" });
      return;
    }
    try {
      new Notification("مثمر · تم تفعيل التذكيرات", {
        body: "ستصلك تذكيرات مهامك هنا، ما دام مثمر مفتوحًا في المتصفح.",
        icon: "favicon.svg",
        dir: "rtl",
        lang: "ar"
      });
      toast("أرسلنا إشعارًا تجريبيًا.", { type: "success" });
    } catch (error) {
      toast("تعذّر إرسال إشعار المتصفح.", { type: "error" });
    }
  }

  /* ---------- أدوات المهام ---------- */
  function sortTasks(list) {
    const sorted = list.slice();
    sorted.sort(function (a, b) {
      if (state.sort === "newest") {
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      }
      if (state.sort === "due") {
        const aDate = a.dueDate || "9999-12-31";
        const bDate = b.dueDate || "9999-12-31";
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        const aTime = a.dueTime || "23:59";
        const bTime = b.dueTime || "23:59";
        if (aTime !== bTime) return aTime.localeCompare(bTime);
        return (PRIORITIES[a.priority] || PRIORITIES.medium).rank - (PRIORITIES[b.priority] || PRIORITIES.medium).rank;
      }
      const aRank = (PRIORITIES[a.priority] || PRIORITIES.medium).rank;
      const bRank = (PRIORITIES[b.priority] || PRIORITIES.medium).rank;
      if (aRank !== bRank) return aRank - bRank;
      const aDate = a.dueDate || "9999-12-31";
      const bDate = b.dueDate || "9999-12-31";
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      const aTime = a.dueTime || "23:59";
      const bTime = b.dueTime || "23:59";
      if (aTime !== bTime) return aTime.localeCompare(bTime);
      return Number(a.order || 0) - Number(b.order || 0);
    });
    return sorted;
  }

  function applyFilters(tasks) {
    return tasks.filter(function (task) {
      if (state.priority !== "all" && task.priority !== state.priority) return false;
      if (state.category !== "all" && task.category !== state.category) return false;
      return true;
    });
  }

  function hasActiveFilters() {
    return state.priority !== "all" || state.category !== "all";
  }

  function matchesSearch(task, query) {
    if (!query) return true;
    const category = CATEGORIES[task.category] ? CATEGORIES[task.category].label : "";
    const haystack = [task.title, task.notes, category, PRIORITIES[task.priority] ? PRIORITIES[task.priority].label : ""].join(" ").toLowerCase();
    return haystack.indexOf(query.toLowerCase()) !== -1;
  }

  function pageHead(options) {
    const actions = options.actions ? '<div class="page-actions">' + options.actions + '</div>' : "";
    return (
      '<div class="page-head">' +
        '<div class="page-head-main">' +
          '<div class="page-kicker">' + icon(options.icon || "calendar") +
            '<span>' + (options.kicker || "") + '</span>' +
          '</div>' +
          '<h1>' + options.title + '</h1>' +
          '<p class="page-sub">' + (options.subtitle || "") + '</p>' +
        '</div>' + actions +
      '</div>'
    );
  }

  function renderStats(stats, progress) {
    const rateText = stats.total ? stats.rate + "%" : "0%";
    return (
      '<section class="stats-grid" aria-label="ملخص اليوم">' +
        '<article class="stat-card">' +
          '<div class="stat-top"><span class="stat-icon">' + icon("calendar") + '</span><span class="stat-trend">' + progress.done + ' منجزة اليوم</span></div>' +
          '<div><div class="stat-value"><strong>' + stats.dueToday + '</strong><span>' + plural(stats.dueToday, "مهمة", "مهمتان", "مهام") + '</span></div><div class="stat-label">مهام اليوم</div></div>' +
        '</article>' +
        '<article class="stat-card stat-card--danger">' +
          '<div class="stat-top"><span class="stat-icon">' + icon("alert") + '</span><span class="stat-trend ' + (stats.overdue ? "is-warn" : "") + '">' + (stats.overdue ? "تحتاج انتباهك" : "لا تأخير") + '</span></div>' +
          '<div><div class="stat-value"><strong>' + stats.overdue + '</strong><span>' + plural(stats.overdue, "مهمة", "مهمتان", "مهام") + '</span></div><div class="stat-label">مهام متأخرة</div></div>' +
        '</article>' +
        '<article class="stat-card stat-card--gold">' +
          '<div class="stat-top"><span class="stat-icon">' + icon("check-circle") + '</span><span class="stat-trend">آخر 7 أيام</span></div>' +
          '<div><div class="stat-value"><strong>' + stats.doneThisWeek + '</strong><span>' + plural(stats.doneThisWeek, "مهمة", "مهمتان", "مهام") + '</span></div><div class="stat-label">أنجزت هذا الأسبوع</div></div>' +
        '</article>' +
        '<article class="stat-card stat-card--blue">' +
          '<div class="stat-top"><span class="stat-icon">' + icon("target") + '</span><span class="stat-trend">' + stats.completed + ' من ' + stats.total + '</span></div>' +
          '<div><div class="stat-value"><strong>' + rateText + '</strong><span>إجمالي</span></div><div class="stat-label">معدل الإنجاز</div></div>' +
        '</article>' +
      '</section>'
    );
  }

  function renderPriorityPills() {
    const options = [
      { value: "all", label: "الكل" },
      { value: "high", label: "عالية" },
      { value: "medium", label: "متوسطة" },
      { value: "low", label: "منخفضة" }
    ];
    return '<div class="priority-pills" role="group" aria-label="تصفية حسب الأولوية">' +
      options.map(function (option) {
        return '<button class="priority-pill' + (state.priority === option.value ? " is-active" : "") +
          '" type="button" data-priority-filter="' + option.value + '" aria-pressed="' + (state.priority === option.value) + '">' +
          option.label + '</button>';
      }).join("") + '</div>';
  }

  function renderCategoryOptions() {
    return Object.keys(CATEGORIES).map(function (key) {
      return '<option value="' + key + '"' + (state.category === key ? " selected" : "") + '>' + CATEGORIES[key].label + '</option>';
    }).join("");
  }

  function renderTaskToolbar(options) {
    const settings = options || {};
    let selects = '<div class="toolbar-filters">';
    selects += '<div class="select-shell"><select data-category-filter aria-label="تصفية حسب التصنيف">' +
      '<option value="all"' + (state.category === "all" ? " selected" : "") + '>كل التصنيفات</option>' +
      renderCategoryOptions() + '</select>' + icon("chevron-down") + '</div>';
    if (settings.sort !== false) {
      selects += '<div class="select-shell"><select data-sort aria-label="ترتيب المهام">' +
        '<option value="priority"' + (state.sort === "priority" ? " selected" : "") + '>الأهم أولًا</option>' +
        '<option value="due"' + (state.sort === "due" ? " selected" : "") + '>الأقرب موعدًا</option>' +
        '<option value="newest"' + (state.sort === "newest" ? " selected" : "") + '>الأحدث إضافة</option>' +
        '</select>' + icon("chevron-down") + '</div>';
    }
    selects += '</div>';
    return '<div class="task-toolbar">' + renderPriorityPills() + selects + '</div>';
  }

  function renderTaskRow(task) {
    const category = CATEGORIES[task.category] || CATEGORIES.other;
    const priority = PRIORITIES[task.priority] || PRIORITIES.medium;
    const tone = dueTone(task);
    const timeText = task.dueTime ? " · " + formatTime(task.dueTime) : "";
    let dueText = "بدون موعد";
    let dueIcon = "calendar";
    if (task.dueDate) {
      if (tone === "is-overdue") {
        dueText = "متأخرة · " + formatDateShort(task.dueDate) + timeText;
        dueIcon = "alert";
      } else {
        dueText = formatDayLabel(task.dueDate) + timeText;
        dueIcon = "clock";
      }
    }
    const reminder = task.reminder && !task.completed
      ? '<span class="task-chip is-reminder" title="تذكير ' + esc(reminderFullLabel(task.reminder)) + '">' + icon("bell") + esc(formatReminderShort(task.reminder)) + '</span>'
      : "";
    return (
      '<article class="task-row priority-' + esc(task.priority || "medium") + (task.completed ? " is-completed" : "") + '" data-task-row="' + esc(task.id) + '">' +
        '<button class="task-check" type="button" data-check-task="' + esc(task.id) + '" role="checkbox" aria-checked="' + (task.completed ? "true" : "false") + '" aria-label="' + (task.completed ? "إعادة المهمة إلى قيد الإنجاز" : "وضع علامة إنجاز على المهمة") + '">' +
          icon("check") +
        '</button>' +
        '<div class="task-main">' +
          '<div class="task-topline">' +
            '<button class="task-title" type="button" data-edit-task="' + esc(task.id) + '">' + esc(task.title) + '</button>' +
            '<span class="priority-badge">' + priority.label + '</span>' +
          '</div>' +
          (task.notes ? '<p class="task-note">' + esc(task.notes) + '</p>' : "") +
          '<div class="task-meta">' +
            '<span class="task-chip category">' + icon(category.icon) + esc(category.label) + '</span>' +
            '<span class="task-chip ' + tone + '">' + icon(dueIcon) + esc(dueText) + '</span>' +
            reminder +
          '</div>' +
        '</div>' +
        '<div class="task-actions">' +
          '<button class="task-action" type="button" data-edit-task="' + esc(task.id) + '" aria-label="تعديل المهمة" title="تعديل">' + icon("edit") + '</button>' +
          '<button class="task-action task-delete" type="button" data-delete-task="' + esc(task.id) + '" aria-label="حذف المهمة" title="حذف">' + icon("trash") + '</button>' +
        '</div>' +
      '</article>'
    );
  }

  function groupHeader(title, count, tone) {
    return '<div class="task-group-head ' + (tone || "") + '">' +
      '<span class="group-dot"></span><h3>' + title + '</h3><span class="group-count">' + count + '</span><span class="group-line"></span>' +
    '</div>';
  }

  function renderTaskGroups(groups) {
    return groups.map(function (group) {
      if (!group.tasks.length) return "";
      return '<div class="task-group' + (group.completed ? " task-group--completed" : "") + '">' +
        groupHeader(group.title, group.tasks.length, group.tone) +
        group.tasks.map(renderTaskRow).join("") +
      '</div>';
    }).join("");
  }

  function buildTodayGroups() {
    const today = todayKey();
    const filtered = applyFilters(state.data.tasks);
    const overdue = sortTasks(filtered.filter(function (task) { return !task.completed && task.dueDate && task.dueDate < today; }));
    const dueToday = sortTasks(filtered.filter(function (task) { return !task.completed && task.dueDate === today; }));
    const noDate = sortTasks(filtered.filter(function (task) { return !task.completed && !task.dueDate; }));
    const doneToday = filtered.filter(function (task) { return task.completed && completedDateKey(task) === today; })
      .sort(function (a, b) { return String(b.completedAt || "").localeCompare(String(a.completedAt || "")); });
    return [
      { title: "متأخرة", tasks: overdue, tone: "is-danger" },
      { title: "مستحقة اليوم", tasks: dueToday },
      { title: "بدون موعد", tasks: noDate },
      { title: "أُنجزت اليوم", tasks: doneToday, tone: "is-success", completed: true }
    ];
  }

  function buildAllGroups() {
    const filtered = applyFilters(state.data.tasks);
    const active = sortTasks(filtered.filter(function (task) { return !task.completed; }));
    const completed = filtered.filter(function (task) { return task.completed; })
      .sort(function (a, b) { return String(b.completedAt || "").localeCompare(String(a.completedAt || "")); });
    return [
      { title: "قيد الإنجاز", tasks: active },
      { title: "المكتملة", tasks: completed, tone: "is-success", completed: true }
    ];
  }

  function emptyState(type) {
    if (type === "search") {
      return '<div class="search-empty"><div class="search-empty-icon">' + icon("search") + '</div>' +
        '<h3>لا نتائج مطابقة</h3><p>جرّب كلمة أخرى أو امسح البحث للعودة إلى مهامك.</p>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-clear-search style="margin-top:12px">مسح البحث</button></div>';
    }
    if (type === "filtered") {
      return '<div class="empty-state"><div class="empty-illustration">' + icon("target") + '</div>' +
        '<h3>لا مهام تطابق هذا الفلتر</h3><p>غيّر الأولوية أو التصنيف، أو أعد عرض كل المهام.</p>' +
        '<button class="btn btn-ghost" type="button" data-reset-filters>إعادة ضبط الفلاتر</button></div>';
    }
    if (type === "completed") {
      return '<div class="empty-state"><div class="empty-illustration">' + icon("check-circle") + '</div>' +
        '<h3>لم تنجز مهامًا بعد</h3><p>عندما تُكمل مهمة، ستجدها هنا كتذكير جميل بتقدمك.</p>' +
        '<button class="btn btn-primary" type="button" data-add-task>' + icon("plus") + 'أضف مهمة</button></div>';
    }
    if (type === "upcoming") {
      return '<div class="empty-state"><div class="empty-illustration">' + icon("clock") + '</div>' +
        '<h3>لا مهام مجدولة قادمة</h3><p>خطط لما تريد إنجازه لاحقًا، وسنبقيه في نظرك مع تذكير في الوقت المناسب.</p>' +
        '<button class="btn btn-primary" type="button" data-add-task>' + icon("plus") + 'جدول مهمة قادمة</button></div>';
    }
    if (type === "today-done") {
      return '<div class="empty-state"><div class="empty-illustration">' + icon("sparkle") + '</div>' +
        '<h3>أنجزت كل مهام اليوم</h3><p>خطة اليوم اكتملت. خذ نفسًا عميقًا واستمتع بما أنجزت.</p>' +
        '<button class="btn btn-ghost" type="button" data-add-task>' + icon("plus") + 'أضف مهمة أخرى</button></div>';
    }
    return '<div class="empty-state"><div class="empty-illustration">' + icon("sparkle") + '</div>' +
      '<h3>ابدأ بشيء صغير</h3><p>مساحتك جاهزة. أضف أول مهمة، حدد أولويتها، واترك لمثمر ترتيب يومك.</p>' +
      '<button class="btn btn-primary" type="button" data-add-task>' + icon("plus") + 'أضف أول مهمة</button></div>';
  }

  function renderTaskPanel(options) {
    const total = options.total;
    return (
      '<section class="panel list-panel ' + (options.full ? "full-panel" : "") + '">' +
        '<div class="panel-head">' +
          '<div>' +
            '<div class="panel-title-row"><h2>' + options.title + '</h2><span class="soft-count">' + total + '</span></div>' +
            '<p class="panel-sub">' + options.subtitle + '</p>' +
          '</div>' +
          '<button class="panel-add" type="button" data-add-task aria-label="إضافة مهمة">' + icon("plus") + '</button>' +
        '</div>' +
        renderTaskToolbar(options) +
        (options.body || '<div class="task-list">' + options.groupsHtml + '</div>') +
      '</section>'
    );
  }

  function focusMessage(progress) {
    if (progress.total === 0) {
      return { title: "لنرسم خطة يومك", text: "أضف مهامك وحدد أولوياتك، وسنحسب تقدمك هنا." };
    }
    if (progress.percent >= 100) {
      return { title: "اكتملت خطة اليوم", text: "أنجزت كل ما خططت له. هذا يستحق لحظة فخر." };
    }
    if (progress.percent >= 70) {
      return { title: "على وشك الإنجاز", text: "بقي القليل فقط. حافظ على هذا الإيقاع الجميل." };
    }
    if (progress.percent >= 35) {
      return { title: "أنت في المسار الصحيح", text: "كل مهمة تنجزها تقرّبك من يوم تشعر فيه بالرضا." };
    }
    return { title: "بداية جيدة", text: "لا تحتاج لإنجاز كل شيء الآن. خطوة واحدة تكفي للبدء." };
  }

  function renderFocusCard() {
    const progress = getTodayProgress();
    const message = focusMessage(progress);
    const remaining = Math.max(0, progress.total - progress.done);
    return (
      '<section class="side-card focus-card" aria-label="تقدم اليوم">' +
        '<div class="focus-top"><span>' + icon("target") + 'هدف اليوم</span><span class="focus-tag">' + (progress.percent >= 100 ? "مكتمل" : "قيد التقدم") + '</span></div>' +
        '<div class="focus-content">' +
          '<div class="focus-ring" style="--progress:' + progress.percent + '"><div><strong>' + progress.percent + '<small>%</small></strong></div></div>' +
          '<div class="focus-copy"><h3>' + message.title + '</h3><p>' + message.text + '</p></div>' +
        '</div>' +
        '<div class="focus-stats">' +
          '<div class="focus-stat"><strong>' + progress.done + '</strong><small>منجزة</small></div>' +
          '<div class="focus-stat"><strong>' + remaining + '</strong><small>متبقية</small></div>' +
          '<button class="focus-cta" type="button" data-add-task aria-label="إضافة مهمة">' + icon("plus") + '</button>' +
        '</div>' +
      '</section>'
    );
  }

  function renderUpcomingCard() {
    const today = todayKey();
    const upcoming = state.data.tasks.filter(function (task) {
      return !task.completed && task.dueDate && task.dueDate > today;
    }).sort(function (a, b) {
      return (a.dueDate + (a.dueTime || "23:59")).localeCompare(b.dueDate + (b.dueTime || "23:59"));
    }).slice(0, 4);
    let content = "";
    if (!upcoming.length) {
      content = '<div class="side-empty">' + icon("calendar") + '<p>لا مهام قادمة بعد.<br>خطط لشيء يستحق الانتظار.</p></div>';
    } else {
      content = '<div class="upcoming-list">' + upcoming.map(function (task) {
        const date = dateFromKey(task.dueDate);
        const priority = PRIORITIES[task.priority] || PRIORITIES.medium;
        return '<button class="upcoming-item" type="button" data-edit-task="' + esc(task.id) + '">' +
          '<span class="upcoming-date"><strong>' + date.getDate() + '</strong><small>' + MONTHS_SHORT[date.getMonth()] + '</small></span>' +
          '<span class="upcoming-main"><strong>' + esc(task.title) + '</strong><small><i class="dot dot--' + (task.priority === "high" ? "high" : task.priority === "low" ? "low" : "medium") + '"></i>' +
          esc(priority.label) + (task.dueTime ? " · " + formatTime(task.dueTime) : "") + '</small></span>' +
        '</button>';
      }).join("") + '</div>';
    }
    return (
      '<section class="side-card" aria-label="المهام القادمة">' +
        '<div class="side-card-head"><div><h2>قادم قريبًا</h2><span class="side-kicker">خطتك للأيام التالية</span></div>' +
        '<button class="side-card-link" type="button" data-nav="upcoming">عرض الكل ' + icon("arrow-left") + '</button></div>' +
        content +
      '</section>'
    );
  }

  function renderRhythmCard() {
    const series = getWeekSeries();
    const max = Math.max(1, Math.max.apply(null, series.map(function (day) { return day.count; })));
    const total = series.reduce(function (sum, day) { return sum + day.count; }, 0);
    return (
      '<section class="side-card rhythm-card" aria-label="إيقاع الأسبوع">' +
        '<div class="side-card-head"><div><h2>إيقاع الأسبوع</h2><span class="side-kicker">إنجازاتك في آخر 7 أيام</span></div>' +
        '<span class="soft-count">' + total + '</span></div>' +
        '<div class="rhythm-bars">' + series.map(function (day) {
          const height = day.count === 0 ? 4 : Math.max(12, Math.round((day.count / max) * 100));
          return '<div class="rhythm-day ' + (day.isToday ? "is-today " : "") + (day.count > 0 ? "has-value" : "") + '" title="' + esc(day.short + " · " + day.count + " منجزة") + '">' +
            '<div class="rhythm-bar-wrap"><span class="rhythm-bar" style="height:' + height + '%"></span></div>' +
            '<small>' + day.label + '</small></div>';
        }).join("") + '</div>' +
        '<div class="rhythm-foot"><span>أفضل يوم هذا الأسبوع</span><strong>' + (total ? Math.max.apply(null, series.map(function (day) { return day.count; })) + " مهام" : "—") + '</strong></div>' +
      '</section>'
    );
  }

  function renderTodayView() {
    const stats = getStats();
    const progress = getTodayProgress();
    const totalAttention = stats.dueToday + stats.overdue;
    let subtitle;
    if (!stats.total) {
      subtitle = "مساحتك جاهزة. أضف أول مهمة وابدأ بخطوة صغيرة.";
    } else if (!totalAttention) {
      subtitle = "لا مهام مستحقة اليوم. لديك مساحة ثمينة للتركيز على ما يهم.";
    } else if (stats.overdue && stats.dueToday) {
      subtitle = "لديك " + stats.dueToday + " " + plural(stats.dueToday, "مهمة", "مهمتان", "مهام") + " اليوم و" + stats.overdue + " متأخرة. ابدأ بالأهم وستجد إيقاعك.";
    } else if (stats.overdue) {
      subtitle = "لديك " + stats.overdue + " " + plural(stats.overdue, "مهمة متأخرة", "مهمتان متأخرتان", "مهام متأخرة") + ". خطوة واحدة تكفي للعودة إلى المسار.";
    } else {
      subtitle = "لديك " + stats.dueToday + " " + plural(stats.dueToday, "مهمة", "مهمتان", "مهام") + " اليوم. ابدأ بالأهم وستجد إيقاعك.";
    }
    const groups = buildTodayGroups();
    const visibleTotal = groups.reduce(function (sum, group) { return sum + group.tasks.length; }, 0);
    const allDone = visibleTotal > 0 && groups.every(function (group) { return group.tasks.length === 0 || group.completed; });
    let empty = "";
    if (!visibleTotal) {
      if (hasActiveFilters()) empty = emptyState("filtered");
      else if (state.data.tasks.length && allDone) empty = emptyState("today-done");
      else empty = emptyState("default");
    }
    const groupsHtml = renderTaskGroups(groups);
    const title = greeting() + "، " + esc(firstName(state.user.name)) + ' <span class="wave">✦</span>';
    return (
      pageHead({
        icon: "calendar",
        kicker: formatTodayHeadline(),
        title: title,
        subtitle: subtitle,
        actions: '<span class="date-chip">' + icon("target") + Math.round(progress.percent) + '% من خطة اليوم</span>'
      }) +
      renderStats(stats, progress) +
      '<div class="dashboard-grid">' +
        renderTaskPanel({
          title: "مهام اليوم",
          subtitle: "مرتبة حسب أهميتها لتصل إلى ما يهم أولًا",
          total: visibleTotal,
          groupsHtml: groupsHtml,
          body: groupsHtml ? null : '<div class="task-list">' + empty + '</div>',
          full: false
        }) +
        '<aside class="side-stack">' + renderFocusCard() + renderUpcomingCard() + renderRhythmCard() + '</aside>' +
      '</div>'
    );
  }

  function renderAllView() {
    const groups = buildAllGroups();
    const visibleTotal = groups.reduce(function (sum, group) { return sum + group.tasks.length; }, 0);
    const activeCount = groups[0].tasks.length;
    const doneCount = groups[1].tasks.length;
    let empty = "";
    if (!visibleTotal) empty = hasActiveFilters() ? emptyState("filtered") : emptyState("default");
    const groupsHtml = renderTaskGroups(groups);
    return (
      pageHead({
        icon: "list",
        kicker: "مكتبة المهام",
        title: "كل مهامك في مكان واحد",
        subtitle: state.data.tasks.length
          ? activeCount + " قيد الإنجاز و" + doneCount + " مكتملة. نظرة واحدة تكفي لتقرر خطوتك التالية."
          : "أضف مهامك هنا لتبني صورة كاملة عن يومك وأسبوعك.",
        actions: '<button class="btn btn-ghost btn-sm" type="button" data-add-task>' + icon("plus") + 'إضافة مهمة</button>'
      }) +
      renderTaskPanel({
        title: "جميع المهام",
        subtitle: "ابحث، صفِّ، ورتّب كما يناسبك",
        total: visibleTotal,
        groupsHtml: groupsHtml,
        body: groupsHtml ? null : '<div class="task-list">' + empty + '</div>',
        full: true
      })
    );
  }

  function renderUpcomingView() {
    const today = todayKey();
    const filtered = applyFilters(state.data.tasks).filter(function (task) {
      return !task.completed && task.dueDate && task.dueDate > today;
    });
    const byDate = {};
    filtered.forEach(function (task) {
      if (!byDate[task.dueDate]) byDate[task.dueDate] = [];
      byDate[task.dueDate].push(task);
    });
    const dateKeys = Object.keys(byDate).sort();
    let body = "";
    let visibleTotal = 0;
    if (!dateKeys.length) {
      body = '<div class="task-list">' + (hasActiveFilters() ? emptyState("filtered") : emptyState("upcoming")) + '</div>';
    } else {
      body = '<div class="task-list upcoming-groups">' + dateKeys.map(function (key) {
        const tasks = sortTasks(byDate[key]);
        visibleTotal += tasks.length;
        const date = dateFromKey(key);
        return '<div class="date-group">' +
          '<div class="date-group-head">' +
            '<span class="date-badge"><strong>' + date.getDate() + '</strong><small>' + MONTHS_SHORT[date.getMonth()] + '</small></span>' +
            '<div class="date-group-title"><strong>' + formatDayLabel(key) + '</strong><small>' + formatDateLong(key) + '</small></div>' +
            '<span class="date-group-count">' + tasks.length + ' ' + plural(tasks.length, "مهمة", "مهمتان", "مهام") + '</span>' +
          '</div>' +
          '<div class="task-list">' + tasks.map(renderTaskRow).join("") + '</div>' +
        '</div>';
      }).join("") + '</div>';
    }
    const upcomingActive = state.data.tasks.filter(function (task) {
      return !task.completed && task.dueDate && task.dueDate > today;
    }).length;
    return (
      pageHead({
        icon: "clock",
        kicker: "التخطيط المستقبلي",
        title: "مهامك القادمة",
        subtitle: upcomingActive
          ? "لديك " + upcomingActive + " " + plural(upcomingActive, "مهمة قادمة", "مهمتان قادمتان", "مهام قادمة") + ". نظّمها اليوم، واترك التذكير لنا."
          : "خطط لما تريد إنجازه لاحقًا. المهام القادمة تظهر هنا مرتبة حسب اليوم.",
        actions: '<button class="btn btn-ghost btn-sm" type="button" data-add-task>' + icon("plus") + 'جدولة مهمة</button>'
      }) +
      renderTaskPanel({
        title: "الجدول القادم",
        subtitle: "كل يوم ومهامه، من الأقرب إلى الأبعد",
        total: visibleTotal,
        toolbar: true,
        body: body,
        full: true,
        sort: false
      })
    );
  }

  function renderCompletedView() {
    const stats = getStats();
    const completed = applyFilters(state.data.tasks).filter(function (task) { return task.completed; });
    const groupsMap = {};
    completed.forEach(function (task) {
      const key = completedDateKey(task) || "unknown";
      if (!groupsMap[key]) groupsMap[key] = [];
      groupsMap[key].push(task);
    });
    const keys = Object.keys(groupsMap).sort(function (a, b) {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return b.localeCompare(a);
    });
    let groupsHtml = "";
    let visibleTotal = 0;
    keys.forEach(function (key) {
      const tasks = groupsMap[key].sort(function (a, b) {
        return String(b.completedAt || "").localeCompare(String(a.completedAt || ""));
      });
      visibleTotal += tasks.length;
      const label = key === "unknown" ? "تاريخ غير معروف" : formatDateLong(key);
      const relative = key === "unknown" ? "" : formatDayLabel(key);
      groupsHtml += '<div class="task-group task-group--completed">' +
        groupHeader(label + (relative && relative !== formatDateShort(key) ? " · " + relative : ""), tasks.length, "is-success") +
        tasks.map(renderTaskRow).join("") +
      '</div>';
    });
    let empty = "";
    if (!visibleTotal) {
      empty = hasActiveFilters() ? emptyState("filtered") : emptyState("completed");
      groupsHtml = "";
    }
    return (
      pageHead({
        icon: "check-circle",
        kicker: "سجل الإنجاز",
        title: "منجزاتك تستحق أن تُرى",
        subtitle: stats.completed
          ? "أنجزت " + stats.completed + " " + plural(stats.completed, "مهمة", "مهمتان", "مهام") + " حتى الآن، و" + stats.doneThisWeek + " خلال آخر 7 أيام."
          : "كل مهمة تكملها ستظهر هنا، لتصبح خريطة صغيرة لتقدمك.",
        actions: '<span class="date-chip">' + icon("target") + stats.rate + '% معدل الإنجاز</span>'
      }) +
      '<section class="completed-hero">' +
        '<span class="completed-hero-icon">' + icon("check-circle") + '</span>' +
        '<div class="completed-hero-copy"><h2>تقدّمك يتراكم، خطوة بعد خطوة</h2><p>الاستمرارية أهم من الكمال. أنت تبني عادة جميلة.</p></div>' +
        '<div class="completed-hero-stat"><strong>' + stats.doneThisWeek + '</strong><small>هذا الأسبوع</small></div>' +
      '</section>' +
      renderTaskPanel({
        title: "سجل المهام المكتملة",
        subtitle: "اضغط علامة الإنجاز لإعادة أي مهمة إلى قائمة العمل",
        total: visibleTotal,
        groupsHtml: groupsHtml,
        body: groupsHtml ? null : '<div class="task-list">' + empty + '</div>',
        full: true,
        sort: false
      })
    );
  }

  function renderSearchView() {
    const query = state.search.trim();
    const matches = state.data.tasks.filter(function (task) { return matchesSearch(task, query); });
    const filtered = applyFilters(matches);
    const active = sortTasks(filtered.filter(function (task) { return !task.completed; }));
    const completed = filtered.filter(function (task) { return task.completed; })
      .sort(function (a, b) { return String(b.completedAt || "").localeCompare(String(a.completedAt || "")); });
    const groups = [
      { title: "قيد الإنجاز", tasks: active },
      { title: "المكتملة", tasks: completed, tone: "is-success", completed: true }
    ];
    const total = active.length + completed.length;
    const groupsHtml = renderTaskGroups(groups);
    const empty = '<div class="search-empty"><div class="search-empty-icon">' + icon("search") + '</div>' +
      '<h3>لا نتائج لـ «' + esc(query) + '»</h3><p>جرّب كلمة أخرى، أو امسح البحث للعودة إلى مهامك.</p>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-clear-search style="margin-top:12px">مسح البحث</button></div>';
    return (
      pageHead({
        icon: "search",
        kicker: "البحث في المهام",
        title: "نتائج البحث",
        subtitle: total ? "عثرنا على " + total + " " + plural(total, "مهمة", "مهمتان", "مهام") + " تطابق «" + esc(query) + "»." : "لم نعثر على نتائج مطابقة لبحثك.",
        actions: '<button class="btn btn-ghost btn-sm" type="button" data-clear-search>' + icon("close") + 'مسح البحث</button>'
      }) +
      renderTaskPanel({
        title: "المهام المطابقة",
        subtitle: "نتائج فورية من جميع مهامك",
        total: total,
        groupsHtml: groupsHtml,
        body: groupsHtml ? null : '<div class="task-list">' + empty + '</div>',
        full: true
      })
    );
  }

  function renderView() {
    if (!state.user || !state.data) return;
    updateNavState();
    updateNavCounts();
    els.viewRoot.style.animation = "none";
    void els.viewRoot.offsetWidth;
    els.viewRoot.style.animation = "";
    if (state.search.trim()) {
      els.viewRoot.innerHTML = renderSearchView();
      return;
    }
    switch (state.view) {
      case "all":
        els.viewRoot.innerHTML = renderAllView();
        break;
      case "upcoming":
        els.viewRoot.innerHTML = renderUpcomingView();
        break;
      case "completed":
        els.viewRoot.innerHTML = renderCompletedView();
        break;
      case "settings":
        els.viewRoot.innerHTML = renderSettingsView();
        break;
      default:
        els.viewRoot.innerHTML = renderTodayView();
        break;
    }
  }

  /* ---------- الإعدادات ---------- */
  function notificationStatusInfo() {
    if (!("Notification" in window)) {
      return { key: "unsupported", label: "غير مدعومة في هذا المتصفح", dot: "", action: "disabled", buttonLabel: "غير مدعومة" };
    }
    if (Notification.permission === "granted") {
      return { key: "granted", label: "إشعارات المتصفح مفعّلة", dot: "is-granted", action: "test", buttonLabel: "إرسال إشعار تجريبي" };
    }
    if (Notification.permission === "denied") {
      return { key: "denied", label: "محظورة من إعدادات المتصفح", dot: "is-denied", action: "disabled", buttonLabel: "محظورة" };
    }
    return { key: "default", label: "لم يتم تفعيلها بعد", dot: "", action: "enable", buttonLabel: "تفعيل الإشعارات" };
  }

  function renderSettingsView() {
    const user = state.user;
    const palette = avatarStyle(user.name);
    const status = notificationStatusInfo();
    const completedCount = state.data.tasks.filter(function (task) { return task.completed; }).length;
    const isDemo = !!user.isDemo;
    const notificationButton = status.action === "disabled"
      ? '<button class="btn btn-ghost" type="button" disabled>' + status.buttonLabel + '</button>'
      : '<button class="btn btn-soft" type="button" data-enable-notifications>' + icon("bell") + status.buttonLabel + '</button>';
    return (
      pageHead({
        icon: "settings",
        kicker: "مساحتك الشخصية",
        title: "الإعدادات",
        subtitle: "تحكم بحسابك وتفضيلاتك وبياناتك. كل شيء هنا خاص بك وحدك.",
        actions: '<span class="date-chip">' + icon("shield") + 'حساب محلي خاص</span>'
      }) +
      '<div class="settings-wrap">' +
        '<div class="settings-grid">' +
          '<section class="settings-card">' +
            '<div class="settings-card-head">' +
              '<span class="settings-icon">' + icon("user") + '</span>' +
              '<div><h2>الملف الشخصي</h2><p>الاسم والبريد المرتبطان بمساحتك.</p></div>' +
            '</div>' +
            '<form class="settings-form" id="settings-profile-form" novalidate>' +
              '<div class="profile-row">' +
                '<span class="avatar profile-avatar" style="background:' + palette[0] + ';color:' + palette[1] + '">' + esc(initialOf(user.name)) + '</span>' +
                '<div><strong>' + esc(user.name) + '</strong><small>' + (isDemo ? "مساحة تجريبية" : "عضو في مثمر") + '</small></div>' +
              '</div>' +
              '<div class="form-group"><label for="settings-name">الاسم الكامل</label>' +
                '<input class="form-input" id="settings-name" name="name" type="text" value="' + esc(user.name) + '" maxlength="80" autocomplete="name"></div>' +
              '<div class="form-group"><label for="settings-email">البريد الإلكتروني</label>' +
                '<input class="form-input" id="settings-email" name="email" type="email" dir="ltr" value="' + esc(user.email) + '"' + (isDemo ? " disabled" : "") + ' autocomplete="email">' +
              '</div>' +
              (isDemo ? '<div class="settings-note">' + icon("sparkle") + '<span>هذه مساحة تجريبية. يمكنك تغيير الاسم، لكن البريد محجوز للحساب التجريبي.</span></div>' : '') +
              '<div class="form-feedback" id="profile-feedback"></div>' +
              '<div class="settings-actions"><button class="btn btn-primary" type="submit">' + icon("check") + 'حفظ التغييرات</button></div>' +
            '</form>' +
          '</section>' +

          '<section class="settings-card">' +
            '<div class="settings-card-head">' +
              '<span class="settings-icon is-gold">' + icon("lock") + '</span>' +
              '<div><h2>الأمان</h2><p>غيّر كلمة المرور الخاصة بحسابك.</p></div>' +
            '</div>' +
            '<form class="settings-form" id="settings-password-form" novalidate>' +
              '<div class="form-group"><label for="current-password">كلمة المرور الحالية</label>' +
                '<input class="form-input" id="current-password" name="current_password" type="password" dir="ltr" autocomplete="current-password" placeholder="••••••••"></div>' +
              '<div class="settings-form-row">' +
                '<div class="form-group"><label for="new-password">كلمة المرور الجديدة</label>' +
                  '<input class="form-input" id="new-password" name="new_password" type="password" dir="ltr" autocomplete="new-password" placeholder="8 أحرف على الأقل"></div>' +
                '<div class="form-group"><label for="confirm-password">تأكيد الجديدة</label>' +
                  '<input class="form-input" id="confirm-password" name="confirm_password" type="password" dir="ltr" autocomplete="new-password" placeholder="••••••••"></div>' +
              '</div>' +
              '<div class="form-feedback" id="password-feedback"></div>' +
              '<div class="settings-actions"><button class="btn btn-primary" type="submit">' + icon("lock") + 'تحديث كلمة المرور</button></div>' +
            '</form>' +
          '</section>' +

          '<section class="settings-card">' +
            '<div class="settings-card-head">' +
              '<span class="settings-icon is-blue">' + icon("bell") + '</span>' +
              '<div><h2>الإشعارات والتذكيرات</h2><p>لا تفوّت ما خططت له.</p></div>' +
            '</div>' +
            '<div class="settings-form">' +
              '<div class="notification-status"><span class="status-dot ' + status.dot + '"></span><span>' + status.label + '</span></div>' +
              '<div class="settings-note">' + icon("bell") + '<span>تذكيرات مثمر تعمل دائمًا داخل الصفحة. لتصلك الإشعارات خارج التبويب، فعّل إشعارات المتصفح وأبقِ مثمر مفتوحًا.</span></div>' +
              '<div class="settings-actions">' + notificationButton + '</div>' +
            '</div>' +
          '</section>' +

          '<section class="settings-card">' +
            '<div class="settings-card-head">' +
              '<span class="settings-icon">' + icon("shield") + '</span>' +
              '<div><h2>البيانات والخصوصية</h2><p>نسخ احتياطي، استيراد، وإدارة مساحتك.</p></div>' +
            '</div>' +
            '<div class="data-actions">' +
              '<button class="data-action" type="button" data-export-backup>' +
                '<span class="data-action-icon">' + icon("download") + '</span><div><strong>تنزيل نسخة احتياطية</strong><small>ملف JSON يحتوي كل مهامك</small></div>' + icon("arrow-left") +
              '</button>' +
              '<button class="data-action" type="button" data-import-backup>' +
                '<span class="data-action-icon">' + icon("upload") + '</span><div><strong>استيراد نسخة احتياطية</strong><small>استعد مهامك من ملف سابق</small></div>' + icon("arrow-left") +
              '</button>' +
              '<button class="data-action" type="button" data-clear-completed' + (completedCount ? "" : " disabled") + '>' +
                '<span class="data-action-icon">' + icon("check-circle") + '</span><div><strong>مسح المهام المكتملة</strong><small>' + (completedCount ? completedCount + " مهمة مكتملة" : "لا مهام مكتملة") + '</small></div>' + icon("arrow-left") +
              '</button>' +
              '<input id="import-file" type="file" accept="application/json,.json" hidden>' +
            '</div>' +
            '<div class="danger-zone"><span class="danger-zone-label">منطقة الخطر</span>' +
              '<button class="data-action is-danger" type="button" data-delete-account>' +
                '<span class="data-action-icon">' + icon("trash") + '</span><div><strong>حذف الحساب</strong><small>حذف الحساب وكل بياناته نهائيًا</small></div>' + icon("arrow-left") +
              '</button>' +
            '</div>' +
          '</section>' +
        '</div>' +
        '<div class="privacy-note">' + icon("shield") +
          '<div><strong>خصوصيتك ليست إعدادًا اختياريًا</strong><p>يعمل مثمر بالكامل داخل متصفحك. تُحفظ كل مهمة في مساحة منفصلة تخص حسابك، ولا يمكن الوصول إليها من حساب آخر داخل التطبيق. كلمة مرورك محفوظة بصيغة مشفّرة (hash) ولا تُخزّن كنص واضح.</p></div>' +
        '</div>' +
        '<div class="version-note"><span>مثمر · الإصدار 1.0</span><span>بياناتك تبقى على هذا الجهاز</span></div>' +
      '</div>'
    );
  }

  /* ---------- النوافذ المنبثقة ---------- */
  function openModal(html, options) {
    const opts = options || {};
    if (activeModal && activeModal.close) activeModal.close();
    const previousFocus = document.activeElement;
    const layer = document.createElement("div");
    layer.className = "modal-layer";
    layer.innerHTML = '<section class="modal ' + (opts.className || "") + '" role="dialog" aria-modal="true"' +
      (opts.labelledBy ? ' aria-labelledby="' + esc(opts.labelledBy) + '"' : "") + ">" + html + "</section>";
    document.getElementById("modal-root").appendChild(layer);
    document.body.classList.add("is-locked");
    let closed = false;
    const dialog = layer.querySelector(".modal");

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeyDown);
      layer.classList.remove("is-open");
      window.setTimeout(function () {
        layer.remove();
        if (!document.querySelector(".modal-layer")) document.body.classList.remove("is-locked");
      }, 230);
      if (previousFocus && typeof previousFocus.focus === "function" && document.contains(previousFocus)) {
        window.setTimeout(function () { previousFocus.focus(); }, 40);
      }
      if (activeModal && activeModal.layer === layer) activeModal = null;
      if (typeof opts.onClose === "function") opts.onClose();
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = $$('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', dialog)
        .filter(function (element) { return element.offsetParent !== null; });
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    layer.addEventListener("mousedown", function (event) {
      if (event.target === layer) close();
    });
    $$("[data-close-modal]", layer).forEach(function (button) {
      button.addEventListener("click", close);
    });
    document.addEventListener("keydown", onKeyDown);
    activeModal = { layer: layer, dialog: dialog, close: close };
    window.requestAnimationFrame(function () { layer.classList.add("is-open"); });
    const focusTarget = $("[data-autofocus]", dialog) || $('button, input, select, textarea, a[href]', dialog);
    if (focusTarget) window.setTimeout(function () { focusTarget.focus(); }, 80);
    return activeModal;
  }

  function askConfirm(options) {
    return new Promise(function (resolve) {
      let settled = false;
      const headingId = "confirm-title-" + Date.now();
      const modal = openModal(
        '<div class="confirm-body">' +
          '<div class="confirm-icon">' + icon(options.icon || "alert") + '</div>' +
          '<h3 id="' + headingId + '">' + esc(options.title || "هل أنت متأكد؟") + '</h3>' +
          '<p>' + esc(options.message || "لا يمكن التراجع عن هذا الإجراء.") + '</p>' +
          '<div class="modal-foot">' +
            '<button class="btn btn-ghost" type="button" data-close-modal data-autofocus>تراجع</button>' +
            '<button class="btn ' + (options.danger === false ? "btn-primary" : "btn-danger") + '" type="button" data-confirm-action>' + esc(options.confirmLabel || "تأكيد") + '</button>' +
          '</div>' +
        '</div>',
        {
          className: "modal--sm",
          labelledBy: headingId,
          onClose: function () {
            if (!settled) { settled = true; resolve(false); }
          }
        }
      );
      const confirmButton = $("[data-confirm-action]", modal.dialog);
      if (confirmButton) {
        confirmButton.addEventListener("click", function () {
          if (settled) return;
          settled = true;
          modal.close();
          resolve(true);
        });
      }
    });
  }

  function toast(message, options) {
    const opts = options || {};
    const root = els.toastRoot || document.getElementById("toast-root");
    if (!root) return;
    const type = opts.type || "success";
    const iconName = type === "error" ? "alert" : type === "reminder" ? "bell" : "check-circle";
    const element = document.createElement("div");
    element.className = "toast toast--" + type;
    element.innerHTML = '<span class="toast-icon">' + icon(iconName) + '</span><span class="toast-message">' + esc(message) + '</span>';
    if (opts.actionLabel && typeof opts.onAction === "function") {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "toast-action";
      action.textContent = opts.actionLabel;
      action.addEventListener("click", function () {
        hide();
        opts.onAction();
      });
      element.appendChild(action);
    }
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "toast-close";
    closeButton.setAttribute("aria-label", "إغلاق التنبيه");
    closeButton.innerHTML = icon("close");
    closeButton.addEventListener("click", hide);
    element.appendChild(closeButton);
    root.appendChild(element);
    if (root.children.length > 3) root.firstElementChild.remove();
    let hidden = false;
    let timer = window.setTimeout(hide, opts.duration || 3800);
    window.requestAnimationFrame(function () { element.classList.add("is-visible"); });
    element.addEventListener("mouseenter", function () { window.clearTimeout(timer); });
    element.addEventListener("mouseleave", function () { timer = window.setTimeout(hide, 2200); });
    function hide() {
      if (hidden) return;
      hidden = true;
      window.clearTimeout(timer);
      element.classList.remove("is-visible");
      window.setTimeout(function () { element.remove(); }, 240);
    }
    return element;
  }

  /* ---------- إنشاء المهمة وتعديلها ---------- */
  function openTaskModal(taskId, presetDate) {
    if (!state.user) return;
    const existing = taskId ? state.data.tasks.find(function (task) { return task.id === taskId; }) : null;
    if (taskId && !existing) return;
    closeNotifications();
    const task = existing || {
      title: "",
      notes: "",
      priority: "medium",
      category: state.category !== "all" ? state.category : "work",
      dueDate: presetDate || todayKey(),
      dueTime: "",
      reminder: ""
    };
    const isEdit = !!existing;
    const titleId = "task-modal-title";
    const priorityOptions = Object.keys(PRIORITIES).map(function (key) {
      const priority = PRIORITIES[key];
      return '<label class="priority-option' + (task.priority === key ? " is-selected" : "") + '" data-priority="' + key + '">' +
        '<input type="radio" name="task-priority" value="' + key + '"' + (task.priority === key ? " checked" : "") + '>' +
        '<span class="p-dot"></span><span class="p-copy"><strong>' + priority.label + '</strong><small>' + priority.hint + '</small></span>' +
      '</label>';
    }).join("");
    const categoryOptions = Object.keys(CATEGORIES).map(function (key) {
      return '<option value="' + key + '"' + (task.category === key ? " selected" : "") + '>' + CATEGORIES[key].label + '</option>';
    }).join("");
    const reminderOptions = REMINDER_OPTIONS.map(function (option) {
      return '<option value="' + option.value + '"' + (String(task.reminder || "") === option.value ? " selected" : "") + '>' + option.label + '</option>';
    }).join("");
    const modal = openModal(
      '<div class="modal-head">' +
        '<div><div class="modal-kicker">' + (isEdit ? "تعديل المهمة" : "إضافة إلى يومك") + '</div>' +
          '<h2 id="' + titleId + '">' + (isEdit ? "عدّل تفاصيل المهمة" : "ما الذي تريد إنجازه؟") + '</h2>' +
          '<p>' + (isEdit ? "حدّث ما تحتاجه، وسيبقى كل شيء في مكانه." : "حدد المهمة وأولويّتها، ودع الباقي علينا.") + '</p>' +
        '</div>' +
        '<button class="modal-close" type="button" data-close-modal aria-label="إغلاق">' + icon("close") + '</button>' +
      '</div>' +
      '<form id="task-form" novalidate>' +
        '<div class="modal-body">' +
          '<div class="form-feedback" id="task-form-feedback"></div>' +
          '<div class="form-group">' +
            '<label for="task-title">عنوان المهمة</label>' +
            '<input class="form-input" id="task-title" name="title" type="text" maxlength="140" value="' + esc(task.title) + '" placeholder="مثال: تجهيز عرض العميل النهائي" autocomplete="off">' +
            '<p class="field-error" data-error-for="title"></p>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="task-notes">تفاصيل إضافية <span>اختياري</span></label>' +
            '<textarea class="form-textarea" id="task-notes" name="notes" maxlength="900" placeholder="أضف ملاحظة أو خطوات صغيرة تساعدك على البدء…">' + esc(task.notes || "") + '</textarea>' +
          '</div>' +
          '<div class="form-grid">' +
            '<div class="form-group">' +
              '<label for="task-due-date">تاريخ الاستحقاق</label>' +
              '<div class="date-input-wrap"><input class="form-input" id="task-due-date" name="dueDate" type="date" value="' + esc(task.dueDate || "") + '">' + icon("calendar") + '</div>' +
            '</div>' +
            '<div class="form-group">' +
              '<label for="task-due-time">الوقت <span>اختياري</span></label>' +
              '<div class="date-input-wrap"><input class="form-input" id="task-due-time" name="dueTime" type="time" value="' + esc(task.dueTime || "") + '">' + icon("clock") + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="quick-dates">' +
            '<button class="quick-date" type="button" data-quick-date="today">اليوم</button>' +
            '<button class="quick-date" type="button" data-quick-date="tomorrow">غدًا</button>' +
            '<button class="quick-date" type="button" data-quick-date="week">بعد أسبوع</button>' +
            '<button class="quick-date" type="button" data-quick-date="clear">بدون تاريخ</button>' +
          '</div>' +
          '<div class="form-group">' +
            '<label>الأولوية</label>' +
            '<div class="priority-choice" role="radiogroup" aria-label="أولوية المهمة">' + priorityOptions + '</div>' +
          '</div>' +
          '<div class="form-grid">' +
            '<div class="form-group"><label for="task-category">التصنيف</label>' +
              '<div class="select-shell" style="width:100%"><select id="task-category" name="category" style="width:100%;height:42px;font-size:11px;padding-inline:34px 12px">' + categoryOptions + '</select>' + icon("chevron-down") + '</div>' +
            '</div>' +
            '<div class="form-group"><label for="task-reminder">التذكير</label>' +
              '<div class="select-shell" style="width:100%"><select id="task-reminder" name="reminder" style="width:100%;height:42px;font-size:11px;padding-inline:34px 12px">' + reminderOptions + '</select>' + icon("chevron-down") + '</div>' +
            '</div>' +
          '</div>' +
          '<p class="reminder-hint" id="reminder-hint">' + icon("bell") + '<span>' + (task.reminder ? "سنرسل لك تذكيرًا " + reminderFullLabel(task.reminder) + "." : "يمكنك إضافة تذكير بعد تحديد وقت المهمة.") + '</span></p>' +
        '</div>' +
        '<div class="modal-foot">' +
          '<button class="btn btn-ghost" type="button" data-close-modal>إلغاء</button>' +
          '<button class="btn btn-primary" type="submit">' + icon(isEdit ? "check" : "plus") + (isEdit ? "حفظ التعديلات" : "إضافة المهمة") + '</button>' +
        '</div>' +
      '</form>',
      { labelledBy: titleId }
    );
    const form = $("#task-form", modal.dialog);
    const titleInput = $("#task-title", form);
    if (titleInput) window.setTimeout(function () { titleInput.focus(); titleInput.select(); }, 90);
    $$(".priority-option", form).forEach(function (option) {
      option.addEventListener("click", function () {
        $$(".priority-option", form).forEach(function (item) { item.classList.remove("is-selected"); });
        option.classList.add("is-selected");
      });
    });
    $$("[data-quick-date]", form).forEach(function (button) {
      button.addEventListener("click", function () {
        const value = button.getAttribute("data-quick-date");
        const dateInput = $("#task-due-date", form);
        if (value === "clear") dateInput.value = "";
        else if (value === "today") dateInput.value = todayKey();
        else if (value === "tomorrow") dateInput.value = addDays(todayKey(), 1);
        else if (value === "week") dateInput.value = addDays(todayKey(), 7);
        updateReminderHint(form);
      });
    });
    const reminderSelect = $("#task-reminder", form);
    if (reminderSelect) reminderSelect.addEventListener("change", function () { updateReminderHint(form); });
    const dateInput = $("#task-due-date", form);
    const timeInput = $("#task-due-time", form);
    if (dateInput) dateInput.addEventListener("change", function () { updateReminderHint(form); });
    if (timeInput) timeInput.addEventListener("change", function () { updateReminderHint(form); });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const feedback = $("#task-form-feedback", form);
      const titleError = $('[data-error-for="title"]', form);
      if (feedback) { feedback.className = "form-feedback"; feedback.textContent = ""; }
      if (titleError) { titleError.classList.remove("is-visible"); titleError.textContent = ""; }
      const title = titleInput.value.trim();
      if (!title) {
        if (titleError) { titleError.textContent = "أضف عنوانًا واضحًا للمهمة."; titleError.classList.add("is-visible"); }
        titleInput.focus();
        return;
      }
      const notes = $("#task-notes", form).value.trim();
      const dueDate = $("#task-due-date", form).value;
      const dueTime = $("#task-due-time", form).value;
      const reminder = $("#task-reminder", form).value;
      const priorityInput = form.querySelector('input[name="task-priority"]:checked');
      const priority = priorityInput ? priorityInput.value : "medium";
      const category = $("#task-category", form).value;
      if (dueTime && !dueDate) {
        if (feedback) { feedback.className = "form-feedback is-error"; feedback.textContent = "أضف تاريخًا للمهمة قبل تحديد وقتها."; }
        $("#task-due-date", form).focus();
        return;
      }
      if (reminder && (!dueDate || !dueTime)) {
        if (feedback) { feedback.className = "form-feedback is-error"; feedback.textContent = "لتفعيل التذكير، أضف تاريخًا ووقتًا للمهمة."; }
        if (!dueTime) $("#task-due-time", form).focus();
        else $("#task-due-date", form).focus();
        return;
      }
      const nowIso = new Date().toISOString();
      if (isEdit) {
        const scheduleChanged = existing.dueDate !== dueDate || existing.dueTime !== dueTime || String(existing.reminder || "") !== reminder;
        existing.title = title;
        existing.notes = notes;
        existing.priority = priority;
        existing.category = category;
        existing.dueDate = dueDate;
        existing.dueTime = dueTime;
        existing.reminder = reminder;
        existing.updatedAt = nowIso;
        if (scheduleChanged) existing.reminderSentAt = null;
      } else {
        const maxOrder = state.data.tasks.reduce(function (max, item) { return Math.max(max, Number(item.order) || 0); }, 0);
        state.data.tasks.push({
          id: uid("t"),
          title: title,
          notes: notes,
          priority: priority,
          category: category,
          dueDate: dueDate,
          dueTime: dueTime,
          reminder: reminder,
          reminderSentAt: null,
          completed: false,
          completedAt: null,
          createdAt: nowIso,
          updatedAt: nowIso,
          order: maxOrder + 1
        });
      }
      persistData();
      modal.close();
      updateChrome();
      renderView();
      toast(isEdit ? "تم حفظ تعديلات المهمة." : "أُضيفت المهمة إلى خطتك.", { type: "success" });
    });
  }

  function updateReminderHint(form) {
    const hint = $("#reminder-hint span", form);
    if (!hint) return;
    const reminder = $("#task-reminder", form).value;
    const date = $("#task-due-date", form).value;
    const time = $("#task-due-time", form).value;
    if (!reminder) {
      hint.textContent = "يمكنك إضافة تذكير بعد تحديد وقت المهمة.";
    } else if (!date || !time) {
      hint.textContent = "أضف تاريخًا ووقتًا للمهمة ليعمل التذكير في وقته.";
    } else {
      hint.textContent = "سنرسل لك تذكيرًا " + reminderFullLabel(reminder) + "، داخل الصفحة وإشعار المتصفح إن كان مفعّلًا.";
    }
  }

  /* ---------- إجراءات المهام ---------- */
  function toggleTaskCompletion(taskId) {
    const task = state.data.tasks.find(function (item) { return item.id === taskId; });
    if (!task) return;
    const wasCompleted = task.completed;
    const previousCompletedAt = task.completedAt;
    task.completed = !wasCompleted;
    task.completedAt = task.completed ? new Date().toISOString() : null;
    task.updatedAt = new Date().toISOString();
    persistData();
    const row = document.querySelector('[data-task-row="' + taskId + '"]');
    if (row) {
      row.classList.toggle("is-completed", task.completed);
      row.classList.add(task.completed ? "just-completed" : "just-restored");
      const check = $("[data-check-task]", row);
      if (check) check.setAttribute("aria-checked", task.completed ? "true" : "false");
    }
    updateChrome();
    if (pendingTaskRender) clearTimeout(pendingTaskRender);
    pendingTaskRender = window.setTimeout(function () {
      pendingTaskRender = null;
      renderView();
    }, 380);
    toast(task.completed ? "أحسنت! أُنجزت «" + task.title + "»." : "أُعيدت «" + task.title + "» إلى قائمة مهامك.", {
      type: "success",
      actionLabel: "تراجع",
      onAction: function () {
        if (pendingTaskRender) { clearTimeout(pendingTaskRender); pendingTaskRender = null; }
        task.completed = wasCompleted;
        task.completedAt = previousCompletedAt;
        task.updatedAt = new Date().toISOString();
        persistData();
        updateChrome();
        renderView();
        toast("تم التراجع عن آخر تغيير.", { type: "success" });
      }
    });
  }

  async function deleteTask(taskId) {
    const task = state.data.tasks.find(function (item) { return item.id === taskId; });
    if (!task) return;
    const confirmed = await askConfirm({
      title: "حذف المهمة؟",
      message: "سيتم حذف «" + task.title + "» نهائيًا. لا يمكن التراجع عن هذا الإجراء.",
      confirmLabel: "حذف المهمة",
      icon: "trash"
    });
    if (!confirmed) return;
    state.data.tasks = state.data.tasks.filter(function (item) { return item.id !== taskId; });
    persistData();
    closeNotifications();
    updateChrome();
    renderView();
    toast("تم حذف المهمة.", { type: "success" });
  }

  /* ---------- الملف الشخصي وكلمة المرور ---------- */
  function setFormFeedback(element, message, isSuccess) {
    if (!element) return;
    element.className = "form-feedback " + (isSuccess ? "is-success" : "is-error");
    element.textContent = message;
  }

  function handleProfileSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const feedback = $("#profile-feedback", form);
    if (feedback) { feedback.className = "form-feedback"; feedback.textContent = ""; }
    const name = form.elements.name.value.trim();
    const email = normalizeEmail(form.elements.email.value);
    if (name.length < 2) {
      setFormFeedback(feedback, "اكتب اسمًا صحيحًا (حرفان على الأقل).");
      form.elements.name.focus();
      return;
    }
    if (!state.user.isDemo && !isValidEmail(email)) {
      setFormFeedback(feedback, "أدخل بريدًا إلكترونيًا صحيحًا.");
      form.elements.email.focus();
      return;
    }
    const users = getUsers();
    const finalEmail = state.user.isDemo ? state.user.email : email;
    const duplicate = users.some(function (user) {
      return user.id !== state.user.id && normalizeEmail(user.email) === finalEmail;
    });
    if (duplicate) {
      setFormFeedback(feedback, "هذا البريد مرتبط بحساب آخر على هذا الجهاز.");
      form.elements.email.focus();
      return;
    }
    state.user.name = name;
    state.user.email = finalEmail;
    state.user.updatedAt = new Date().toISOString();
    const updatedUsers = users.map(function (user) { return user.id === state.user.id ? state.user : user; });
    if (!saveUsers(updatedUsers)) {
      setFormFeedback(feedback, "تعذّر حفظ التغييرات في التخزين المحلي.");
      return;
    }
    updateChrome();
    renderView();
    toast("تم تحديث بيانات حسابك.", { type: "success" });
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const feedback = $("#password-feedback", form);
    if (feedback) { feedback.className = "form-feedback"; feedback.textContent = ""; }
    const current = form.elements.current_password.value;
    const next = form.elements.new_password.value;
    const confirm = form.elements.confirm_password.value;
    if (!current) {
      setFormFeedback(feedback, "أدخل كلمة المرور الحالية.");
      form.elements.current_password.focus();
      return;
    }
    if (next.length < 8) {
      setFormFeedback(feedback, "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.");
      form.elements.new_password.focus();
      return;
    }
    if (next !== confirm) {
      setFormFeedback(feedback, "كلمتا المرور الجديدتان غير متطابقتين.");
      form.elements.confirm_password.focus();
      return;
    }
    if (next === current) {
      setFormFeedback(feedback, "اختر كلمة مرور جديدة مختلفة عن الحالية.");
      form.elements.new_password.focus();
      return;
    }
    const submitButton = $('button[type="submit"]', form);
    setButtonLoading(submitButton, true);
    try {
      const ok = await verifyPassword(current, state.user);
      if (!ok) {
        setFormFeedback(feedback, "كلمة المرور الحالية غير صحيحة.");
        form.elements.current_password.focus();
        return;
      }
      const hash = await createPasswordHash(next);
      state.user.salt = hash.salt;
      state.user.passwordHash = hash.passwordHash;
      state.user.updatedAt = new Date().toISOString();
      const users = getUsers().map(function (user) { return user.id === state.user.id ? state.user : user; });
      if (!saveUsers(users)) {
        setFormFeedback(feedback, "تعذّر حفظ كلمة المرور في التخزين المحلي.");
        return;
      }
      form.reset();
      toast("تم تحديث كلمة المرور بنجاح.", { type: "success" });
    } catch (error) {
      setFormFeedback(feedback, "تعذّر تحديث كلمة المرور. حاول مرة أخرى.");
    } finally {
      setButtonLoading(submitButton, false);
    }
  }

  /* ---------- النسخ الاحتياطي ---------- */
  function exportBackup() {
    if (!state.user || !state.data) return;
    const payload = {
      app: "مثمر",
      format: "muthmir-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: { name: state.user.name, email: state.user.email },
      tasks: state.data.tasks
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "muthmir-backup-" + todayKey() + ".json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
      toast("تم تجهيز النسخة الاحتياطية وتنزيلها.", { type: "success" });
    } catch (error) {
      toast("تعذّر إنشاء النسخة الاحتياطية.", { type: "error" });
    }
  }

  function triggerImport() {
    const input = $("#import-file");
    if (input) input.click();
  }

  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("read-error")); };
      reader.readAsText(file, "utf-8");
    });
  }

  function sanitizeImportedTask(raw) {
    if (!raw || typeof raw !== "object" || typeof raw.title !== "string") return null;
    const title = raw.title.trim().slice(0, 140);
    if (!title) return null;
    const priority = PRIORITIES[raw.priority] ? raw.priority : "medium";
    const category = CATEGORIES[raw.category] ? raw.category : "other";
    const dueDate = isValidDateKey(raw.dueDate) ? raw.dueDate : "";
    const dueTime = dueDate && /^\d{2}:\d{2}$/.test(raw.dueTime || "") ? raw.dueTime : "";
    const reminder = REMINDER_OPTIONS.some(function (option) { return option.value && option.value === String(raw.reminder); })
      ? String(raw.reminder) : "";
    const completed = !!raw.completed;
    let completedAt = null;
    if (completed) {
      const parsed = raw.completedAt ? new Date(raw.completedAt) : new Date();
      completedAt = Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
    }
    const createdAtRaw = raw.createdAt ? new Date(raw.createdAt) : new Date();
    const createdAt = Number.isNaN(createdAtRaw.getTime()) ? new Date().toISOString() : createdAtRaw.toISOString();
    return {
      id: uid("t"),
      title: title,
      notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 900) : "",
      priority: priority,
      category: category,
      dueDate: dueDate,
      dueTime: dueTime,
      reminder: reminder,
      reminderSentAt: null,
      completed: completed,
      completedAt: completedAt,
      createdAt: createdAt,
      updatedAt: new Date().toISOString(),
      order: Number(raw.order) || 0
    };
  }

  async function handleImportFile(file) {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast("حجم الملف كبير جدًا. الحد الأقصى 3 ميغابايت.", { type: "error" });
      return;
    }
    try {
      const text = await readFileText(file);
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.tasks)) throw new Error("invalid");
      if (parsed.tasks.length > 2000) throw new Error("too-many");
      const imported = parsed.tasks.map(sanitizeImportedTask).filter(Boolean);
      if (parsed.tasks.length && !imported.length) throw new Error("empty");
      const confirmed = await askConfirm({
        title: "استيراد النسخة الاحتياطية؟",
        message: "سيتم استبدال " + state.data.tasks.length + " مهمة حالية بـ " + imported.length + " مهمة من الملف. لا يمكن التراجع.",
        confirmLabel: "استيراد واستبدال",
        icon: "upload",
        danger: false
      });
      if (!confirmed) return;
      state.data.tasks = imported;
      persistData();
      closeNotifications();
      updateChrome();
      renderView();
      toast("تم استيراد " + imported.length + " مهمة بنجاح.", { type: "success" });
    } catch (error) {
      toast("تعذّر استيراد الملف. تأكد أنه نسخة احتياطية صحيحة من مثمر.", { type: "error" });
    }
  }

  async function clearCompletedTasks() {
    const completed = state.data.tasks.filter(function (task) { return task.completed; });
    if (!completed.length) {
      toast("لا توجد مهام مكتملة لمسحها.", { type: "error" });
      return;
    }
    const confirmed = await askConfirm({
      title: "مسح المهام المكتملة؟",
      message: "سيتم حذف " + completed.length + " مهمة مكتملة نهائيًا. المهام قيد الإنجاز ستبقى كما هي.",
      confirmLabel: "مسح المهام",
      icon: "trash"
    });
    if (!confirmed) return;
    state.data.tasks = state.data.tasks.filter(function (task) { return !task.completed; });
    persistData();
    updateChrome();
    renderView();
    toast("تم مسح المهام المكتملة.", { type: "success" });
  }

  async function deleteAccount() {
    const confirmed = await askConfirm({
      title: "حذف الحساب نهائيًا؟",
      message: "سيتم حذف حسابك وكل مهامك وإعداداتك من هذا الجهاز. لا يمكن التراجع عن هذا الإجراء.",
      confirmLabel: "حذف حسابي",
      icon: "trash"
    });
    if (!confirmed) return;
    const userId = state.user.id;
    const users = getUsers().filter(function (user) { return user.id !== userId; });
    if (!saveUsers(users)) {
      toast("تعذّر حذف الحساب. حاول مرة أخرى.", { type: "error" });
      return;
    }
    safeStoreRemove(localStorage, userDataKey(userId));
    stopEngines();
    clearSessions();
    if (pendingTaskRender) { clearTimeout(pendingTaskRender); pendingTaskRender = null; }
    state.user = null;
    state.data = null;
    state.view = "today";
    state.search = "";
    closeNotifications();
    closeSidebar();
    els.workspace.hidden = true;
    els.authScreen.hidden = false;
    if (els.searchInput) els.searchInput.value = "";
    updateSearchClear();
    state.authMode = "login";
    renderAuth("login");
    document.title = "مثمر — مساحتك لإنجاز ما يهم";
    window.scrollTo({ top: 0, behavior: "auto" });
    toast("تم حذف حسابك وبياناته. نتمنى أن نراك مرة أخرى.", { type: "success" });
  }

  /* ---------- الأحداث ---------- */
  function bindStaticEvents() {
    if (els.menuBtn) els.menuBtn.addEventListener("click", openSidebar);
    if (els.sidebarClose) els.sidebarClose.addEventListener("click", closeSidebar);
    if (els.sidebarScrim) els.sidebarScrim.addEventListener("click", closeSidebar);
    if (els.logoutBtn) els.logoutBtn.addEventListener("click", signOut);
    if (els.notifBtn) {
      els.notifBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        toggleNotifications();
      });
    }
    if (els.searchInput) {
      els.searchInput.addEventListener("input", function () {
        state.search = els.searchInput.value;
        updateSearchClear();
        renderView();
      });
      els.searchInput.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          event.preventDefault();
          clearSearch();
        }
      });
    }
    if (els.searchClear) {
      els.searchClear.addEventListener("click", function () {
        clearSearch();
        if (els.searchInput) els.searchInput.focus();
      });
    }
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("change", handleDocumentChange);
    document.addEventListener("submit", handleDocumentSubmit);
    document.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("storage", handleStorageSync);
  }

  function clearSearch() {
    state.search = "";
    if (els.searchInput) els.searchInput.value = "";
    updateSearchClear();
    renderView();
  }

  function handleDocumentClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (!target.closest(".notif-wrap") && els.notifPanel && !els.notifPanel.hidden) closeNotifications();

    const nav = target.closest("[data-nav]");
    if (nav) {
      event.preventDefault();
      navigateTo(nav.getAttribute("data-nav"));
      return;
    }

    const addButton = target.closest("[data-add-task]");
    if (addButton) {
      event.preventDefault();
      closeNotifications();
      openTaskModal();
      return;
    }

    const editButton = target.closest("[data-edit-task]");
    if (editButton) {
      event.preventDefault();
      closeNotifications();
      openTaskModal(editButton.getAttribute("data-edit-task"));
      return;
    }

    const deleteButton = target.closest("[data-delete-task]");
    if (deleteButton) {
      event.preventDefault();
      deleteTask(deleteButton.getAttribute("data-delete-task"));
      return;
    }

    const checkButton = target.closest("[data-check-task]");
    if (checkButton) {
      event.preventDefault();
      toggleTaskCompletion(checkButton.getAttribute("data-check-task"));
      return;
    }

    const priorityButton = target.closest("[data-priority-filter]");
    if (priorityButton) {
      event.preventDefault();
      state.priority = priorityButton.getAttribute("data-priority-filter");
      renderView();
      return;
    }

    const resetButton = target.closest("[data-reset-filters]");
    if (resetButton) {
      event.preventDefault();
      state.priority = "all";
      state.category = "all";
      state.sort = "priority";
      renderView();
      return;
    }

    const clearButton = target.closest("[data-clear-search]");
    if (clearButton) {
      event.preventDefault();
      clearSearch();
      return;
    }

    const notifSettings = target.closest("[data-notif-settings]");
    if (notifSettings) {
      event.preventDefault();
      closeNotifications();
      navigateTo("settings");
      return;
    }

    const enableNotifications = target.closest("[data-enable-notifications]");
    if (enableNotifications) {
      event.preventDefault();
      enableBrowserNotifications(enableNotifications);
      return;
    }

    const exportButton = target.closest("[data-export-backup]");
    if (exportButton) {
      event.preventDefault();
      exportBackup();
      return;
    }

    const importButton = target.closest("[data-import-backup]");
    if (importButton) {
      event.preventDefault();
      triggerImport();
      return;
    }

    const clearCompletedButton = target.closest("[data-clear-completed]");
    if (clearCompletedButton) {
      event.preventDefault();
      if (!clearCompletedButton.disabled) clearCompletedTasks();
      return;
    }

    const deleteAccountButton = target.closest("[data-delete-account]");
    if (deleteAccountButton) {
      event.preventDefault();
      deleteAccount();
    }
  }

  function handleDocumentChange(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.matches("[data-category-filter]")) {
      state.category = target.value;
      renderView();
      return;
    }
    if (target.matches("[data-sort]")) {
      state.sort = target.value;
      renderView();
      return;
    }
    if (target.id === "import-file") {
      const file = target.files && target.files[0];
      target.value = "";
      if (file) handleImportFile(file);
    }
  }

  function handleDocumentSubmit(event) {
    if (event.target.id === "settings-profile-form") {
      event.preventDefault();
      handleProfileSubmit(event);
    } else if (event.target.id === "settings-password-form") {
      event.preventDefault();
      handlePasswordSubmit(event);
    }
  }

  function handleGlobalKeydown(event) {
    if (activeModal) return;
    if (event.key === "Escape") {
      if (els.notifPanel && !els.notifPanel.hidden) {
        closeNotifications();
        return;
      }
      if (els.sidebar && els.sidebar.classList.contains("is-open")) {
        closeSidebar();
        return;
      }
    }
    if (!state.user) return;
    const target = event.target;
    const isTyping = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
    if (isTyping) return;
    if (event.key === "/" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
      event.preventDefault();
      if (els.searchInput) els.searchInput.focus();
      return;
    }
    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      openTaskModal();
    }
  }

  function handleStorageSync(event) {
    if (!state.user || !event.key) return;
    if (event.key === userDataKey(state.user.id) && event.newValue) {
      try {
        state.data = normalizeData(JSON.parse(event.newValue));
        updateChrome();
        renderView();
      } catch (error) { /* تجاهل البيانات التالفة */ }
      return;
    }
    if (event.key === KEYS.users) {
      const users = getUsers();
      const current = users.find(function (user) { return user.id === state.user.id; });
      if (!current) {
        signOut();
      } else {
        state.user = current;
        updateChrome();
      }
    }
  }

  /* ---------- التشغيل ---------- */
  function init() {
    els = {
      authScreen: $("#auth-screen"),
      authRoot: $("#auth-root"),
      workspace: $("#workspace"),
      sidebar: $("#sidebar"),
      sidebarScrim: $("#sidebar-scrim"),
      sidebarClose: $("#sidebar-close"),
      menuBtn: $("#menu-btn"),
      logoutBtn: $("#logout-btn"),
      notifBtn: $("#notif-btn"),
      notifPanel: $("#notif-panel"),
      notifBadge: $("#notif-badge"),
      searchInput: $("#global-search"),
      searchClear: $("#search-clear"),
      viewRoot: $("#view-root"),
      toastRoot: $("#toast-root")
    };
    bindStaticEvents();
    if (!restoreSession()) {
      els.workspace.hidden = true;
      els.authScreen.hidden = false;
      renderAuth("login");
    }
    if (els.searchInput) {
      els.searchInput.setAttribute("autocomplete", "off");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();



