(function () {
  'use strict';
  var MAX_FILES = 2;
  var MAX_BYTES = 2 * 1024 * 1024;
  var MAX_WIDTH = 1000;
  var TARGET = 300 * 1024;
  var QUALITY = 0.3;
  var EXT = /\.(jpe?g|png|img|heic|webp)$/i;
  var draft = { items: [], processing: false, error: '' };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var copy = function (items) { return (items || []).map(function (x) { return Object.assign({}, x); }); };
  var statusText = function (x) { return x.status === 'uploaded' ? 'مرفوعة' : x.status === 'needs-upload' ? 'تحتاج للرفع' : 'محلية'; };
  var statusClass = function (x) { return x.status === 'uploaded' ? 't-ok' : x.status === 'needs-upload' ? 't-mid' : 't-bal'; };
  var ext = function (name) { var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; };
  var field = function (existing) {
    return '<div class="receipt-field"><label>صور الفاتورة (حتى صورتين)</label><p class="hint">الصيغ: JPG/JPEG وPNG وIMG وHEIC وWebP. الحد الأقصى للصورة قبل الضغط 2 ميجابايت، وسيتم ضغطها تلقائيًا إلى عرض 1000px وجودة 30% تقريبًا وحجم مستهدف أقل من 300 كيلوبايت.</p><input id="e_receipts" type="file" accept=".jpg,.jpeg,.png,.img,.heic,.webp,image/jpeg,image/png,image/webp,image/heic" multiple capture="environment"><div id="receipt_preview"></div></div>';
  };
  var readImage = function (file) {
    return new Promise(function (resolve, reject) {
      if (file.size > MAX_BYTES) { reject(new Error('حجم صورة الفاتورة أكبر من 2 ميجابايت: ' + file.name)); return; }
      if (!EXT.test(file.name)) { reject(new Error('صيغة غير مدعومة: ' + file.name)); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var scale = Math.min(1, MAX_WIDTH / img.naturalWidth), canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          var ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var q = QUALITY, data = canvas.toDataURL('image/jpeg', q);
          while (data.length * 0.75 > TARGET && q > 0.12) { q = Math.max(0.12, q - 0.06); data = canvas.toDataURL('image/jpeg', q); }
          URL.revokeObjectURL(url);
          resolve({ id: 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7), name: file.name, type: 'image/jpeg', size: Math.round(data.length * 0.75), width: canvas.width, height: canvas.height, quality: q, data: data, status: window.DriveBackup && window.DriveBackup.getBackupSettings && window.DriveBackup.getBackupSettings().uploadReceipts ? 'needs-upload' : 'local', addedAt: Date.now() });
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('تعذّر قراءة الصورة ' + file.name + '؛ قد لا يدعم المتصفح ترميز HEIC. حوّلها إلى JPG أو PNG ثم أعد المحاولة.')); };
      img.src = url;
    });
  };
  var render = function () {
    var box = document.querySelector('#receipt_preview'); if (!box) return;
    box.innerHTML = draft.error ? '<div class="note receipt-error">' + esc(draft.error) + '</div>' : '';
    if (draft.processing) box.innerHTML += '<p class="hint">جارٍ ضغط صور الفواتير...</p>';
    box.innerHTML += draft.items.map(function (x, i) { return '<div class="receipt-item">' + (x.data ? '<img src="' + x.data + '" alt="معاينة فاتورة">' : '<span class="receipt-missing">بدون بيانات الصورة</span>') + '<div class="receipt-meta"><b>' + esc(x.name || 'صورة فاتورة') + '</b><small>' + Math.round((x.size || 0) / 1024) + ' ك.ب · ' + statusText(x) + '</small></div><button type="button" class="mini t-no" data-receipt-remove="' + i + '">حذف</button></div>'; }).join('');
  };
  var mount = function (existing) { draft = { items: copy(existing), processing: false, error: '' }; render(); };
  var add = function (files) {
    var list = Array.prototype.slice.call(files || []), room = MAX_FILES - draft.items.length;
    draft.error = '';
    if (!list.length) return;
    if (window.toast) window.toast('يمكن إضافة صورتين فقط لكل مصروف، والحد الأقصى للصورة قبل الضغط 2 ميجابايت.');
    if (list.length > room) { draft.error = 'يمكن إضافة صورتين فقط لكل مصروف. تم تجاهل الصور الزائدة.'; list = list.slice(0, room); }
    if (!list.length) { render(); return; }
    draft.processing = true; render();
    list.reduce(function (chain, file) { return chain.then(function () { return readImage(file).then(function (item) { draft.items.push(item); }, function (e) { draft.error = e.message; }); }); }, Promise.resolve()).then(function () { draft.processing = false; render(); });
  };
  var get = function () { return copy(draft.items); };
  var ready = function () { return !draft.processing; };
  var gallery = function (items) {
    return (items || []).length ? '<div class="receipt-gallery">' + items.map(function (x) { return x.data ? '<a href="' + x.data + '" target="_blank" rel="noopener"><img src="' + x.data + '" alt="صورة فاتورة"><span class="tag ' + statusClass(x) + '">' + statusText(x) + '</span></a>' : '<span class="receipt-missing">' + esc(x.name || 'صورة بلا بيانات') + '<span class="tag ' + statusClass(x) + '">' + statusText(x) + '</span></span>'; }).join('') + '</div>' : '<p class="hint">لا توجد صور فاتورة.</p>';
  };
  document.addEventListener('change', function (e) { if (e.target.id === 'e_receipts') { add(e.target.files); e.target.value = ''; } });
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-receipt-remove]'); if (!b) return; draft.items.splice(+b.dataset.receiptRemove, 1); draft.error = ''; render(); });
  window.ReceiptImages = { MAX_FILES: MAX_FILES, MAX_BYTES: MAX_BYTES, TARGET: TARGET, QUALITY: QUALITY, field: field, mount: mount, get: get, ready: ready, gallery: gallery, statusText: statusText };
})();
