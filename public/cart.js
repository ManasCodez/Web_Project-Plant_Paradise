/* One shared cart for Shop and checkout. Only IDs and quantities are persisted. */
window.PlantCart = (() => {
  const key = 'plantParadiseCart';
  function read() {
    try {
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(rows)) return [];
      return rows
        .filter(
          (i) =>
            i &&
            typeof i.productId === 'string' &&
            i.productId.length < 128 &&
            Number.isInteger(i.quantity) &&
            i.quantity > 0 &&
            i.quantity <= 1000,
        )
        .slice(0, 100);
    } catch {
      return [];
    }
  }
  function write(items) {
    localStorage.setItem(key, JSON.stringify(items));
  }
  function clear() {
    localStorage.removeItem(key);
  }
  return { read, write, clear };
})();
