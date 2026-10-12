// Loaded only by the static export. It never creates accounts or saves orders.
(() => {
  let catalogPromise;
  async function getCatalog() {
    if (!catalogPromise) catalogPromise = fetch('./catalog.json').then(response => {
      if (!response.ok) throw new Error('The preview catalog could not be loaded.');
      return response.json();
    }).catch(error => { catalogPromise = null; throw error; });
    return catalogPromise;
  }
  window.voltPreviewApi = async (path, input) => {
    if (path === '/api/auth/me') return { user: null, csrf: '' };
    if (path === '/api/products' && !input) return { products: await getCatalog() };
    if (path !== '/api/quote') throw new Error('This is a browsing preview. Accounts, selling, and orders require the full store.');
    if (!input || !Array.isArray(input.items) || !input.items.length || input.items.length > 30) throw new Error('Add at least one item to your bag.');
    const products = await getCatalog(), seen = new Set();
    const items = input.items.map(item => {
      const product = item && products.find(p => p.id === item.id);
      if (!product || seen.has(item.id)) throw new Error('Your bag contains an invalid or duplicate product.');
      seen.add(item.id);
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) throw new Error('Choose between 1 and 10 of each item.');
      if (item.quantity > product.stock) throw new Error(`${product.name} has only ${product.stock} left in the demo catalog.`);
      return { ...product, quantity: item.quantity, lineTotal: product.price * item.quantity };
    });
    const coupon = String(input.coupon || '').trim().toUpperCase();
    if (coupon && coupon !== 'VOLT10') throw new Error('That code isn’t valid. Try VOLT10 for 10% off.');
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const discount = coupon === 'VOLT10' ? Math.min(Math.round(subtotal * .1), 100000) : 0;
    const shipping = subtotal >= 299900 ? 0 : 9900;
    return { items, coupon, subtotal, discount, shipping, total: subtotal - discount + shipping, currency: 'INR', taxNote: 'Example prices for browsing only.' };
  };
})();
