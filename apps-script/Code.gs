const APP_NAME = 'building-ledger';
const ROOT_FOLDER = 'Building Ledger Backups';
const SYNC_FILE = 'sync-state.json';
const MAX_SNAPSHOT_BYTES = 9000000;

/**
 * Building Ledger / Masroof-style synchronization service.
 *
 * Deploy this separate project as a Web app. Put SCRIPT_AUTH_TOKEN in
 * Project Settings > Script properties. The browser sends the token in the
 * POST body; it is never placed in a URL or inside a backup snapshot.
 *
 * Supported POST actions:
 *   ping     - authenticated connection and trigger status
 *   pull     - download the current shared server snapshot
 *   push     - upload only when it is newer than the server snapshot
 *   sync     - bidirectional last-updated synchronization
 *   upload   - compatibility alias for sync plus a device-specific latest file
 *   history  - list dated server archives
 *   archive  - manually archive the current shared snapshot
 *
 * Run installArchiveTrigger() once manually from the Apps Script editor.
 * It replaces any previous archive trigger and schedules one near 21:15 in
 * the Apps Script project timezone. The trigger archives the latest snapshot
 * already received; it does not read a browser that is closed.
 */

function doGet() {
  return json_({
    ok: true,
    app: APP_NAME,
    service: 'Building Ledger bidirectional sync',
    actions: ['ping', 'pull', 'push', 'sync', 'upload', 'history', 'archive'],
    triggerInstalled: triggerInstalled_(),
    timezone: Session.getScriptTimeZone()
  });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    authenticate_(body.authToken);
    const action = String(body.action || 'ping');
    if (action === 'ping') return json_(ping_());
    if (action === 'pull') return json_(pull_());
    if (action === 'push') return json_(push_(body));
    if (action === 'sync') return json_(sync_(body));
    if (action === 'upload') return json_(upload_(body));
    if (action === 'history') return json_(history_());
    if (action === 'archive') return json_(archiveNow_());
    throw new Error('Unsupported action: ' + action);
  } catch (error) {
    return json_({ ok: false, error: error && error.message ? error.message : 'Request failed' });
  }
}

function authenticate_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('SCRIPT_AUTH_TOKEN');
  if (!expected || !token || token !== expected) throw new Error('Unauthorized');
}

function ping_() {
  const state = readSync_();
  const props = PropertiesService.getScriptProperties();
  return {
    ok: true,
    app: APP_NAME,
    triggerInstalled: triggerInstalled_(),
    serverUpdatedAt: state ? state.updatedAt : 0,
    serverDevice: state ? state.device : null,
    lastArchive: Number(props.getProperty('LAST_ARCHIVE') || 0),
    lastDevice: props.getProperty('LAST_DEVICE') || ''
  };
}

function pull_() {
  const state = readSync_();
  return response_(state, 'download', false);
}

function push_(body) {
  return LockService.getScriptLock().tryLock(30000) ? pushLocked_(body, true) : errorResult_('The sync service is busy; try again.');
}

function sync_(body) {
  return LockService.getScriptLock().tryLock(30000) ? pushLocked_(body, false) : errorResult_('The sync service is busy; try again.');
}

function pushLocked_(body, strictPush) {
  try {
    const incoming = validateSnapshot_(body.snapshot);
    const current = readSync_();
    const incomingAt = updatedAt_(incoming, body.clientUpdatedAt);
    const serverAt = current ? Number(current.updatedAt || 0) : 0;

    if (!current || incomingAt > serverAt) {
      const saved = saveShared_(incoming, body.device, incomingAt);
      return response_(saved, 'accepted', true);
    }

    if (incomingAt < serverAt) {
      return response_(current, strictPush ? 'conflict' : 'download', false);
    }

    const same = current && JSON.stringify(current.snapshot) === JSON.stringify(incoming);
    if (same) return response_(current, 'unchanged', false);

    // Equal timestamps with different content are not silently overwritten.
    return response_(current, 'conflict', false);
  } finally {
    LockService.getScriptLock().releaseLock();
  }
}

function upload_(body) {
  const result = sync_(body);
  if (result.ok && (result.direction === 'accepted' || result.direction === 'unchanged')) {
    const device = body.device || (body.snapshot && body.snapshot.device) || {};
    storeDeviceLatest_(body.snapshot, device);
    result.lastArchive = Number(PropertiesService.getScriptProperties().getProperty('LAST_ARCHIVE') || 0);
  }
  return result;
}

function saveShared_(snapshot, device, updatedAt) {
  const root = rootFolder_();
  const state = {
    app: APP_NAME,
    updatedAt: Number(updatedAt || Date.now()),
    device: safeDevice_(device || snapshot.device || {}),
    snapshot: snapshot
  };
  upsert_(root, SYNC_FILE, JSON.stringify(state, null, 2));
  PropertiesService.getScriptProperties().setProperty('LAST_DEVICE', state.device.id);
  return state;
}

function response_(state, direction, accepted) {
  return {
    ok: true,
    app: APP_NAME,
    direction: direction,
    accepted: !!accepted,
    serverUpdatedAt: state ? Number(state.updatedAt || 0) : 0,
    serverDevice: state ? state.device : null,
    snapshot: state ? state.snapshot : null,
    lastArchive: Number(PropertiesService.getScriptProperties().getProperty('LAST_ARCHIVE') || 0)
  };
}

function validateSnapshot_(snapshot) {
  if (!snapshot || snapshot.format !== APP_NAME + '-backup' || Number(snapshot.version) !== 2 || !snapshot.state) {
    throw new Error('Invalid Building Ledger snapshot');
  }
  const text = JSON.stringify(snapshot);
  if (text.length > MAX_SNAPSHOT_BYTES) throw new Error('Snapshot is too large');
  if (typeof snapshot.state !== 'object') throw new Error('Snapshot state is invalid');
  return snapshot;
}

function updatedAt_(snapshot, supplied) {
  const value = Number(supplied || (snapshot.state && snapshot.state.upd) || snapshot.exportedAt || 0);
  return isFinite(value) && value > 0 ? value : Date.now();
}

function safeDevice_(device) {
  const id = String(device.id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  const name = String(device.name || id).replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
  return { id: id || 'unknown', name: name || id };
}

function storeDeviceLatest_(snapshot, device) {
  const d = safeDevice_(device || snapshot.device || {});
  const folder = deviceFolder_(d.id, d.name);
  upsert_(folder, 'latest.json', JSON.stringify({ app: APP_NAME, updatedAt: updatedAt_(snapshot), device: d, snapshot: snapshot }, null, 2));
}

function history_() {
  const root = rootFolder_();
  const files = root.getFiles();
  const rows = [];
  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().indexOf('archive-') !== 0) continue;
    rows.push({ name: file.getName(), id: file.getId(), createdAt: file.getDateCreated().getTime(), size: file.getSize() });
  }
  rows.sort(function(a, b) { return b.createdAt - a.createdAt; });
  return { ok: true, app: APP_NAME, archives: rows.slice(0, 100), lastArchive: Number(PropertiesService.getScriptProperties().getProperty('LAST_ARCHIVE') || 0) };
}

function archiveNow_() {
  return LockService.getScriptLock().tryLock(30000) ? archiveLocked_() : errorResult_('The sync service is busy; try again.');
}

function archiveLatest_() {
  const result = archiveNow_();
  if (!result.ok) throw new Error(result.error);
}

function archiveLocked_() {
  try {
    const state = readSync_();
    if (!state || !state.snapshot) return { ok: true, app: APP_NAME, archived: false, message: 'No shared snapshot has been uploaded yet.' };
    const root = rootFolder_();
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
    const file = root.createFile('archive-' + stamp + '.json', JSON.stringify(state, null, 2), MimeType.PLAIN_TEXT);
    const at = Date.now();
    PropertiesService.getScriptProperties().setProperty('LAST_ARCHIVE', String(at));
    return { ok: true, app: APP_NAME, archived: true, fileId: file.getId(), lastArchive: at, serverUpdatedAt: state.updatedAt };
  } finally {
    LockService.getScriptLock().releaseLock();
  }
}

function installArchiveTrigger() {
  ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'archiveLatest_';
  }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('archiveLatest_').timeBased().atHour(21).nearMinute(15).everyDays(1).create();
  return 'Building Ledger sync/archive trigger installed near 21:15';
}

function triggerInstalled_() {
  return ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'archiveLatest_'; });
}

function readSync_() {
  const file = findFile_(rootFolder_(), SYNC_FILE);
  if (!file) return null;
  try { return JSON.parse(file.getBlob().getDataAsString()); } catch (error) { throw new Error('Shared sync file is invalid'); }
}

function rootFolder_() {
  const folders = DriveApp.getFoldersByName(ROOT_FOLDER);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(ROOT_FOLDER);
}

function deviceFolder_(deviceId, deviceName) {
  const root = rootFolder_();
  const name = deviceId + ' - ' + deviceName;
  const folders = root.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : root.createFolder(name);
}

function findFile_(folder, name) {
  const files = folder.getFilesByName(name);
  return files.hasNext() ? files.next() : null;
}

function upsert_(folder, name, contents) {
  const file = findFile_(folder, name);
  if (file) { file.setContent(contents); return file; }
  return folder.createFile(name, contents, MimeType.PLAIN_TEXT);
}

function errorResult_(message) {
  return { ok: false, app: APP_NAME, error: message };
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
