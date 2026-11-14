(function () {
  'use strict';
  var CONFIG_KEY = 'bld-script-config-v2';
  var config = null;
  var esc = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var read = function () { try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); } catch (_) { return {}; } };
  var write = function () { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); };
  var get = function () { if (!config) config = Object.assign({ endpoint: '', token: '', tested: false, uploadAfterChange: false, lastUpload: 0, lastArchive: 0, lastError: '' }, read()); return config; };
  var getBackupSettings = function () { var c = get(); return { endpoint: c.endpoint || '', uploadAfterChange: !!c.uploadAfterChange, configured: !!(c.endpoint && c.token), tested: !!c.tested }; };
  var applyBackupSettings = function (settings) { settings = settings || {}; var c = get(); if (typeof settings.endpoint === 'string') c.endpoint = settings.endpoint.trim(); if (typeof settings.uploadAfterChange === 'boolean') c.uploadAfterChange = settings.uploadAfterChange; c.tested = false; write(); if (window.view) window.view(); };
  var validEndpoint = function () { return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test((get().endpoint || '').trim()); };
  var call = function (action, backup) {
    var c = get();
    if (!validEndpoint() || !c.token) return Promise.reject(new Error('أدخل رابط Apps Script المنشور ورمز المصادقة أولًا.'));
    var body = { action: action, authToken: c.token, device: window.LedgerBackup.getDevice(), snapshot: backup || null };
    // text/plain is intentional: application/json triggers an OPTIONS preflight,
    // which Apps Script Web Apps do not answer reliably. Apps Script still
    // receives the JSON string in e.postData.contents and parses it server-side.
    return fetch(c.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(function (response) {
      return response.text().then(function (text) {
        var json = {}; try { json = text ? JSON.parse(text) : {}; } catch (_) { throw new Error('Apps Script لم يُرجع JSON. تأكد من نشر Web App بوصول Anyone with the link وتحديث deployment.'); }
        if (!response.ok || json.ok === false) throw new Error(json.error || 'تعذّر الاتصال بـ Apps Script.');
        return json;
      });
    }).catch(function (error) {
      if (error && error.name === 'TypeError') throw new Error('فشل الاتصال بالـ Web App. غالبًا رابط /exec قديم أو النشر ليس Anyone with the link، أو أن إعداد CORS لم يُقبل. أعد نشر Web App ثم استخدم رابط /exec الجديد.');
      throw error;
    });
  };
  var saveConfig = function (testAfter) {
    var c = get();
    c.endpoint = (document.querySelector('#script_endpoint').value || '').trim();
    c.token = (document.querySelector('#script_token').value || '').trim();
    c.uploadAfterChange = !!document.querySelector('#script_after_change').checked;
    c.tested = false;
    c.lastError = '';
    write();
    if (window.closeS) window.closeS();
    if (window.view) window.view();
    return testAfter ? test() : (window.toast ? window.toast('تم حفظ إعداد Apps Script، ويجب اختباره قبل اعتباره نشطًا') : null);
  };
  var openConfig = function () {
    var c = get();
    window.sheet('<h2 style="margin-top:0">Apps Script للنسخ المؤتمتة</h2><p class="hint">أنشئ مشروعًا منفصلًا من الملف المرفق في <b>apps-script/Code.gs</b>، انشره كتطبيق ويب، ثم ضع رابط /exec ورمزًا محفوظًا في Script Properties. لا تستخدم ملفات Masrouf.</p><label>رابط Web App المنشور</label><input id="script_endpoint" dir="ltr" value="' + esc(c.endpoint) + '" placeholder="https://script.google.com/macros/s/.../exec"><label>رمز المصادقة</label><input id="script_token" type="password" dir="ltr" value="' + esc(c.token) + '" placeholder="يُرسل في جسم الطلب فقط"><label style="display:flex;gap:8px;align-items:center"><input id="script_after_change" type="checkbox" style="width:auto"' + (c.uploadAfterChange ? ' checked' : '') + '> رفع نسخة بعد التغييرات عندما يكون التطبيق مفتوحًا</label><button class="btn" data-a="scriptTestSave">حفظ واختبار الاتصال</button><button class="btn g" data-a="close">إغلاق</button><div class="note">تظل الأرشفة المجدولة غير نشطة حتى تنشر السكربت وتوافق على الصلاحيات وتثبت Trigger الأرشفة من داخل حساب Google.</div>');
  };
  var test = function () {
    return call('ping').then(function () { var c = get(); c.tested = true; c.lastError = ''; write(); if (window.view) window.view(); if (window.toast) window.toast('تم اختبار Apps Script بنجاح'); }).catch(function (e) { var c = get(); c.tested = false; c.lastError = e.message; write(); if (window.view) window.view(); if (window.toast) window.toast(e.message); throw e; });
  };
  var upload = function (backup, automatic) {
    var c = get();
    if (!c.tested) return Promise.reject(new Error('اختبر اتصال Apps Script قبل الرفع.'));
    return call('upload', backup).then(function (result) { c.lastUpload = Date.now(); c.lastArchive = result.lastArchive || c.lastArchive || 0; c.lastError = ''; write(); if (window.view && !automatic) window.view(); if (window.toast && !automatic) window.toast('تم رفع النسخة إلى Apps Script'); return result; }).catch(function (e) { c.lastError = e.message; write(); if (window.view) window.view(); throw e; });
  };
  var applyRemote = function (result) {
    if (result && result.snapshot && (result.direction === 'download' || result.direction === 'conflict')) {
      if (window.LedgerBackup && window.LedgerBackup.handleRaw) window.LedgerBackup.handleRaw(result.snapshot);
      return result;
    }
    if (window.view) window.view();
    if (window.toast) window.toast(result && result.direction === 'accepted' ? 'تمت مزامنة التغييرات إلى الخادم' : 'لا توجد تغييرات أحدث للمزامنة');
    return result;
  };
  var syncNow = function () {
    var c = get();
    if (!c.tested) return Promise.reject(new Error('اختبر اتصال Apps Script قبل المزامنة.'));
    return call('sync', window.LedgerBackup.buildBackup()).then(applyRemote).catch(function (e) { c.lastError = e.message; write(); if (window.view) window.view(); if (window.toast) window.toast(e.message); throw e; });
  };
  var pull = function () {
    var c = get();
    if (!c.tested) return Promise.reject(new Error('اختبر اتصال Apps Script قبل التنزيل.'));
    return call('pull').then(function (result) { if (result.snapshot && window.LedgerBackup) window.LedgerBackup.handleRaw(result.snapshot); else if (window.toast) window.toast('لا توجد نسخة مشتركة على الخادم بعد'); return result; }).catch(function (e) { c.lastError = e.message; write(); if (window.view) window.view(); if (window.toast) window.toast(e.message); throw e; });
  };
  var archive = function () {
    return call('archive').then(function (result) { var c = get(); c.lastArchive = result.lastArchive || c.lastArchive; write(); if (window.view) window.view(); if (window.toast) window.toast(result.archived ? 'تم إنشاء أرشيف خادم الآن' : 'لا توجد نسخة مشتركة لأرشفتها'); return result; });
  };
  var historyList = function () {
    return call('history').then(function (result) {
      var rows = (result.archives || []).map(function (x) { return '<div class="li" style="cursor:default"><div class="m"><b>' + esc(x.name) + '</b><small>' + new Date(x.createdAt).toLocaleString('ar-EG') + ' · ' + Math.round((x.size || 0) / 1024) + ' KB</small></div></div>'; }).join('') || '<div class="empty">لا يوجد أرشيف خادم بعد.</div>';
      if (window.sheet) window.sheet('<h2 style="margin-top:0">سجل أرشيف Apps Script</h2><div class="card">' + rows + '</div><button class="btn g" data-a="close">إغلاق</button>');
      return result;
    });
  };
  var canAuto = function () { var c = get(); return !!(c.tested && c.uploadAfterChange && validEndpoint() && c.token); };
  var autoUpload = function (backup) { return upload(backup, true); };
  var cardHtml = function () {
    var c = get();
    var state = c.tested ? 'اختُبر الاتصال' : (validEndpoint() ? 'مُعدّ ويحتاج اختبارًا' : 'غير مُعدّ');
    var archive = c.lastArchive ? new Date(c.lastArchive).toLocaleString('ar-EG') : 'غير معروف — ينتظر Trigger السكربت';
    return '<div class="card backup-card"><div class="backup-head"><div><b>Apps Script — مزامنة وأرشيف منفصل</b><div class="hint">' + esc(state) + '</div></div><span class="tag ' + (c.tested ? 't-ok' : 't-mid') + '">' + (c.tested ? 'اختبار ناجح' : 'ليس نشطًا') + '</span></div><p class="hint">مزامنة ثنائية الاتجاه: يرفع التغييرات الأحدث، وينزّل نسخة الخادم الأحدث مع نسخة تراجع قبل الاستبدال. لكل جهاز ملف latest مستقل، مع أرشيف خادم مجدول.</p><div class="kv"><span>آخر رفع من هذا الجهاز</span><b>' + (c.lastUpload ? new Date(c.lastUpload).toLocaleString('ar-EG') : '—') + '</b></div><div class="kv"><span>آخر أرشفة من الخادم</span><b>' + esc(archive) + '</b></div>' + (c.lastError ? '<p class="note" style="background:var(--badb);color:var(--bad)">' + esc(c.lastError) + '</p>' : '') + '<button class="btn" data-a="scriptConfig">إعداد واختبار</button><button class="btn g" data-a="scriptSync">مزامنة الآن</button><button class="btn g" data-a="scriptPull">تنزيل من الخادم</button><button class="btn g" data-a="scriptUpload">رفع نسخة الآن</button><button class="btn g" data-a="scriptArchive">أرشفة الآن</button><button class="btn g" data-a="scriptHistory">سجل الأرشيف</button><p class="hint">الرفع بعد التغيير: ' + (c.uploadAfterChange ? 'مفعّل' : 'متوقف') + '. الأرشيف المجدول يعمل بعد نشر السكربت وتثبيت Trigger.</p></div>';
  };
  window.ScriptBackup = { openConfig: openConfig, saveConfig: saveConfig, test: test, upload: upload, sync: syncNow, pull: pull, archive: archive, history: historyList, autoUpload: autoUpload, canAuto: canAuto, cardHtml: cardHtml, getBackupSettings: getBackupSettings, applyBackupSettings: applyBackupSettings };
})();
