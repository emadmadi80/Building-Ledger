(function () {
  'use strict';
  var CONFIG_KEY = 'bld-drive-config-v2';
  var config = null;
  var session = { token: '', expiresAt: 0, connectedAt: 0, lastFile: null, lastSuccess: 0, lastError: '' };
  var esc = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var read = function () { try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); } catch (_) { return {}; } };
  var write = function () { localStorage.setItem(CONFIG_KEY, JSON.stringify({ clientId: config.clientId || '', uploadReceipts: !!config.uploadReceipts })); };
  var getConfig = function () { if (!config) config = Object.assign({ clientId: '', uploadReceipts: false }, read()); return config; };
  var getBackupSettings = function () { var c = getConfig(); return { clientId: c.clientId || '', uploadReceipts: !!c.uploadReceipts, configured: !!c.clientId, connected: !!(session.token && session.expiresAt > Date.now() + 30000) }; };
  var applyBackupSettings = function (settings) { settings = settings || {}; var c = getConfig(); if (typeof settings.clientId === 'string') c.clientId = settings.clientId.trim(); if (typeof settings.uploadReceipts === 'boolean') c.uploadReceipts = settings.uploadReceipts; write(); if (window.view) window.view(); };
  var redirectUri = function () { return window.location.origin + window.location.pathname; };
  var origin = function () { return window.location.origin; };
  var statusText = function () {
    getConfig();
    if (!config.clientId) return 'لم يُضف معرّف Google OAuth بعد';
    if (!session.token || session.expiresAt <= Date.now()) return 'مُعدّ، ويحتاج اتصالًا من هذا المتصفح';
    return 'متصل مؤقتًا حتى ' + new Date(session.expiresAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };
  var request = function (url, options) {
    options = options || {};
    options.headers = Object.assign({ Authorization: 'Bearer ' + session.token }, options.headers || {});
    return fetch(url, options).then(function (response) {
      if (!response.ok) return response.text().then(function (text) { throw new Error('Google Drive (' + response.status + '): ' + (text || response.statusText)); });
      return response;
    });
  };
  var authorize = function () {
    getConfig();
    if (!config.clientId) { openConfig(); return Promise.reject(new Error('أدخل معرّف OAuth أولًا')); }
    var url = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + encodeURIComponent(config.clientId) + '&redirect_uri=' + encodeURIComponent(redirectUri()) + '&response_type=token&scope=' + encodeURIComponent('https://www.googleapis.com/auth/drive.appdata') + '&include_granted_scopes=true&prompt=consent';
    var popup = window.open(url, 'buildingLedgerGoogle', 'width=520,height=700,menubar=no,toolbar=no');
    if (!popup) return Promise.reject(new Error('سمح للمتصفح بالنوافذ المنبثقة ثم أعد المحاولة.'));
    return new Promise(function (resolve, reject) {
      var timer = setInterval(function () { if (popup.closed) { clearInterval(timer); reject(new Error('أُغلقت نافذة Google قبل اكتمال التفويض.')); } }, 500);
      var done = function (event) {
        if (event.origin !== window.location.origin || !event.data || event.data.type !== 'bld-drive-token') return;
        clearInterval(timer); window.removeEventListener('message', done);
        session.token = event.data.token; session.expiresAt = Date.now() + Math.max(60, +event.data.expiresIn || 3600) * 1000; session.connectedAt = Date.now(); session.lastError = '';
        resolve(true);
      };
      window.addEventListener('message', done);
    });
  };
  var consumeHash = function () {
    var hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    if (!hash.get('access_token') || !window.opener) return;
    window.opener.postMessage({ type: 'bld-drive-token', token: hash.get('access_token'), expiresIn: hash.get('expires_in') || 3600 }, window.location.origin);
    window.close();
  };
  consumeHash();
  var saveConfig = function () {
    var previous = getConfig().clientId;
    config = { clientId: (document.querySelector('#drive_client_id').value || '').trim(), uploadReceipts: !!document.querySelector('#drive_upload_receipts').checked };
    if (config.uploadReceipts && window.S && window.S.exp) { window.S.exp.forEach(function (x) { (x.receipts || []).forEach(function (r) { if (r.data && r.status !== 'uploaded') r.status = 'needs-upload'; }); }); if (window.localSave) window.localSave(); }
    if (previous !== config.clientId) { session.token = ''; session.expiresAt = 0; session.lastFile = null; session.lastSuccess = 0; session.lastError = ''; }
    write();
    if (window.closeS) window.closeS();
    if (window.view) window.view();
    if (window.toast) window.toast(config.clientId ? 'تم حفظ معرّف Google OAuth' : 'أضف معرّف OAuth للاتصال');
  };
  var connect = function () {
    return authorize().then(function () { if (window.view) window.view(); if (window.toast) window.toast('تم الاتصال بـ Google مؤقتًا'); }).catch(function (e) { session.lastError = e.message; if (window.view) window.view(); if (window.toast) window.toast(e.message); throw e; });
  };
  var openConfig = function () {
    getConfig();
    window.sheet('<h2 style="margin-top:0">Google Drive</h2><p class="hint">خطأ <b>redirect_uri_mismatch</b> يعني أن Google لم يجد عنوان العودة هذا في إعدادات OAuth. في Google Cloud Console افتح OAuth Client ID ثم أضف العنوان كاملًا تحت <b>Authorized redirect URIs</b> (ليس Authorized JavaScript origins فقط).</p><label>عنوان العودة المطلوب (انسخه كما هو)</label><input id="drive_redirect_uri" dir="ltr" readonly value="' + esc(redirectUri()) + '"><button class="btn g" data-a="driveCopyRedirect">نسخ عنوان العودة</button><label>OAuth Client ID</label><input id="drive_client_id" dir="ltr" value="' + esc(config.clientId) + '" placeholder="123...apps.googleusercontent.com"><label style="display:flex;gap:8px;align-items:center"><input id="drive_upload_receipts" type="checkbox" style="width:auto"' + (config.uploadReceipts ? ' checked' : '') + '> رفع صور الفواتير تلقائيًا مع نسخة Google Drive</label><p class="hint">تُرفع الصور المضغوطة ضمن نسخة Drive الموثقة، وتتحول حالتها إلى مرفوعة بعد نجاح القراءة الراجعة.</p><button class="btn" data-a="driveSaveConfig">حفظ الإعداد</button><button class="btn g" data-a="driveConnect">حفظ والاتصال الآن</button><button class="btn g" data-a="close">إغلاق</button>');
  };
  var multipart = function (metadata, content) {
    var boundary = 'bldledger-' + Math.random().toString(16).slice(2);
    var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify(content) + '\r\n--' + boundary + '--';
    return { body: body, contentType: 'multipart/related; boundary=' + boundary };
  };
  var upload = function (backup, automatic) {
    if (!canAuto()) return Promise.reject(new Error('Google Drive غير متصل أو انتهت صلاحية التفويض.'));
    var device = window.LedgerBackup.getDevice();
    var name = 'building-ledger-' + device.id + '-latest.json';
    var packet = multipart({ name: name, parents: ['appDataFolder'], mimeType: 'application/json', appProperties: { app: 'building-ledger', version: '2', deviceId: device.id, deviceName: device.name } }, backup);
    return request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,modifiedTime,appProperties', { method: 'POST', headers: { 'Content-Type': packet.contentType }, body: packet.body }).then(function (response) { return response.json(); }).then(function (file) {
      return request('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media').then(function (response) { return response.json(); }).then(function (roundTrip) {
        if (!roundTrip || roundTrip.format !== 'building-ledger-backup' || roundTrip.version !== 2 || !roundTrip.state) throw new Error('تم الرفع لكن تعذّر التحقق من القراءة الراجعة.');
        session.lastFile = file; session.lastSuccess = Date.now(); session.lastError = '';
        if (getConfig().uploadReceipts && backup && backup.state && backup.state.exp) { var sent = {}; backup.state.exp.forEach(function (x) { sent[x.id] = x; }); (window.S.exp || []).forEach(function (x) { if (sent[x.id] && x.receipts) x.receipts.forEach(function (r) { if (r.data) { r.status = 'uploaded'; r.driveFileId = file.id; } }); }); if (window.localSave) window.localSave(); }
        try { localStorage.setItem('bld-drive-last-v2', JSON.stringify({ file: file, at: session.lastSuccess, automatic: !!automatic })); } catch (_) {}
        if (window.view && !automatic) window.view();
        if (window.toast && !automatic) window.toast('تم حفظ النسخة في Google Drive والتحقق منها');
        return file;
      });
    }).catch(function (e) { session.lastError = e.message; if (window.view) window.view(); throw e; });
  };
  var list = function () {
    if (!canAuto()) { if (window.toast) window.toast('اتصل بـ Google أولًا'); return; }
    var q = encodeURIComponent("'appDataFolder' in parents and trashed = false and appProperties has { key = 'app' and value = 'building-ledger' }");
    request('https://www.googleapis.com/drive/v3/files?q=' + q + '&spaces=appDataFolder&orderBy=modifiedTime desc&pageSize=30&fields=files(id,name,size,modifiedTime,appProperties)').then(function (response) { return response.json(); }).then(function (data) {
      var files = data.files || [];
      var html = files.length ? files.map(function (file) { var meta = file.appProperties || {}; return '<div class="li" style="cursor:default"><div class="m"><b>' + esc(meta.deviceName || 'جهاز غير مسمى') + '</b><small>' + esc(file.name) + ' · ' + new Date(file.modifiedTime).toLocaleString('ar-EG') + '</small></div><button class="mini t-ok" data-a="driveRestore" data-v="' + esc(file.id) + '">مراجعة</button></div>'; }).join('') : '<div class="empty">لا توجد نسخ Building Ledger في مجلد التطبيق.</div>';
      window.sheet('<h2 style="margin-top:0">نسخ Google Drive</h2><p class="hint">تظهر النسخ المعزولة لهذا التطبيق فقط. ستراجع اسم الجهاز وعدد السجلات قبل الاستبدال.</p><div class="card">' + html + '</div><button class="btn g" data-a="close">إغلاق</button>');
    }).catch(function (e) { session.lastError = e.message; if (window.view) window.view(); if (window.toast) window.toast(e.message); });
  };
  var restore = function (id) {
    request('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media').then(function (response) { return response.json(); }).then(function (payload) { window.LedgerBackup.handleRaw(payload); }).catch(function (e) { session.lastError = e.message; if (window.toast) window.toast(e.message); });
  };
  var canAuto = function () { return !!(session.token && session.expiresAt > Date.now() + 30000 && getConfig().clientId); };
  var cardHtml = function () {
    getConfig();
    var saved = {}; try { saved = JSON.parse(localStorage.getItem('bld-drive-last-v2') || '{}'); } catch (_) {}
    return '<div class="card backup-card"><div class="backup-head"><div><b>Google Drive</b><div class="hint">' + esc(statusText()) + '</div></div><span class="tag ' + (canAuto() ? 't-ok' : 't-mid') + '">' + (canAuto() ? 'متصل مؤقتًا' : 'غير متصل') + '</span></div><p class="hint">يستخدم مجلد appDataFolder وملفات Building Ledger منفصلة، مع تحقق من القراءة بعد الرفع.</p><div class="kv"><span>رفع صور الفواتير</span><b>' + (getConfig().uploadReceipts ? 'مفعّل' : 'متوقف') + '</b></div><div class="kv"><span>آخر نجاح</span><b>' + (session.lastSuccess || saved.at ? new Date(session.lastSuccess || saved.at).toLocaleString('ar-EG') : '—') + '</b></div>' + (session.lastError ? '<p class="note" style="background:var(--badb);color:var(--bad)">' + esc(session.lastError) + '</p>' : '') + '<button class="btn" data-a="driveConnect">' + (canAuto() ? 'إعادة الاتصال' : 'إعداد والاتصال') + '</button><button class="btn g" data-a="driveEditConfig">تعديل OAuth Client ID</button><button class="btn g" data-a="driveBackup">حفظ نسخة الآن</button><button class="btn g" data-a="driveList">عرض سجل Drive</button></div>';
  };
  var autoUpload = function (backup) { return upload(backup, true); };
  var copyRedirect = function () {
    var value = redirectUri();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function () { if (window.toast) window.toast('تم نسخ عنوان العودة'); }).catch(function () { if (window.toast) window.toast(value); });
    else if (window.toast) window.toast(value);
  };
  window.DriveBackup = { openConfig: openConfig, saveConfig: saveConfig, connect: connect, upload: upload, autoUpload: autoUpload, list: list, restore: restore, canAuto: canAuto, cardHtml: cardHtml, copyRedirect: copyRedirect, redirectUri: redirectUri, getBackupSettings: getBackupSettings, applyBackupSettings: applyBackupSettings };
})();
