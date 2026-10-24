/* مثمر — طبقة الاتصال الآمنة بـ Supabase (المفتاح العام فقط) */
(function () {
  "use strict";

  const config = window.MUTHMIR_SUPABASE || {};
  const url = String(config.url || "").trim().replace(/\/+$/, "");
  const anonKey = String(config.anonKey || "").trim();
  let configured = !!(
    window.supabase &&
    url &&
    anonKey &&
    !/YOUR-|PASTE|EXAMPLE/i.test(url + " " + anonKey)
  );

  let client = null;
  if (configured) {
    try {
      client = window.supabase.createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    } catch (error) {
      configured = false;
      client = null;
    }
  }

  function requireClient() {
    if (!client) throw new Error("SUPABASE_NOT_CONFIGURED");
    return client;
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
      const random = Math.random() * 16 | 0;
      const value = char === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function reminderValue(task) {
    if (task.reminder === "" || task.reminder === null || task.reminder === undefined) return null;
    const value = Number(task.reminder);
    return Number.isFinite(value) ? value : null;
  }

  function mapTask(row) {
    return {
      id: row.id,
      title: row.title || "",
      notes: row.notes || "",
      priority: row.priority || "medium",
      category: row.category || "other",
      dueDate: row.due_date || "",
      dueTime: row.due_time ? String(row.due_time).slice(0, 5) : "",
      reminder: row.reminder_minutes === null || row.reminder_minutes === undefined ? "" : String(row.reminder_minutes),
      reminderSentAt: row.reminder_sent_at || null,
      completed: !!row.completed,
      completedAt: row.completed_at || null,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
      order: Number(row.sort_order) || 0
    };
  }

  function baseRow(task) {
    return {
      title: task.title,
      notes: task.notes || "",
      priority: task.priority || "medium",
      category: task.category || "other",
      due_date: task.dueDate || null,
      due_time: task.dueTime || null,
      reminder_minutes: reminderValue(task),
      reminder_sent_at: task.reminderSentAt || null,
      completed: !!task.completed,
      completed_at: task.completedAt || null,
      sort_order: Number(task.order) || 0
    };
  }

  function insertRow(task, userId) {
    return Object.assign(baseRow(task), {
      id: task.id || uuid(),
      user_id: userId,
      created_at: task.createdAt || new Date().toISOString(),
      updated_at: task.updatedAt || new Date().toISOString()
    });
  }

  function updatePatch(task) {
    return Object.assign(baseRow(task), {
      updated_at: new Date().toISOString()
    });
  }

  function replaceRow(task) {
    return {
      id: task.id || uuid(),
      title: task.title,
      notes: task.notes || "",
      priority: task.priority || "medium",
      category: task.category || "other",
      due_date: task.dueDate || null,
      due_time: task.dueTime || null,
      reminder_minutes: reminderValue(task),
      reminder_sent_at: task.reminderSentAt || null,
      completed: !!task.completed,
      completed_at: task.completedAt || null,
      created_at: task.createdAt || new Date().toISOString(),
      sort_order: Number(task.order) || 0
    };
  }

  /* ---------- المهام ---------- */
  async function listTasks() {
    const { data, error } = await requireClient()
      .from("tasks")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(mapTask);
  }

  async function insertTask(task, userId) {
    const { data, error } = await requireClient()
      .from("tasks")
      .insert(insertRow(task, userId))
      .select()
      .single();
    if (error) throw error;
    return mapTask(data);
  }

  async function insertTasks(tasks, userId) {
    if (!tasks.length) return [];
    const rows = tasks.map(function (task) { return insertRow(task, userId); });
    const { data, error } = await requireClient().from("tasks").insert(rows).select();
    if (error) throw error;
    return (data || []).map(mapTask);
  }

  async function updateTask(task) {
    const { data, error } = await requireClient()
      .from("tasks")
      .update(updatePatch(task))
      .eq("id", task.id)
      .select()
      .single();
    if (error) throw error;
    return mapTask(data);
  }

  async function removeTask(id) {
    const { error } = await requireClient().from("tasks").delete().eq("id", id);
    if (error) throw error;
  }

  async function removeCompletedTasks() {
    const { error } = await requireClient().from("tasks").delete().eq("completed", true);
    if (error) throw error;
  }

  async function replaceTasks(tasks) {
    const payload = tasks.map(replaceRow);
    const { data, error } = await requireClient().rpc("replace_my_tasks", { p_tasks: payload });
    if (error) throw error;
    return (data || []).map(mapTask);
  }

  async function markReminderSent(id, sentAt) {
    const { error } = await requireClient()
      .from("tasks")
      .update({ reminder_sent_at: sentAt })
      .eq("id", id);
    if (error) throw error;
  }

  /* ---------- الحساب ---------- */
  async function signUp(name, email, password, redirectTo) {
    const options = { data: { full_name: name } };
    if (redirectTo) {
      const cleanRedirect = String(redirectTo).split("#")[0].split("?")[0];
      if (!/^file:/i.test(cleanRedirect)) options.emailRedirectTo = cleanRedirect;
    }
    const { data, error } = await requireClient().auth.signUp({
      email: email,
      password: password,
      options: options
    });
    if (error) throw error;
    return data;
  }

  async function signIn(email, password) {
    const { data, error } = await requireClient().auth.signInWithPassword({
      email: email,
      password: password
    });
    if (error) throw error;
    return data;
  }

  async function signInAnonymously() {
    const { data, error } = await requireClient().auth.signInAnonymously();
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await requireClient().auth.signOut();
    if (error) throw error;
  }

  async function getSession() {
    const { data, error } = await requireClient().auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  async function updateProfile(metadata) {
    const { data, error } = await requireClient().auth.updateUser({ data: metadata });
    if (error) throw error;
    return data;
  }

  async function updateEmail(email) {
    const { data, error } = await requireClient().auth.updateUser({ email: email });
    if (error) throw error;
    return data;
  }

  async function updatePassword(password) {
    const { data, error } = await requireClient().auth.updateUser({ password: password });
    if (error) throw error;
    return data;
  }

  async function deleteAccount() {
    const { error } = await requireClient().rpc("delete_my_account");
    if (error) throw error;
  }

  function onAuthStateChange(callback) {
    if (!client) return { data: { subscription: { unsubscribe: function () {} } } };
    return client.auth.onAuthStateChange(callback);
  }

  window.MuthmirAPI = {
    configured: configured,
    client: client,
    uuid: uuid,
    auth: {
      signUp: signUp,
      signIn: signIn,
      signInAnonymously: signInAnonymously,
      signOut: signOut,
      getSession: getSession,
      updateProfile: updateProfile,
      updateEmail: updateEmail,
      updatePassword: updatePassword,
      deleteAccount: deleteAccount,
      onAuthStateChange: onAuthStateChange
    },
    tasks: {
      list: listTasks,
      insert: insertTask,
      insertMany: insertTasks,
      update: updateTask,
      remove: removeTask,
      removeCompleted: removeCompletedTasks,
      replace: replaceTasks,
      markReminderSent: markReminderSent
    }
  };
})();
