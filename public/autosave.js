// Serialize writes and retain edits made while an older snapshot is being saved.
export function createAutosave({ initial, getValue, write, canSave = () => true, onState = () => {}, delay = 800 }) {
  let savedJSON = JSON.stringify(initial);
  let busy = false;
  let timer = null;
  const dirty = () => JSON.stringify(getValue()) !== savedJSON;
  function cancelTimer() { clearTimeout(timer); timer = null; }
  function changed() {
    cancelTimer();
    if (!dirty()) { onState(busy ? 'saving' : 'saved'); return; }
    if (!canSave(getValue())) { onState('blocked'); return; }
    onState(busy ? 'saving' : 'pending');
    timer = setTimeout(flush, delay);
  }
  async function flush() {
    cancelTimer();
    if (busy || !dirty()) return false;
    const snapshotJSON = JSON.stringify(getValue());
    const snapshot = JSON.parse(snapshotJSON);
    if (!canSave(snapshot)) { onState('blocked'); return false; }
    busy = true;
    onState('saving');
    try {
      await write(snapshot);
      savedJSON = snapshotJSON;
    } catch (error) {
      busy = false;
      cancelTimer();
      // No endless network retries; a new edit, online event or Retry can resume.
      onState('error', error);
      return false;
    }
    busy = false;
    if (dirty()) changed();
    else onState('saved');
    return true;
  }
  return { changed, flush, cancel: cancelTimer, get savedJSON() { return savedJSON; }, get busy() { return busy; } };
}
