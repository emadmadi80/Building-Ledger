(function () {
  'use strict';

  var PREFS_KEY = 'bld-backup-preferences-v2';
  var HISTORY_KEY = 'bld-backup-history-v2';
  var ROLLBACK_KEY = 'bld-backup-rollback-v2';
  var DEVICE_KEY = 'bld-device-v2';
  var APP = 'building-ledger';
  var VERSION = 2;
  var timer = null;
  var escapeHtml = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var clone = function (value) {
    return JSON.parse(JSON.stringify(value));
  };
  var now = function () { return Date.now(); };
  var current = function () { return window.S || null; };
  var hasData = function (state) {
    return !!state && ((state.units || []).length || (state.pay || []).length || (state.exp || []).length || (state.deps || []).length);
  };
  var readJson = function (key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  };
  var writeJson = function (key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  };
  var makeId = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'device-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  };
  var getDevice = function () {
    var device = readJson(DEVICE_KEY, null);
    if (!device || !device.id) {
      device = { id: makeId(), name: 'جهاز دفتر العمارة', createdAt: now() };
      writeJson(DEVICE_KEY, device);
    }
    return device;
  };
  var setDevice = function (name) {
    var device = getDevice();
    device.name = String(name || '').trim().slice(0, 80) || 'جهاز دفتر العمارة';
    writeJson(DEVICE_KEY, device);
    return device;
  };
  var defaultPrefs = function () {
    return { enabled: false, time: '21:15', intervalHours: 24, includeReceiptImages: true, pending: false, changedAt: 0, lastAutoAt: 0, lastLocalAt: 0, lastError: '' };
  };
  var getPrefs = function () {
    var saved = readJson(PREFS_KEY, {});
    var p = Object.assign(defaultPrefs(), saved || {});
    p.intervalHours = [1, 3, 12, 24, 72].indexOf(+p.intervalHours) >= 0 ? +p.intervalHours : 24;
    p.includeReceiptImages = p.includeReceiptImages !== false;
    p.time = /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time) ? p.time : '21:15';
    p.enabled = !!p.enabled;
    return p;
  };
  var savePrefs = function (prefs) {
    var next = Object.assign(defaultPrefs(), prefs || {});
    writeJson(PREFS_KEY, next);
    return next;
  };
  var counts = function (state) {
    return { units: (state.units || []).length, payments: (state.pay || []).length, expenses: (state.exp || []).length, deposits: (state.deps || []).length, exceptional: (state.xc || []).length };
  };
  var countText = function (state) {
    var c = counts(state);
    return c.units + ' وحدة، ' + c.payments + ' دفعة، ' + c.expenses + ' مصروف';
  };
  var cleanState = function (state, includeReceiptImages) {
    var copy = clone(state || {});
    delete copy._backup;
    delete copy._driveToken;
    delete copy._scriptToken;
    if (includeReceiptImages === false) (copy.exp || []).forEach(function (expense) { if (expense.receipts) expense.receipts = expense.receipts.map(function (r) { return { id: r.id, name: r.name, type: r.type, size: r.size, status: r.status || 'local', driveFileId: r.driveFileId || '', addedAt: r.addedAt || 0 }; }); });
    return copy;
  };
  var connectionSettings = function () {
    return {
      googleDrive: window.DriveBackup && window.DriveBackup.getBackupSettings ? window.DriveBackup.getBackupSettings() : {},
      appsScript: window.ScriptBackup && window.ScriptBackup.getBackupSettings ? window.ScriptBackup.getBackupSettings() : {},
      note: 'لا تتضمن النسخة الرموز السرية أو OAuth access token. أعد إدخالها يدويًا بعد الاسترجاع.'
    };
  };
  var buildBackup = function (options) {
    var state = current();
    if (!state) throw new Error('لم تُحمّل بيانات الدفتر بعد');
    var p = getPrefs();
    var includeReceipts = options && typeof options.includeReceiptImages === 'boolean' ? options.includeReceiptImages : p.includeReceiptImages;
    return {
      format: APP + '-backup',
      version: VERSION,
      app: APP,
      exportedAt: new Date().toISOString(),
      device: clone(getDevice()),
      preferences: { automatic: p.enabled, time: p.time, intervalHours: p.intervalHours },
      connections: connectionSettings(),
      counts: counts(state),
      state: cleanState(state, includeReceipts),
      receiptImagesIncluded: includeReceipts
    };
  };
  var validDate = function (value) { return !value || (/^\d{4}-\d\d-\d\d$/.test(value) && value >= '2000-01-01' && value <= new Date().toISOString().slice(0, 10)); };
  var finiteMoney = function (value) { return value === '' || value == null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12); };
  var validateState = function (state) {
    if (!state || !Array.isArray(state.units) || !Array.isArray(state.pay) || !Array.isArray(state.exp)) return 'النسخة لا تحتوي على قوائم الدفتر الأساسية.';
    if (state.units.length > 10000 || state.pay.length > 100000 || state.exp.length > 100000) return 'حجم النسخة أكبر من الحد الآمن للاسترجاع.';
    if (!finiteMoney(state.open) || !Number.isFinite(+state.n)) return 'الرصيد الافتتاحي أو عداد السجلات غير صالح.';
    var ids = {};
    var checkId = function (item) {
      if (!item || !Number.isInteger(+item.id) || +item.id < 1 || ids[item.id]) return false;
      ids[item.id] = true;
      return true;
    };
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (!checkId(u) || typeof u.name !== 'string' || !finiteMoney(u.fee) || !finiteMoney(u.debt) || !finiteMoney(u.con)) return 'بيانات الوحدات أو مبالغها غير صالحة.';
      if (!Array.isArray(u.phones || []) || !Array.isArray(u.emails || [])) return 'بيانات الاتصال في إحدى الوحدات غير صالحة.';
    }
    var checkMovement = function (item, kind) {
      if (!checkId(item) || !finiteMoney(item.a) || !validDate(item.d)) return 'يوجد مبلغ أو تاريخ غير صالح في ' + kind + '.';
      if (item.a === '' || item.a == null || +item.a <= 0) return 'يوجد مبلغ غير موجب في ' + kind + '.';
      return '';
    };
    for (var j = 0; j < state.pay.length; j++) {
      var payError = checkMovement(state.pay[j], 'الدفعات');
      if (payError || !state.units.some(function (u) { return u.id === state.pay[j].u; })) return payError || 'دفعة مرتبطة بوحدة غير موجودة.';
    }
    for (var k = 0; k < state.exp.length; k++) {
      var expError = checkMovement(state.exp[k], 'المصروفات');
      if (expError) return expError;
    }
    (state.deps || []).forEach(function (d) {
      if (!checkId(d) || !finiteMoney(d.amount) || !finiteMoney(d.rate) || !/^\d{4}-\d\d$/.test(d.start || '')) throw new Error('بيانات الودائع أو الفائدة غير صالحة.');
    });
    (state.dl || []).forEach(function (entry) {
      if (!checkId(entry) || !finiteMoney(entry.a) || !validDate(entry.d)) throw new Error('سجل الفائدة يحتوي على مبلغ أو تاريخ غير صالح.');
    });
    (state.xm || []).forEach(function (entry) {
      if (!checkId(entry) || !finiteMoney(entry.a) || !validDate(entry.d)) throw new Error('سجل الترحيل يحتوي على مبلغ أو تاريخ غير صالح.');
    });
    return '';
  };
  var normalize = function (raw) {
    var payload = raw && raw.state ? raw : { format: 'legacy-raw-ledger', version: 1, app: APP, exportedAt: new Date().toISOString(), device: { id: 'legacy', name: 'نسخة قديمة' }, state: raw };
    var error;
    try { error = validateState(payload.state); } catch (e) { error = e.message || 'بيانات النسخة غير صالحة.'; }
    if (error) throw new Error(error);
    return { payload: payload, state: cleanState(payload.state), sourceDevice: payload.device || { name: 'غير معروف' } };
  };
  var history = function () { return readJson(HISTORY_KEY, []); };
  var addHistory = function (entry) {
    var list = history();
    list.unshift(Object.assign({ at: now(), device: getDevice().name }, entry));
    writeJson(HISTORY_KEY, list.slice(0, 20));
  };
  var localReminderDue = function () {
    var state = current(), p = getPrefs();
    if (!hasData(state)) return false;
    var last = state && state.bk ? state.bk : (p.lastLocalAt || state.cr || 0);
    return !!last && now() - last >= 604800000 && !((state.snz || 0) > now());
  };
  var localBackupText = function () {
    var state = current(), last = state && state.bk ? state.bk : 0;
    return last ? 'آخر نسخة محلية: ' + new Date(last).toLocaleDateString('ar-EG') : 'لم تُحفظ نسخة محلية بعد';
  };
  var markChanged = function () {
    var p = getPrefs();
    p.pending = true;
    p.changedAt = now();
    savePrefs(p);
    clearTimeout(timer);
    timer = setTimeout(checkDue, 1400);
  };
  var schedulePush = function () { markChanged(); };
  var dueNow = function () {
    var p = getPrefs(), d = new Date(), parts = p.time.split(':').map(Number), scheduled = new Date(d.getFullYear(), d.getMonth(), d.getDate(), parts[0], parts[1], 0, 0).getTime();
    if (!p.enabled || !p.pending || !hasData(current())) return false;
    if (now() < scheduled && !p.lastAutoAt) return false;
    if (!p.lastAutoAt) return true;
    return now() - p.lastAutoAt >= p.intervalHours * 3600000;
  };
  var checkDue = function () {
    if (!dueNow()) return Promise.resolve(false);
    var p = getPrefs();
    var drive = window.DriveBackup && window.DriveBackup.canAuto && window.DriveBackup.canAuto();
    var script = window.ScriptBackup && window.ScriptBackup.canAuto && window.ScriptBackup.canAuto();
    var adapter = drive ? window.DriveBackup : script ? window.ScriptBackup : null;
    if (!adapter || !adapter.autoUpload) return Promise.resolve(false);
    var includeReceipts = !!(drive && window.DriveBackup.getBackupSettings && window.DriveBackup.getBackupSettings().uploadReceipts);
    return adapter.autoUpload(buildBackup({ includeReceiptImages: includeReceipts })).then(function () {
      p = getPrefs(); p.pending = false; p.lastAutoAt = now(); p.lastError = ''; savePrefs(p); return true;
    }).catch(function (error) {
      p = getPrefs(); p.lastError = error && error.message ? error.message : 'تعذّر تنفيذ النسخة التلقائية'; savePrefs(p); return false;
    });
  };
  var download = function () {
    var state = current();
    if (!state) return;
    try {
      state.bk = now();
      state.snz = 0;
      if (window.localSave) window.localSave();
      var data = JSON.stringify(buildBackup(), null, 2);
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: 'application/json;charset=utf-8' }));
      a.download = 'building-ledger-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      var p = getPrefs(); p.lastLocalAt = now(); p.pending = false; savePrefs(p);
      addHistory({ type: 'local-export', status: 'success', counts: counts(state) });
      if (window.toast) window.toast('تم تنزيل نسخة JSON كاملة');
      if (window.view) window.view();
    } catch (e) { if (window.toast) window.toast(e.message || 'تعذّر إنشاء النسخة'); }
  };
  var applyRestore = function (prepared) {
    var old = current();
    writeJson(ROLLBACK_KEY, { savedAt: now(), device: getDevice(), state: cleanState(old) });
    var base = window.seed ? window.seed() : {};
    window.S = Object.assign(base, prepared.state);
    window.S.upd = now();
    if (window.localSave) window.localSave();
    var p = getPrefs(); p.pending = true; p.lastError = ''; savePrefs(p);
    if (prepared.payload && prepared.payload.connections) {
      if (window.DriveBackup && window.DriveBackup.applyBackupSettings) window.DriveBackup.applyBackupSettings(prepared.payload.connections.googleDrive || {});
      if (window.ScriptBackup && window.ScriptBackup.applyBackupSettings) window.ScriptBackup.applyBackupSettings(prepared.payload.connections.appsScript || {});
    }
    addHistory({ type: 'restore', status: 'success', sourceDevice: prepared.sourceDevice, counts: counts(prepared.state) });
    if (window.view) window.view();
    if (window.closeS) window.closeS();
    if (window.toast) window.toast('تم الاسترجاع مع حفظ نسخة تراجع');
  };
  var handleRaw = function (raw) {
    var prepared;
    try { prepared = normalize(raw); } catch (e) { if (window.toast) window.toast(e.message || 'الملف ليس نسخة صالحة'); return; }
    var c = counts(prepared.state);
    var source = prepared.sourceDevice && (prepared.sourceDevice.name || prepared.sourceDevice.id) || 'غير معروف';
    var message = 'سيتم استبدال بيانات الدفتر الحالية ببيانات من ' + escapeHtml(source) + ': ' + c.units + ' وحدة، ' + c.payments + ' دفعة، ' + c.expenses + ' مصروف. ستُحفظ نسخة تراجع قبل الاستبدال.';
    if (window.ask) window.ask('مراجعة الاسترجاع', message, 'نعم، استرجع بعد حفظ نسخة التراجع', function () { applyRestore(prepared); });
    else applyRestore(prepared);
  };
  var handleFile = function (file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { try { handleRaw(JSON.parse(reader.result)); } catch (_) { if (window.toast) window.toast('الملف ليس JSON صالحًا'); } };
    reader.readAsText(file);
  };
  var restoreRollback = function () {
    var saved = readJson(ROLLBACK_KEY, null);
    if (!saved || !saved.state) { if (window.toast) window.toast('لا توجد نسخة تراجع محفوظة'); return; }
    try { normalize({ state: saved.state, device: saved.device }); } catch (e) { if (window.toast) window.toast(e.message); return; }
    if (window.ask) window.ask('استرجاع نسخة التراجع', 'سيتم استعادة النسخة التي حُفظت قبل آخر استرجاع.', 'نعم، استرجع نسخة التراجع', function () { applyRestore({ state: saved.state, sourceDevice: saved.device || { name: 'نسخة التراجع' } }); });
  };
  var openSettings = function () {
    var p = getPrefs(), d = getDevice();
    if (!window.sheet) return;
    window.sheet('<h2 style="margin-top:0">إعدادات النسخ التلقائية</h2>' +
      '<p class="hint">تعمل النسخ التلقائية أثناء فتح التطبيق فقط. لن تُفتح نافذة تفويض Google تلقائيًا.</p>' +
      '<label>اسم هذا الجهاز</label><input id="bk_device" maxlength="80" value="' + escapeHtml(d.name) + '">' +
      '<label style="display:flex;gap:8px;align-items:center"><input id="bk_enabled" type="checkbox" style="width:auto"' + (p.enabled ? ' checked' : '') + '> تفعيل النسخ التلقائية</label>' +
      '<label style="display:flex;gap:8px;align-items:center"><input id="bk_receipts" type="checkbox" style="width:auto"' + (p.includeReceiptImages ? ' checked' : '') + '> تضمين صور الفواتير داخل نسخة JSON</label>' +
      '<label>وقت المحاولة (بتوقيت الجهاز)</label><input id="bk_time" type="time" value="' + p.time + '">' +
      '<label>الفاصل بين النسخ</label><select id="bk_interval"><option value="1"' + (p.intervalHours === 1 ? ' selected' : '') + '>كل ساعة</option><option value="3"' + (p.intervalHours === 3 ? ' selected' : '') + '>كل 3 ساعات</option><option value="12"' + (p.intervalHours === 12 ? ' selected' : '') + '>كل 12 ساعة</option><option value="24"' + (p.intervalHours === 24 ? ' selected' : '') + '>كل 24 ساعة</option><option value="72"' + (p.intervalHours === 72 ? ' selected' : '') + '>كل 3 أيام</option></select>' +
      '<div class="note">' + (p.pending ? 'هناك تغييرات تنتظر نسخة تلقائية.' : 'لا توجد تغييرات معلقة حاليًا.') + '</div>' +
      '<button class="btn" data-a="backupSaveSettings">حفظ الإعدادات</button><button class="btn g" data-a="bkOut">تنزيل نسخة JSON الآن</button>');
  };
  var saveSettings = function () {
    var p = getPrefs();
    var name = document.querySelector('#bk_device').value;
    setDevice(name);
    p.enabled = !!document.querySelector('#bk_enabled').checked;
    p.time = document.querySelector('#bk_time').value || '21:15';
    p.intervalHours = +document.querySelector('#bk_interval').value || 24;
    p.includeReceiptImages = !!document.querySelector('#bk_receipts').checked;
    savePrefs(p);
    if (window.closeS) window.closeS();
    if (window.view) window.view();
    if (window.toast) window.toast('تم حفظ إعدادات النسخ التلقائية');
    checkDue();
  };
  var openHistory = function () {
    var list = history();
    var rollback = readJson(ROLLBACK_KEY, null);
    var rows = list.length ? list.map(function (item) { return '<div class="li" style="cursor:default"><div class="m"><b>' + escapeHtml(item.type === 'restore' ? 'استرجاع' : item.type === 'drive-upload' ? 'نسخة Google Drive' : item.type === 'script-upload' ? 'نسخة Apps Script' : 'نسخة محلية') + '</b><small>' + new Date(item.at).toLocaleString('ar-EG') + ' · ' + (item.counts ? item.counts.units + ' وحدة، ' + item.counts.expenses + ' مصروف' : '') + '</small></div><span class="tag ' + (item.status === 'success' ? 't-ok' : 't-no') + '">' + (item.status === 'success' ? 'نجاح' : 'خطأ') + '</span></div>'; }).join('') : '<div class="empty">لا يوجد سجل نسخ بعد.</div>';
    window.sheet('<h2 style="margin-top:0">سجل النسخ</h2><div class="card">' + rows + '</div>' + (rollback ? '<button class="btn d" data-a="bkRollback">استرجاع نسخة ما قبل آخر استرجاع</button>' : '') + '<button class="btn g" data-a="close">إغلاق</button>');
  };
  var cardHtml = function () {
    var p = getPrefs(), d = getDevice(), rollback = !!readJson(ROLLBACK_KEY, null), historyCount = history().length;
    return '<div class="card backup-card more-action-card"><div class="backup-head"><div><b>نسخة الدفتر المحلية</b><div class="hint">' + escapeHtml(localBackupText()) + ' · الجهاز: ' + escapeHtml(d.name) + '</div></div><span class="tag ' + (p.pending ? 't-mid' : 't-ok') + '">' + (p.pending ? 'تغيير معلّق' : 'محدّثة') + '</span></div><p class="hint">JSON كامل ومتوافق مع النسخ القديمة، مع تحقق مالي ونسخة تراجع قبل الاسترجاع.</p><div class="row more-actions"><button class="btn g" data-a="bkOut">تنزيل JSON</button><label class="btn g" for="fj">استرجاع</label><input type="file" class="hid" id="fj" accept=".json,application/json"></div><div class="more-actions"><button class="btn g" data-a="backupSettings">إعدادات النسخ التلقائية</button><button class="btn g" data-a="bkHistory">سجل النسخ (' + historyCount + ')</button></div>' + (rollback ? '<p class="hint">توجد نسخة تراجع محفوظة ويمكن استعادتها من سجل النسخ.</p>' : '') + '</div>';
  };
  var init = function () {
    getDevice(); getPrefs();
    window.addEventListener('online', checkDue);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { checkDue(); if (window.remind) window.remind(); } });
    setInterval(checkDue, 15 * 60 * 1000);
    setTimeout(checkDue, 1800);
  };

  window.LedgerBackup = { VERSION: VERSION, buildBackup: buildBackup, handleFile: handleFile, handleRaw: handleRaw, download: download, openSettings: openSettings, saveSettings: saveSettings, openHistory: openHistory, restoreRollback: restoreRollback, cardHtml: cardHtml, getPrefs: getPrefs, savePrefs: savePrefs, getDevice: getDevice, setDevice: setDevice, localReminderDue: localReminderDue, localBackupText: localBackupText, checkDue: checkDue, init: init, onLedgerChange: schedulePush };
  window.schedPush = schedulePush;
})();
