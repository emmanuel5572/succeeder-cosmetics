let CURRENT_USER = null;

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(n) {
  return '₦' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toast(message, type = '') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast ' + type;
  setTimeout(() => el.classList.add('hidden'), 3500);
}

function openModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
}
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

function hasPerm(perm) {
  if (!CURRENT_USER) return false;
  if (CURRENT_USER.role === 'owner') return true;
  return CURRENT_USER.permissions.includes(perm);
}

// ---------------- Navigation ----------------
function setupNav() {
  document.querySelectorAll('.nav-link').forEach(link => {
    const perm = link.getAttribute('data-perm');
    const ownerOnly = link.getAttribute('data-owner-only');
    if (ownerOnly && CURRENT_USER.role !== 'owner') { link.remove(); return; }
    if (perm && !hasPerm(perm)) { link.remove(); return; }
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(link.dataset.view);
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await API.post('/auth/logout');
    window.location.href = '/index.html';
  });
}

const VIEWS = {
  dashboard: renderDashboard,
  pos: renderPOS,
  products: renderProducts,
  customers: renderCustomers,
  workers: renderWorkers,
  expenses: renderExpenses,
  reports: renderReports,
  receipts: renderReceipts,
  account: renderAccount
};

function navigate(view) {
  if (!VIEWS[view]) view = 'dashboard';
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.view === view));
  window.location.hash = view;
  VIEWS[view]();
}

// ---------------- Dashboard ----------------
async function renderDashboard() {
  const root = document.getElementById('viewRoot');
  root.innerHTML = '<p class="muted">Loading dashboard…</p>';
  try {
    const summary = hasPerm('reports:view') ? await API.get('/reports/summary?range=today') : null;
    root.innerHTML = `
      <div class="section-header"><h2>🏠 Welcome, ${escapeHtml(CURRENT_USER.name)}</h2></div>
      ${summary ? `
      <div class="grid stats">
        <div class="card stat-card"><div class="stat-icon">💰</div><div class="stat-label">Today's Revenue</div><div class="stat-value">${money(summary.revenue)}</div></div>
        <div class="card stat-card"><div class="stat-icon">🛒</div><div class="stat-label">Transactions Today</div><div class="stat-value">${summary.transactions}</div></div>
        <div class="card stat-card"><div class="stat-icon">💸</div><div class="stat-label">Expenses Today</div><div class="stat-value">${money(summary.expenses)}</div></div>
        <div class="card stat-card"><div class="stat-icon">📈</div><div class="stat-label">Gross Profit (today)</div><div class="stat-value">${money(summary.grossProfit)}</div></div>
        <div class="card stat-card"><div class="stat-icon">🏆</div><div class="stat-label">Net Profit (today)</div><div class="stat-value">${money(summary.netProfit)}</div></div>
      </div>
      ${summary.lowStock.length ? `
      <div class="low-stock-alert">
        <h3>⚠️ Low Stock Alerts</h3>
        <ul>${summary.lowStock.map(p => `<li>${escapeHtml(p.name)} — <strong>${p.stock_qty}</strong> left (threshold ${p.low_stock_threshold})</li>`).join('')}</ul>
      </div>` : ''}
      ` : `<div class="empty-state"><div class="empty-icon">🛒</div><p>Use the menu to start a sale or view your receipts.</p></div>`}
    `;
  } catch (e) {
    root.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

// ---------------- POS / Sales ----------------
let CART = [];

async function renderPOS() {
  const root = document.getElementById('viewRoot');
  root.innerHTML = '<p class="muted">Loading products…</p>';
  CART = [];
  let products = [];
  try {
    products = await API.get('/products');
  } catch (e) {
    root.innerHTML = `<p class="error">${e.message}</p>`;
    return;
  }

  root.innerHTML = `
    <div class="section-header"><h2>🛒 New Sale</h2></div>
    <div class="pos-layout">
      <div>
        <input type="text" id="posSearch" placeholder="🔍  Search products…" style="margin-bottom:12px;">
        <div class="product-pick" id="productPick"></div>
      </div>
      <div class="card">
        <h3 style="margin-top:0;">🧺 Cart</h3>
        <div id="cartLines"><div class="empty-state" style="padding:24px 0;"><div class="empty-icon">🛍️</div><p>No items yet.</p></div></div>
        <div class="cart-total"><span>Total</span><span id="cartTotal">${money(0)}</span></div>
        <label style="margin-top:12px;">💳 Payment method
          <select id="paymentMethod">
            <option value="cash">💵 Cash</option>
            <option value="card">💳 Card</option>
            <option value="transfer">🏦 Bank Transfer</option>
          </select>
        </label>
        <button class="btn primary" id="completeSaleBtn" style="margin-top:10px;">✅ Complete Sale</button>
      </div>
    </div>
  `;

  function drawTiles(filter = '') {
    const pick = document.getElementById('productPick');
    const f = filter.toLowerCase();
    const list = products.filter(p => p.name.toLowerCase().includes(f));
    pick.innerHTML = list.map(p => `
      <button class="product-tile" data-id="${p.id}" data-category="${escapeHtml((p.category||'').toLowerCase())}" ${p.stock_qty <= 0 ? 'disabled' : ''}>
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="price">${money(p.price)}</div>
        <div class="stock ${p.stock_qty <= p.low_stock_threshold && p.stock_qty > 0 ? 'low-stock' : ''}">${p.stock_qty <= 0 ? '❌ Out of stock' : p.stock_qty <= p.low_stock_threshold ? '⚠️ ' + p.stock_qty + ' left' : '✅ ' + p.stock_qty + ' in stock'}</div>
      </button>
    `).join('') || '<div class="empty-state"><div class="empty-icon">🔍</div><p>No products found.</p></div>';

    pick.querySelectorAll('.product-tile').forEach(btn => {
      btn.addEventListener('click', () => addToCart(Number(btn.dataset.id), products));
    });
  }
  drawTiles();
  document.getElementById('posSearch').addEventListener('input', (e) => drawTiles(e.target.value));

  document.getElementById('completeSaleBtn').addEventListener('click', async () => {
    if (CART.length === 0) return toast('Cart is empty.', 'error');
    try {
      const sale = await API.post('/sales', {
        items: CART.map(l => ({ product_id: l.id, quantity: l.qty })),
        payment_method: document.getElementById('paymentMethod').value
      });
      toast('Sale completed: ' + sale.receipt_number, 'success');
      showReceiptModal(sale);
      navigate('pos');
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

function addToCart(productId, products) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  const existing = CART.find(l => l.id === productId);
  if (existing) {
    if (existing.qty < product.stock_qty) existing.qty++;
    else toast('No more stock available.', 'error');
  } else {
    CART.push({ id: product.id, name: product.name, price: product.price, qty: 1, max: product.stock_qty });
  }
  drawCart();
}

function drawCart() {
  const el = document.getElementById('cartLines');
  if (!el) return;
  if (CART.length === 0) {
    el.innerHTML = '<div class="empty-state" style="padding:24px 0;"><div class="empty-icon">🛍️</div><p>No items yet.</p></div>';
  } else {
    el.innerHTML = CART.map((l, i) => `
      <div class="cart-line">
        <span>${escapeHtml(l.name)}</span>
        <span>
          <input type="number" min="1" max="${l.max}" value="${l.qty}" data-idx="${i}" class="cartQty">
          × ${money(l.price)}
        </span>
      </div>
    `).join('');
    el.querySelectorAll('.cartQty').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        let val = Number(e.target.value);
        if (val < 1) val = 1;
        if (val > CART[idx].max) val = CART[idx].max;
        CART[idx].qty = val;
        drawCart();
      });
    });
  }
  const total = CART.reduce((sum, l) => sum + l.price * l.qty, 0);
  document.getElementById('cartTotal').textContent = money(total);
}

function showReceiptModal(sale) {
  const items = (sale.items || []).map(i => `
    <tr><td>${escapeHtml(i.product_name)}</td><td>${i.quantity}</td><td>${money(i.unit_price)}</td><td>${money(i.subtotal)}</td></tr>
  `).join('');
  openModal('Receipt ' + escapeHtml(sale.receipt_number), `
    <p class="small muted">${new Date(sale.created_at).toLocaleString()}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
      <tbody>${items}</tbody>
    </table></div>
    <div class="cart-total"><span>Total</span><span>${money(sale.total)}</span></div>
    <p class="small muted">Payment: ${sale.payment_method === 'cash' ? '💵' : sale.payment_method === 'card' ? '💳' : '🏦'} ${escapeHtml(sale.payment_method)}</p>
    <button class="btn ghost" onclick="window.print()">Print</button>
  `);
}

// ---------------- Products ----------------
async function renderProducts() {
  const root = document.getElementById('viewRoot');
  root.innerHTML = '<p class="muted">Loading products…</p>';
  const canManage = hasPerm('products:manage');
  let products = [];
  try {
    products = await API.get('/products?all=1');
  } catch (e) {
    root.innerHTML = `<p class="error">${e.message}</p>`;
    return;
  }

  root.innerHTML = `
    <div class="section-header">
      <h2>🧴 Products & Inventory</h2>
      ${canManage ? '<button class="btn primary small" id="addProductBtn">➕ Add Product</button>' : ''}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th>${canManage ? '<th></th>' : ''}</tr></thead>
      <tbody>
        ${products.map(p => `
          <tr>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td><code>${escapeHtml(p.sku || '—')}</code></td>
            <td>${p.category ? `<span class="cat-chip">${escapeHtml(p.category)}</span>` : '<span class="muted">—</span>'}</td>
            <td><strong>${money(p.price)}</strong></td>
            <td>${p.stock_qty <= 0 ? `<span class="badge low">❌ 0</span>` : p.stock_qty <= p.low_stock_threshold ? `<span class="badge low">⚠️ ${p.stock_qty}</span>` : `<span class="badge ok">✅ ${p.stock_qty}</span>`}</td>
            <td>${p.active ? '<span class="badge ok">● Active</span>' : '<span class="badge low">● Inactive</span>'}</td>
            ${canManage ? `<td><button class="btn small ghost" data-edit="${p.id}">✏️ Edit</button></td>` : ''}
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;

  if (canManage) {
    document.getElementById('addProductBtn').addEventListener('click', () => productForm());
    root.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const product = products.find(p => p.id === Number(btn.dataset.edit));
        productForm(product);
      });
    });
  }
}

function productForm(product = null) {
  openModal(product ? 'Edit Product' : 'Add Product', `
    <form id="productForm">
      <label>Name<input name="name" required value="${product ? product.name : ''}"></label>
      <div class="form-row">
        <label>SKU<input name="sku" value="${product && product.sku ? product.sku : ''}"></label>
        <label>Category<input name="category" value="${product && product.category ? product.category : ''}"></label>
      </div>
      <div class="form-row">
        <label>Price<input type="number" step="0.01" name="price" required value="${product ? product.price : ''}"></label>
        <label>Cost<input type="number" step="0.01" name="cost" value="${product ? product.cost : 0}"></label>
      </div>
      <div class="form-row">
        <label>Stock quantity<input type="number" name="stock_qty" value="${product ? product.stock_qty : 0}"></label>
        <label>Low stock alert at<input type="number" name="low_stock_threshold" value="${product ? product.low_stock_threshold : 5}"></label>
      </div>
      ${product ? `<label><input type="checkbox" name="active" ${product.active ? 'checked' : ''} style="width:auto;"> Active</label>` : ''}
      <div id="productFormError" class="error hidden"></div>
      <button class="btn primary" type="submit">${product ? 'Save Changes' : 'Add Product'}</button>
    </form>
  `);

  document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.active = fd.get('active') ? 1 : 0;
    try {
      if (product) await API.put('/products/' + product.id, body);
      else await API.post('/products', body);
      closeModal();
      toast('Product saved.', 'success');
      renderProducts();
    } catch (err) {
      const box = document.getElementById('productFormError');
      box.textContent = err.message;
      box.classList.remove('hidden');
    }
  });
}

// ---------------- Customers ----------------
async function renderCustomers() {
  const root = document.getElementById('viewRoot');
  root.innerHTML = '<p class="muted">Loading customers…</p>';
  let customers = [];
  try {
    customers = await API.get('/customers');
  } catch (e) {
    root.innerHTML = `<p class="error">${e.message}</p>`;
    return;
  }
  root.innerHTML = `
    <div class="section-header"><h2>👥 Customers</h2><button class="btn primary small" id="addCustomerBtn">➕ Add Customer</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Phone</th><th>Email</th></tr></thead>
      <tbody>${customers.length ? customers.map(c => `<tr><td>👤 ${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone || '—')}</td><td>${escapeHtml(c.email || '—')}</td></tr>`).join('') : '<tr><td colspan="3"><div class="empty-state"><div class="empty-icon">👥</div><p>No customers yet.</p></div></td></tr>'}</tbody>
    </table></div>
  `;
  document.getElementById('addCustomerBtn').addEventListener('click', () => {
    openModal('Add Customer', `
      <form id="customerForm">
        <label>Name<input name="name" required></label>
        <label>Phone<input name="phone"></label>
        <label>Email<input name="email" type="email"></label>
        <label>Notes<textarea name="notes"></textarea></label>
        <button class="btn primary" type="submit">Add Customer</button>
      </form>
    `);
    document.getElementById('customerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      try {
        await API.post('/customers', body);
        closeModal();
        toast('Customer added.', 'success');
        renderCustomers();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

// ---------------- Workers ----------------
async function renderWorkers() {
  const root = document.getElementById('viewRoot');
  root.innerHTML = '<p class="muted">Loading workers…</p>';
  let workers = [];
  let permInfo = { all: [] };
  try {
    workers = await API.get('/workers');
    permInfo = await API.get('/workers/permissions');
  } catch (e) {
    root.innerHTML = `<p class="error">${e.message}</p>`;
    return;
  }

  root.innerHTML = `
    <div class="section-header"><h2>👷 Workers / Staff</h2><button class="btn primary small" id="addWorkerBtn">➕ Add Worker</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
      <tbody>${workers.map(w => `
        <tr>
          <td>👤 <strong>${escapeHtml(w.name)}</strong></td>
          <td><code>${escapeHtml(w.username)}</code></td>
          <td><span class="badge role-${escapeHtml(w.role)}">${escapeHtml(w.role)}</span></td>
          <td>${w.active ? '<span class="badge ok">● Active</span>' : '<span class="badge low">● Deactivated</span>'}</td>
          <td>
            <button class="btn small ghost" data-edit="${w.id}">✏️ Edit</button>
            <button class="btn small ghost" data-reset="${w.id}">🔑 Reset password</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  `;

  document.getElementById('addWorkerBtn').addEventListener('click', () => workerForm(null, permInfo));
  root.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = workers.find(x => x.id === Number(btn.dataset.edit));
      workerForm(w, permInfo);
    });
  });
  root.querySelectorAll('[data-reset]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const result = await API.post(`/workers/${btn.dataset.reset}/reset-password`);
        openModal('Temporary Password', `
          <p>Share this temporary password with the worker. It will not be shown again.</p>
          <p style="font-size:1.4rem; font-weight:700;">${escapeHtml(result.temporaryPassword)}</p>
        `);
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

function workerForm(worker, permInfo) {
  const role = worker ? worker.role : 'cashier';
  const currentPerms = worker ? worker.permissions : permInfo.defaults[role];
  const permCheckboxes = permInfo.all.map(p => `
    <label style="font-weight:400;"><input type="checkbox" name="permissions" value="${p}" ${currentPerms.includes(p) ? 'checked' : ''} style="width:auto;"> ${p}</label>
  `).join('');

  openModal(worker ? 'Edit Worker' : 'Add Worker', `
    <form id="workerForm">
      <label>Full name<input name="name" required value="${worker ? worker.name : ''}"></label>
      <div class="form-row">
        <label>Username<input name="username" required value="${worker ? worker.username : ''}" ${worker ? 'readonly' : ''}></label>
        <label>Email<input name="email" type="email" value="${worker && worker.email ? worker.email : ''}"></label>
      </div>
      <label>Role
        <select name="role" id="roleSelect">
          <option value="cashier" ${role === 'cashier' ? 'selected' : ''}>Cashier</option>
          <option value="manager" ${role === 'manager' ? 'selected' : ''}>Manager</option>
        </select>
      </label>
      ${!worker ? `<label>Temporary password (leave blank to auto-generate)<input name="password" type="password"></label>` : ''}
      <fieldset style="border:1px solid var(--border); border-radius:8px; padding:10px; margin-top:8px;">
        <legend class="small muted">Permissions</legend>
        ${permCheckboxes}
      </fieldset>
      ${worker ? `<label style="margin-top:10px;"><input type="checkbox" name="active" ${worker.active ? 'checked' : ''} style="width:auto;"> Active</label>` : ''}
      <div id="workerFormError" class="error hidden"></div>
      <button class="btn primary" type="submit" style="margin-top:10px;">${worker ? 'Save Changes' : 'Create Worker'}</button>
    </form>
  `);

  document.getElementById('workerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const permissions = fd.getAll('permissions');
    const body = {
      name: fd.get('name'), username: fd.get('username'), email: fd.get('email'),
      role: fd.get('role'), permissions
    };
    if (!worker) body.password = fd.get('password') || undefined;
    else body.active = fd.get('active') ? 1 : 0;

    try {
      if (worker) {
        await API.put('/workers/' + worker.id, body);
        closeModal();
        toast('Worker updated.', 'success');
        renderWorkers();
      } else {
        const result = await API.post('/workers', body);
        closeModal();
        openModal('Worker Created', `
          <p>Share these login details with <strong>${escapeHtml(result.name)}</strong>:</p>
          <p>Username: <strong>${escapeHtml(result.username)}</strong></p>
          <p>Temporary password: <strong>${escapeHtml(result.temporaryPassword)}</strong></p>
          <p class="small muted">They will be asked to set a new password on first login.</p>
        `);
        renderWorkers();
      }
    } catch (err) {
      const box = document.getElementById('workerFormError');
      box.textContent = err.message;
      box.classList.remove('hidden');
    }
  });
}

// ---------------- Expenses ----------------
async function renderExpenses() {
  const root = document.getElementById('viewRoot');
  root.innerHTML = '<p class="muted">Loading expenses…</p>';
  let expenses = [];
  try {
    expenses = await API.get('/expenses');
  } catch (e) {
    root.innerHTML = `<p class="error">${e.message}</p>`;
    return;
  }
  root.innerHTML = `
    <div class="section-header"><h2>💸 Expenses</h2><button class="btn primary small" id="addExpenseBtn">➕ Add Expense</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Description</th><th>Category</th><th>Amount</th><th>By</th><th>Date</th></tr></thead>
      <tbody>${expenses.length ? expenses.map(x => `
        <tr><td>${escapeHtml(x.description)}</td><td>${x.category ? `<span class="cat-chip">${escapeHtml(x.category)}</span>` : '<span class="muted">—</span>'}</td><td><strong>${money(x.amount)}</strong></td><td>👤 ${escapeHtml(x.created_by_name)}</td><td>${new Date(x.created_at).toLocaleDateString()}</td></tr>
      `).join('') : '<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">💸</div><p>No expenses recorded yet.</p></div></td></tr>'}</tbody>
    </table></div>
  `;
  document.getElementById('addExpenseBtn').addEventListener('click', () => {
    openModal('Add Expense', `
      <form id="expenseForm">
        <label>Description<input name="description" required></label>
        <label>Category<input name="category"></label>
        <label>Amount<input name="amount" type="number" step="0.01" required></label>
        <button class="btn primary" type="submit">Add Expense</button>
      </form>
    `);
    document.getElementById('expenseForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      try {
        await API.post('/expenses', body);
        closeModal();
        toast('Expense recorded.', 'success');
        renderExpenses();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

// ---------------- Reports ----------------
async function renderReports() {
  const root = document.getElementById('viewRoot');
  root.innerHTML = `
    <div class="section-header">
      <h2>📊 Reports</h2>
      <select id="reportRange">
        <option value="today">Today</option>
        <option value="week">Last 7 days</option>
        <option value="month">Last 30 days</option>
      </select>
    </div>
    <div id="reportBody"><p class="muted">Loading…</p></div>
  `;
  async function load(range) {
    const body = document.getElementById('reportBody');
    try {
      const s = await API.get('/reports/summary?range=' + range);
      body.innerHTML = `
        <div class="grid stats">
          <div class="card stat-card"><div class="stat-icon">💰</div><div class="stat-label">Revenue</div><div class="stat-value">${money(s.revenue)}</div></div>
          <div class="card stat-card"><div class="stat-icon">🛒</div><div class="stat-label">Transactions</div><div class="stat-value">${s.transactions}</div></div>
          <div class="card stat-card"><div class="stat-icon">💸</div><div class="stat-label">Expenses</div><div class="stat-value">${money(s.expenses)}</div></div>
          <div class="card stat-card"><div class="stat-icon">📈</div><div class="stat-label">Gross Profit</div><div class="stat-value">${money(s.grossProfit)}</div></div>
          <div class="card stat-card"><div class="stat-icon">🏆</div><div class="stat-label">Net Profit (after expenses)</div><div class="stat-value">${money(s.netProfit)}</div></div>
        </div>
        <div class="grid" style="grid-template-columns: 1fr 1fr; margin-top:16px;">
          <div class="card">
            <h3>Sales by Cashier</h3>
            <table><thead><tr><th>Cashier</th><th>Txns</th><th>Revenue</th></tr></thead>
            <tbody>${s.byCashier.map(c => `<tr><td>${escapeHtml(c.cashier)}</td><td>${c.transactions}</td><td>${money(c.revenue)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No data</td></tr>'}</tbody></table>
          </div>
          <div class="card">
            <h3>Top Products</h3>
            <table><thead><tr><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
            <tbody>${s.topProducts.map(p => `<tr><td>${escapeHtml(p.product_name)}</td><td>${p.qty_sold}</td><td>${money(p.revenue)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No data</td></tr>'}</tbody></table>
          </div>
        </div>
      `;
    } catch (e) { body.innerHTML = `<p class="error">${e.message}</p>`; }
  }
  document.getElementById('reportRange').addEventListener('change', (e) => load(e.target.value));
  load('today');
}

// ---------------- Receipts / Sale history ----------------
async function renderReceipts() {
  const root = document.getElementById('viewRoot');
  root.innerHTML = '<p class="muted">Loading history…</p>';
  let sales = [];
  try {
    sales = await API.get('/sales');
  } catch (e) {
    root.innerHTML = `<p class="error">${e.message}</p>`;
    return;
  }
  root.innerHTML = `
    <div class="section-header"><h2>🧾 Receipts / Transaction History</h2></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Receipt #</th><th>Cashier</th><th>Total</th><th>Payment</th><th>Date</th><th></th></tr></thead>
      <tbody>${sales.map(s => `
        <tr>
          <td><code>${escapeHtml(s.receipt_number)}</code></td><td>👤 ${escapeHtml(s.cashier_name)}</td><td><strong>${money(s.total)}</strong></td>
          <td>${s.payment_method === 'cash' ? '💵' : s.payment_method === 'card' ? '💳' : '🏦'} ${escapeHtml(s.payment_method)}</td>
          <td>${new Date(s.created_at).toLocaleString()}</td>
          <td><button class="btn small ghost" data-view-sale="${s.id}">👁️ View</button></td>
        </tr>`).join('') || '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🧾</div><p>No sales yet.</p></div></td></tr>'}
      </tbody>
    </table></div>
  `;
  root.querySelectorAll('[data-view-sale]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sale = await API.get('/sales/' + btn.dataset.viewSale);
      showReceiptModal(sale);
    });
  });
}

// ---------------- Account ----------------
function renderAccount() {
  const root = document.getElementById('viewRoot');
  root.innerHTML = `
    <div class="section-header"><h2>👤 Account</h2></div>
    <div class="card" style="max-width:420px;">
      <p><strong>${escapeHtml(CURRENT_USER.name)}</strong></p>
      <p class="muted small">${escapeHtml(CURRENT_USER.username)} — ${escapeHtml(CURRENT_USER.role)}</p>
      <hr style="border:none; border-top:1px solid var(--border); margin:14px 0;">
      <h3>Change Password</h3>
      <form id="pwForm">
        <label>Current password<input type="password" name="currentPassword" required></label>
        <label>New password<input type="password" name="newPassword" minlength="8" required></label>
        <div id="pwError" class="error hidden"></div>
        <button class="btn primary" type="submit">Update Password</button>
      </form>
    </div>
  `;
  document.getElementById('pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      await API.post('/auth/change-password', body);
      toast('Password updated.', 'success');
      e.target.reset();
    } catch (err) {
      const box = document.getElementById('pwError');
      box.textContent = err.message;
      box.classList.remove('hidden');
    }
  });
}

// ---------------- Boot ----------------
(async function boot() {
  try {
    CURRENT_USER = await API.get('/auth/me');
  } catch (e) {
    window.location.href = '/index.html';
    return;
  }
  document.getElementById('userLabel').textContent = `${CURRENT_USER.name} (${CURRENT_USER.role})`;
  setupNav();

  if (CURRENT_USER.mustChangePassword) {
    toast('Please set a new password in Account.', '');
  }

  const startView = window.location.hash.replace('#', '') || 'dashboard';
  navigate(startView);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
})();
