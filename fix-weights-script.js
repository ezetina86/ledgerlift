// Paste this in browser DevTools console on your PHONE (where Aug 31 data lives)
// Converts Aug 31 sets from lbs to kg, then sync to backend.

const aug31Start = new Date('2026-08-31T00:00:00').getTime()
const aug31End   = aug31Start + 86400000

const req = indexedDB.open('ledgerlift')
req.onsuccess = (e) => {
  const idb = e.target.result
  const tx  = idb.transaction('sets', 'readwrite')
  const store = tx.objectStore('sets')

  store.getAll().onsuccess = (ev) => {
    const aug31Sets = ev.target.result.filter(
      s => s.timestamp >= aug31Start && s.timestamp < aug31End
    )

    if (!aug31Sets.length) {
      console.log('No sets found for Aug 31')
      return
    }

    console.table(aug31Sets.map(s => ({
      exercise: s.exerciseName,
      set: s.setNumber,
      reps: s.reps,
      weightLbs: s.weightKg,
      weightKg: +(s.weightKg / 2.20462).toFixed(2),
    })))

    if (!confirm(`Convert ${aug31Sets.length} sets from lbs → kg?`)) return

    const now = Date.now()
    aug31Sets.forEach(s => {
      const kg = +(s.weightKg / 2.20462).toFixed(2)
      store.put({ ...s, weightKg: kg, volume: +(s.reps * kg).toFixed(2), updatedAt: now })
    })

    tx.oncomplete = () => console.log('Done. Now go to Settings and tap Sync.')
    tx.onerror = (err) => console.error('Error:', err)
  }
}
req.onerror = (e) => console.error('Could not open DB:', e)
