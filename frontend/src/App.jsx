import { useCallback, useEffect, useMemo, useState } from 'react';

const API = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const MENU = [
  ['Overview', '⌂'], ['Inventory', '▦'], ['Receive stock', '+'],
  ['Billing', '▤'], ['Import data', '⇧'], ['Suppliers', '♙'], ['Forecast', '↗'],
];
const emptyMedicine = { name: '', barcode: '', company: '', price: '', threshold_qty: 10 };
const emptyBatch = { medicine_id: '', batch_no: '', manufacturing_date: '', expiry_date: '', quantity: 1, supplier_id: '' };

async function request(path, key, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(key ? { Authorization: `Bearer ${key}` } : {}), ...options.headers };
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body.detail || `Request failed (${response.status})`;
    throw Object.assign(new Error(typeof detail === 'string' ? detail : JSON.stringify(detail)), { status: response.status });
  }
  return response.status === 204 ? null : response.json();
}

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);
}

function App() {
  const [page, setPage] = useState('Overview');
  const [token, setToken] = useState(() => sessionStorage.getItem('inventory-session') || '');
  const [username, setUsername] = useState(() => sessionStorage.getItem('inventory-user') || '');
  const [loginError, setLoginError] = useState('');
  const [loginMessage, setLoginMessage] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState(null);
  const [stock, setStock] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [top, setTop] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [account, setAccount] = useState(null);
  const [managedUsers, setManagedUsers] = useState([]);
  const [medicineForm, setMedicineForm] = useState(emptyMedicine);
  const [batchForm, setBatchForm] = useState(emptyBatch);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [cart, setCart] = useState([]);
  const [saleResult, setSaleResult] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [forecastId, setForecastId] = useState('');
  const [forecast, setForecast] = useState(null);
  const [viewMonth, setViewMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [today, setToday] = useState(() => new Date());
  const [calendarEvents, setCalendarEvents] = useState([]);
  const sessionExpiry = useMemo(() => {
    try {
      const payload = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      const parsed = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
      return parsed.exp ? new Date(parsed.exp * 1000) : null;
    } catch { return null; }
  }, [token]);

  const call = useCallback((path, options) => request(path, token, options), [token]);
  const monthKey = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}`;
  const refresh = useCallback(async () => {
    if (!token) return;
    setBusy(true); setError('');
    try {
      const [s, inv, meds, best, sups] = await Promise.all([
        call('/dashboard/summary'), call('/stock'), call('/medicines'),
        call('/reports/top-medicines'), call('/suppliers'),
      ]);
      setSummary(s); setStock(inv); setMedicines(meds); setTop(best); setSuppliers(sups);
      if (page === 'Overview') setCalendarEvents(await call(`/calendar/events?month=${monthKey}`));
      if (page === 'Forecast' && forecastId) setForecast(await call(`/forecast/${forecastId}`));
      if (page === 'Profile') {
        const profile = await call('/auth/me');
        setAccount(profile);
        setManagedUsers(profile.role === 'admin' ? await call('/auth/users') : []);
      }
      setConnected(true);
      if (!forecastId && meds.length) setForecastId(String(meds[0].id));
    } catch (e) {
      setConnected(false); setError(e.message);
      if (e.status === 401) { sessionStorage.removeItem('inventory-session'); setToken(''); }
    }
    finally { setBusy(false); }
  }, [call, token, forecastId, monthKey, page]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => setToday(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const cartTotal = useMemo(() => cart.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0), [cart]);
  async function submitLogin(event, user, password) {
    event.preventDefault();
    setLoginBusy(true); setLoginError('');
    try {
      const result = await request('/auth/login', '', { method: 'POST', body: JSON.stringify({ username: user, password }) });
      sessionStorage.setItem('inventory-session', result.access_token);
      sessionStorage.setItem('inventory-user', user);
      setToken(result.access_token); setUsername(result.username); setPage('Overview'); setLoginMessage('');
    } catch (e) { setLoginError(e.message); }
    finally { setLoginBusy(false); }
  }

  function logout() {
    sessionStorage.removeItem('inventory-session'); sessionStorage.removeItem('inventory-user');
    setToken(''); setUsername(''); setAccount(null); setManagedUsers([]); setConnected(false); setSummary(null); setStock([]); setMedicines([]);
  }

  async function updateAdminCredentials(values) {
    const updated = await call('/auth/me/credentials', { method: 'PATCH', body: JSON.stringify(values) });
    sessionStorage.removeItem('inventory-session'); sessionStorage.setItem('inventory-user', updated.username);
    setToken(''); setUsername(updated.username); setAccount(null);
    setLoginMessage('Admin credentials updated. Sign in with the updated account.');
  }

  async function createStaffAccount(values) {
    const created = await call('/auth/users', { method: 'POST', body: JSON.stringify(values) });
    setNotice(`User account ${created.username} created`);
    await refresh();
  }

  async function run(action, success) {
    setError('');
    try { await action(); if (success) setNotice(success); await refresh(); }
    catch (e) { setError(e.message); }
  }

  async function createMedicine(event) {
    event.preventDefault();
    await run(async () => {
      await call('/medicines', { method: 'POST', body: JSON.stringify({ ...medicineForm,
        barcode: medicineForm.barcode || null, price: Number(medicineForm.price), threshold_qty: Number(medicineForm.threshold_qty) }) });
      setMedicineForm(emptyMedicine);
    }, 'Medicine added');
  }

  async function updateThreshold(id, value) {
    await run(() => call(`/medicines/${id}/threshold?threshold_qty=${Number(value)}`, { method: 'PATCH' }), 'Threshold updated');
  }

  async function receiveBatch(event) {
    event.preventDefault();
    await run(async () => {
      await call('/batches', { method: 'POST', body: JSON.stringify({ ...batchForm,
        medicine_id: Number(batchForm.medicine_id), quantity: Number(batchForm.quantity), supplier_id: batchForm.supplier_id ? Number(batchForm.supplier_id) : null,
        manufacturing_date: batchForm.manufacturing_date || null }) });
      setBatchForm(emptyBatch);
    }, 'Stock received');
  }

  function addToCart(id, quantity) {
    const medicine = medicines.find((item) => item.id === Number(id));
    if (!medicine || !quantity) return;
    const stockRow = stock.find((item) => item.id === medicine.id);
    const alreadyAdded = cart.find((item) => item.medicine_id === medicine.id)?.quantity || 0;
    if (alreadyAdded + Number(quantity) > (stockRow?.quantity || 0)) {
      setError(`Only ${Math.max(0, (stockRow?.quantity || 0) - alreadyAdded)} unexpired units are available.`);
      return;
    }
    setError('');
    setCart((items) => {
      const existing = items.find((item) => item.medicine_id === medicine.id);
      return existing ? items.map((item) => item.medicine_id === medicine.id ? { ...item, quantity: item.quantity + Number(quantity) } : item)
        : [...items, { medicine_id: medicine.id, name: medicine.name, price: Number(medicine.price), quantity: Number(quantity) }];
    });
  }

  async function submitSale() {
    await run(async () => {
      const result = await call('/sales', { method: 'POST', body: JSON.stringify({ items: cart.map(({ medicine_id, quantity }) => ({ medicine_id, quantity })) }) });
      setSaleResult(result); setCart([]);
    }, 'Sale completed and stock updated');
  }

  async function previewImport() {
    if (!importFile) return;
    await run(async () => {
      const form = new FormData(); form.append('file', importFile);
      setImportPreview(await call('/imports/preview', { method: 'POST', body: form }));
    });
  }

  async function downloadTemplate() {
    try {
      const response = await fetch(`${API}/imports/template`, { headers: { 'X-API-Key': key } });
      if (!response.ok) throw new Error('Could not download the CSV template. Check the API key and backend connection.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'medicine_import_template.csv'; link.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  }

  async function commitImport() {
    if (!importFile) return;
    await run(async () => {
      const form = new FormData(); form.append('file', importFile);
      const result = await call('/imports/commit', { method: 'POST', body: form });
      setImportPreview(null); setImportFile(null);
      setNotice(`Imported ${result.batches_created} batch${result.batches_created === 1 ? '' : 'es'}`);
    });
  }

  async function addSupplier(event) {
    event.preventDefault();
    await run(async () => {
      await call('/suppliers', { method: 'POST', body: JSON.stringify({ name: supplierName, phone: supplierPhone || null, email: null }) });
      setSupplierName(''); setSupplierPhone('');
    }, 'Supplier saved');
  }

  async function loadForecast() {
    if (!forecastId) return;
    await run(async () => setForecast(await call(`/forecast/${forecastId}`)));
  }

  if (!token) return <Login onSubmit={submitLogin} busy={loginBusy} error={loginError} message={loginMessage} />;

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">✚</div><div><strong>Shayam</strong><span>MEDICAL STORE</span></div></div>
      <div className="store-pill"><i className={connected ? 'online' : ''} />{connected ? 'Connected to inventory' : 'Backend disconnected'}</div>
      <nav>{MENU.map(([label, icon]) => <button key={label} className={page === label ? 'nav-item active' : 'nav-item'} onClick={() => setPage(label)}><b>{icon}</b>{label}</button>)}</nav>
      <div className="connection user-session"><span>Signed in as</span><strong>{username}</strong><button className="button button-quiet" onClick={logout}>Log out</button></div>
      <div className="sidebar-foot">Inventory · Expiry · Reordering</div>
    </aside>

    <main className="main">
      <header className="topbar"><div><p className="eyebrow">SHAYAM MEDICAL STORE <span>/</span> BIDHOLI, DEHRADUN</p><h1>{page}</h1></div><div className="top-actions"><span className="live-dot" />{connected ? 'Live data' : 'Waiting for connection'}<button className="profile-top-button" type="button" aria-label={`Open profile for ${username}`} title="Profile" onClick={() => setPage('Profile')}><span>{(username || '?').slice(0, 1).toUpperCase()}</span></button><button className="icon-button" type="button" aria-label="Refresh current view" aria-busy={busy} title={busy ? 'Refresh is running; click to refresh again' : 'Refresh current view'} onClick={refresh}>↻</button></div></header>
      {error && <div className="banner error-banner"><b>Could not complete request</b><span>{error}</span></div>}
      {notice && <div className="toast">✓ {notice}</div>}
      {busy && <div className="loading-line" />}
      {page === 'Overview' && <Overview summary={summary} stock={stock} top={top}><Calendar month={viewMonth} setMonth={setViewMonth} today={today} selected={selectedDate} setSelected={setSelectedDate} events={calendarEvents} /></Overview>}
      {page === 'Inventory' && <Inventory stock={stock} medicines={medicines} onCreate={createMedicine} form={medicineForm} setForm={setMedicineForm} onThreshold={updateThreshold} />}
      {page === 'Receive stock' && <Receive medicines={medicines} suppliers={suppliers} form={batchForm} setForm={setBatchForm} onSubmit={receiveBatch} />}
      {page === 'Billing' && <Billing medicines={medicines} stock={stock} cart={cart} setCart={setCart} total={cartTotal} add={addToCart} onSubmit={submitSale} result={saleResult} />}
      {page === 'Import data' && <ImportPanel file={importFile} setFile={(f) => { setImportFile(f); setImportPreview(null); }} preview={importPreview} onPreview={previewImport} onCommit={commitImport} download={downloadTemplate} />}
      {page === 'Suppliers' && <Suppliers suppliers={suppliers} name={supplierName} setName={setSupplierName} phone={supplierPhone} setPhone={setSupplierPhone} onSubmit={addSupplier} />}
      {page === 'Forecast' && <Forecast medicines={medicines} id={forecastId} setId={setForecastId} data={forecast} onLoad={loadForecast} />}
      {page === 'Profile' && <Profile username={username} account={account} users={managedUsers} expiresAt={sessionExpiry} onLogout={logout} onUpdate={updateAdminCredentials} onCreateUser={createStaffAccount} />}
      <footer className="footer"><span>Medicine Inventory System</span><span>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span></footer>
    </main>
  </div>;
}

function Login({ onSubmit, busy, error, message }) {
  const [username, setUsername] = useState(() => sessionStorage.getItem('inventory-user') || '');
  const [password, setPassword] = useState('');
  return <main className="login-screen"><div className="login-art"><div className="login-brand"><div className="brand-mark">✚</div><div><strong>Shayam</strong><span>MEDICAL STORE</span></div></div><div className="login-message"><span>SMART INVENTORY</span><h1>Care starts with<br />being prepared.</h1><p>Keep stock visible, batches traceable and expiry dates in view.</p></div><div className="login-art-mark">✚</div><small>Bidholi · Dehradun</small></div><section className="login-card"><div className="login-mobile-brand"><div className="brand-mark">✚</div><strong>Shayam Medical Store</strong></div><span className="eyebrow">INVENTORY MANAGEMENT</span><h2>Welcome back</h2><p className="login-subtitle">Sign in to continue to your store dashboard.</p>{message && <div className="login-message-note">{message}</div>}<form className="login-form" onSubmit={(e) => onSubmit(e, username, password)}><label>Username<input required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" /></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" /></label>{error && <div className="login-error" role="alert">{error}</div>}<button className="button button-primary full-width" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <span>→</span></button></form><small className="login-foot">Authorized store staff only</small></section></main>;
}

function Overview({ summary, stock, top, children }) {
  const cards = [
    ['Medicines tracked', summary?.medicine_count ?? '—', 'Distinct items'],
    ['Low stock', summary?.low_stock_count ?? '—', 'At or below reorder point'],
    ['Near expiry', summary?.near_expiry_batches ?? '—', 'Batches · next 90 days'],
    ['Sales · 30 days', summary ? money(summary.sales_last_30_days) : '—', 'Recorded sales'],
  ];
  const low = stock.filter((row) => row.low_stock);
  return <>
    <section className="welcome"><div><span className="welcome-kicker">INVENTORY OVERVIEW</span><h2>Make every batch count.</h2><p>Track stock, watch expiry dates and plan the next reorder.</p></div><div className="welcome-art">✚</div></section>
    <section className="metric-grid">{cards.map(([label, value, sub]) => <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>)}</section>
    <section className="content-grid">
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">NEEDS ATTENTION</p><h2>Reorder watch</h2></div><span className="count-badge">{low.length}</span></div>{low.length ? <div className="table-wrap"><table><thead><tr><th>Medicine</th><th>In stock</th><th>Threshold</th></tr></thead><tbody>{low.slice(0, 7).map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.company || 'Company not set'}</small></td><td><span className="status low">{item.quantity} units</span></td><td>{item.threshold_qty}</td></tr>)}</tbody></table></div> : <Empty>No medicines are below their reorder threshold.</Empty>}</article>
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">RECENT SALES</p><h2>Top medicines</h2></div><span className="muted">Last 30 days</span></div>{top.length ? <div className="rank-list">{top.map((item, i) => <div className="rank-row" key={item.medicine_id}><span className="rank">0{i + 1}</span><span className="rank-name">{item.name}</span><b>{item.units}<small> units</small></b></div>)}</div> : <Empty>Sales will appear here as bills are recorded.</Empty>}</article>
    </section>
    <article className="panel stock-panel"><div className="panel-head"><div><p className="eyebrow">STOCK SUMMARY</p><h2>Medicine levels</h2></div><span className="muted">{stock.length} items</span></div><div className="table-wrap"><table><thead><tr><th>Medicine</th><th>Company</th><th>Available</th><th>Threshold</th><th>Status</th></tr></thead><tbody>{stock.slice(0, 8).map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.company || '—'}</td><td>{row.quantity}</td><td>{row.threshold_qty}</td><td><span className={`status ${row.low_stock ? 'low' : 'good'}`}>{row.low_stock ? 'Reorder' : 'In range'}</span></td></tr>)}</tbody></table></div></article>
    {children}
  </>;
}

function Inventory({ stock, medicines, onCreate, form, setForm, onThreshold }) {
  const change = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  return <div className="page-grid">
    <section className="panel form-panel"><div className="panel-head"><div><p className="eyebrow">CATALOG</p><h2>Add a medicine</h2></div></div><form className="form-grid" onSubmit={onCreate}>
      <label className="wide">Medicine name<input required value={form.name} onChange={(e) => change('name', e.target.value)} placeholder="e.g. Paracetamol 500 mg" /></label>
      <label>Company<input value={form.company} onChange={(e) => change('company', e.target.value)} placeholder="Manufacturer" /></label>
      <label>Barcode<input value={form.barcode} onChange={(e) => change('barcode', e.target.value)} placeholder="Optional" /></label>
      <label>Unit price (₹)<input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => change('price', e.target.value)} /></label>
      <label>Low-stock threshold<input required type="number" min="0" value={form.threshold_qty} onChange={(e) => change('threshold_qty', e.target.value)} /></label>
      <button className="button button-primary wide" type="submit">Add to medicine list <span>→</span></button>
    </form></section>
    <section className="panel"><div className="panel-head"><div><p className="eyebrow">CURRENT CATALOG</p><h2>Stock by medicine</h2></div><span className="count-badge">{medicines.length}</span></div><div className="table-wrap"><table><thead><tr><th>Medicine</th><th>Price</th><th>Units</th><th>Threshold</th></tr></thead><tbody>{stock.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.company || 'Company not set'}</small></td><td>{money(row.price)}</td><td>{row.quantity}</td><td><input className="small-input" aria-label={`Threshold for ${row.name}`} type="number" min="0" defaultValue={row.threshold_qty} onBlur={(e) => Number(e.target.value) !== row.threshold_qty && onThreshold(row.id, e.target.value)} /></td></tr>)}</tbody></table>{!stock.length && <Empty>Add your first medicine to start tracking stock.</Empty>}</div></section>
  </div>;
}

function Receive({ medicines, suppliers, form, setForm, onSubmit }) {
  const change = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  return <section className="panel form-panel narrow-panel"><div className="panel-head"><div><p className="eyebrow">GOODS RECEIVED</p><h2>Record a new batch</h2><p className="panel-copy">Add batch details when stock arrives. Expiry is required for safe stock rotation.</p></div></div><form className="form-grid" onSubmit={onSubmit}>
      <label className="wide">Medicine<select required value={form.medicine_id} onChange={(e) => change('medicine_id', e.target.value)}><option value="">Choose a medicine</option>{medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <label>Batch number<input required value={form.batch_no} onChange={(e) => change('batch_no', e.target.value)} /></label>
    <label>Quantity received<input required type="number" min="1" value={form.quantity} onChange={(e) => change('quantity', e.target.value)} /></label>
    <label>Manufacturing date<input type="date" value={form.manufacturing_date} onChange={(e) => change('manufacturing_date', e.target.value)} /></label>
    <label>Expiry date<input required type="date" value={form.expiry_date} onChange={(e) => change('expiry_date', e.target.value)} /></label>
    <label className="wide">Supplier (optional)<select value={form.supplier_id} onChange={(e) => change('supplier_id', e.target.value)}><option value="">No supplier selected</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <button className="button button-primary wide" type="submit" disabled={!medicines.length}>Save received stock <span>→</span></button>
  </form></section>;
}

function Billing({ medicines, stock, cart, setCart, total, add, onSubmit, result }) {
  const [medicineId, setMedicineId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const available = stock.find((row) => row.id === Number(medicineId))?.quantity || 0;
  return <div className="content-grid billing-grid"><section className="panel form-panel"><div className="panel-head"><div><p className="eyebrow">NEW TRANSACTION</p><h2>Build a bill</h2><p className="panel-copy">Customer details are not collected. Stock is deducted by earliest expiry first.</p></div></div><form className="form-grid" onSubmit={(e) => { e.preventDefault(); add(medicineId, quantity); }}>
    <label className="wide">Medicine<select required value={medicineId} onChange={(e) => setMedicineId(e.target.value)}><option value="">Select an item</option>{medicines.map((m) => <option key={m.id} value={m.id}>{m.name} · {money(m.price)}</option>)}</select></label>
    <label>Quantity<input type="number" min="1" max={available || undefined} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label><div className="available-note">Available stock <b>{available}</b></div>
    <button className="button button-secondary wide" disabled={!medicineId || !available}>Add item <span>＋</span></button>
  </form></section><section className="panel bill-panel"><div className="panel-head"><div><p className="eyebrow">CURRENT BILL</p><h2>Items to dispense</h2></div><span className="count-badge">{cart.length}</span></div>{result && <div className="invoice-tag">Last bill · {result.invoice_no}</div>}
    {cart.length ? <><div className="bill-lines">{cart.map((line) => <div className="bill-line" key={line.medicine_id}><div><b>{line.name}</b><small>{line.quantity} × {money(line.price)}</small></div><strong>{money(line.quantity * line.price)}</strong><button className="remove-button" onClick={() => setCart(cart.filter((x) => x.medicine_id !== line.medicine_id))}>×</button></div>)}</div><div className="bill-total"><span>Total</span><strong>{money(total)}</strong></div><button className="button button-primary full-width" onClick={onSubmit}>Complete sale <span>→</span></button></> : <Empty>Your bill is empty. Add a medicine to begin.</Empty>}
  </section></div>;
}

function ImportPanel({ file, setFile, preview, onPreview, onCommit, download }) {
  return <div className="content-grid import-grid"><section className="panel form-panel"><div className="panel-head"><div><p className="eyebrow">BULK SETUP</p><h2>Import inventory CSV</h2><p className="panel-copy">Use a reviewed stock list to populate medicines and batch records.</p></div></div><button className="text-button" onClick={download}>Download CSV template <span>↓</span></button><label className="dropzone"><span className="upload-icon">↑</span><b>{file ? file.name : 'Choose a CSV file'}</b><small>{file ? `${(file.size / 1024).toFixed(1)} KB` : 'UTF-8 CSV · up to 2 MB and 5,000 rows'}</small><input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label><button className="button button-primary full-width" disabled={!file} onClick={onPreview}>Preview import <span>→</span></button></section>
    <section className="panel"><div className="panel-head"><div><p className="eyebrow">REVIEW BEFORE SAVING</p><h2>Import preview</h2></div></div>{preview ? <><div className="preview-success">✓ {preview.rows} rows passed validation</div><div className="table-wrap"><table><thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Qty</th></tr></thead><tbody>{preview.sample.map((row) => <tr key={`${row.line}-${row.batch_no}`}><td>{row.name}</td><td>{row.batch_no}</td><td>{row.expiry}</td><td>{row.quantity}</td></tr>)}</tbody></table></div>{preview.rows > 10 && <small className="muted">Showing first 10 rows.</small>}<button className="button button-primary full-width top-gap" onClick={onCommit}>Import reviewed rows <span>→</span></button></> : <Empty>Select a CSV and preview it before importing. No data is saved until you confirm.</Empty>}</section></div>;
}

function Suppliers({ suppliers, name, setName, phone, setPhone, onSubmit }) {
  return <div className="content-grid"><section className="panel form-panel"><div className="panel-head"><div><p className="eyebrow">CONTACT DIRECTORY</p><h2>Add a supplier</h2></div></div><form className="form-grid" onSubmit={onSubmit}><label className="wide">Supplier name<input required value={name} onChange={(e) => setName(e.target.value)} /></label><label className="wide">Phone (optional)<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label><button className="button button-primary wide">Save supplier <span>→</span></button></form></section><section className="panel"><div className="panel-head"><div><p className="eyebrow">SUPPLIER LIST</p><h2>Saved contacts</h2></div><span className="count-badge">{suppliers.length}</span></div>{suppliers.length ? <div className="rank-list">{suppliers.map((supplier) => <div className="rank-row" key={supplier.id}><span className="avatar">{supplier.name.slice(0, 1).toUpperCase()}</span><span className="rank-name">{supplier.name}</span><span className="muted">{supplier.phone || supplier.email || 'No contact'}</span></div>)}</div> : <Empty>No suppliers have been added.</Empty>}</section></div>;
}

function Forecast({ medicines, id, setId, data, onLoad }) {
  return <div className="content-grid forecast-grid"><section className="panel form-panel"><div className="panel-head"><div><p className="eyebrow">REORDER PLANNING</p><h2>Demand forecast</h2><p className="panel-copy">A simple estimate based on recorded sales during the last 14 days.</p></div></div><label>Medicine<select value={id} onChange={(e) => setId(e.target.value)}><option value="">Choose a medicine</option>{medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><button className="button button-primary full-width top-gap" disabled={!id} onClick={onLoad}>Generate estimate <span>→</span></button></section>{data ? <section className="panel forecast-result"><p className="eyebrow">30-DAY ESTIMATE</p><h2>{medicines.find((m) => m.id === data.medicine_id)?.name}</h2><div className="forecast-number">{data.forecast_30_day_units}<small> units</small></div><p className="muted">Based on {data.avg_daily_units} average units sold per day across 14 days.</p><div className="reorder-box"><span>Suggested reorder</span><b>{data.suggested_reorder_units} units</b></div><small className="muted">Current unexpired stock: {data.current_stock} units · Includes the medicine's low-stock threshold as a buffer.</small></section> : <section className="panel forecast-empty"><span className="forecast-mark">↗</span><h2>Plan the next order</h2><p className="muted">Choose a medicine to see recent sales pace and an estimated reorder quantity.</p></section>}</div>;
}

function Calendar({ month, setMonth, today, selected, setSelected, events }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const todayKey = localDateKey(today);
  const selectedKey = localDateKey(selected);
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: dayCount }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const byDate = events.reduce((map, event) => ({ ...map, [event.date]: [...(map[event.date] || []), event] }), {});
  const selectedEvents = byDate[selectedKey] || [];
  const upcomingEvents = events.filter((event) => event.date >= todayKey).slice(0, 4);
  const monthLabel = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  function changeMonth(amount) {
    const next = new Date(year, monthIndex + amount, 1);
    setMonth(next); setSelected(next);
  }
  function jumpToday() {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today);
  }

  return <div className="calendar-layout reminders-layout"><section className="panel calendar-panel"><div className="calendar-heading"><div><p className="eyebrow">REMINDERS & DATES</p><h2>{monthLabel}</h2></div><div className="calendar-controls"><button className="calendar-today" onClick={jumpToday}>Today</button><button aria-label="Previous month" onClick={() => changeMonth(-1)}>‹</button><button aria-label="Next month" onClick={() => changeMonth(1)}>›</button></div></div><div className="calendar-grid weekday-row">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid day-grid">{cells.map((day, index) => {
    if (!day) return <span className="calendar-day blank" key={`blank-${index}`} />;
    const date = new Date(year, monthIndex, day);
    const key = localDateKey(date);
    const classes = ['calendar-day', key === todayKey ? 'is-today' : '', key === selectedKey ? 'is-selected' : '', byDate[key] ? 'has-events' : ''].filter(Boolean).join(' ');
    return <button className={classes} key={key} onClick={() => setSelected(date)} aria-label={`${date.toLocaleDateString('en-IN', { dateStyle: 'full' })}${byDate[key] ? `, ${byDate[key].length} expiry events` : ''}`}><span>{day}</span>{byDate[key] && <i />}</button>;
  })}</div><div className="calendar-legend"><span><i className="today-dot" />Today</span><span><i className="expiry-dot" />Medicine expiry</span><small>Calendar time updates every minute.</small></div></section><section className="panel calendar-events"><p className="eyebrow">{selectedEvents.length ? 'SELECTED DATE' : 'UPCOMING REMINDERS'}</p><h2>{selectedEvents.length ? selected.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Next batch expiries'}</h2>{selectedEvents.length ? <><p className="event-count">{selectedEvents.length} batch{selectedEvents.length === 1 ? '' : 'es'} expire on this date</p><div className="event-list">{selectedEvents.map((event) => <article className="expiry-event" key={event.id}><span className="event-icon">⌛</span><div><b>{event.medicine}</b><small>Batch {event.batch_no}</small></div><strong>{event.quantity}<small> units</small></strong></article>)}</div></> : upcomingEvents.length ? <><p className="event-count">Upcoming expiry dates this month</p><div className="event-list">{upcomingEvents.map((event) => <button className="expiry-event reminder-button" key={event.id} onClick={() => { const [y, m, d] = event.date.split('-').map(Number); setSelected(new Date(y, m - 1, d)); }}><span className="event-icon">⌛</span><div><b>{event.medicine}</b><small>{event.date} · Batch {event.batch_no}</small></div><strong>{event.quantity}<small> units</small></strong></button>)}</div></> : <div className="no-events"><span>✓</span><p>No upcoming batch expiries this month.</p><small>Expiry dates appear here when stock is recorded.</small></div>}<div className="calendar-note">Dates reflect the computer’s local calendar. Add batches from <b>Receive stock</b> to create reminders.</div></section></div>;
}

function Profile({ username, account, users, expiresAt, onLogout, onUpdate, onCreateUser }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [actionError, setActionError] = useState('');
  const expiryLabel = expiresAt && !Number.isNaN(expiresAt.getTime())
    ? expiresAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Unavailable';
  const isAdmin = account?.role === 'admin';

  async function changeCredentials(event) {
    event.preventDefault(); setActionError('');
    if (!newUsername.trim() && !newPassword) { setActionError('Enter a new username or password.'); return; }
    try {
      await onUpdate({ current_password: currentPassword, username: newUsername.trim() || null, new_password: newPassword || null });
    } catch (e) { setActionError(e.message); }
  }

  async function createAccount(event) {
    event.preventDefault(); setActionError('');
    try {
      await onCreateUser({ username: staffUsername.trim(), password: staffPassword });
      setStaffUsername(''); setStaffPassword('');
    } catch (e) { setActionError(e.message); }
  }

  return <div className="profile-layout"><section className="panel profile-card"><div className="profile-hero"><div className="profile-avatar">{(username || '?').slice(0, 1).toUpperCase()}</div><div><p className="eyebrow">STORE ACCOUNT</p><h2>{username || 'Signed-in user'}</h2><span className="profile-status"><i /> Active session · {isAdmin ? 'Admin' : 'User'}</span></div></div><div className="profile-details"><div><span>Username</span><strong>{username || '—'}</strong></div><div><span>Account</span><strong>Shayam Medical Store</strong></div><div><span>Access level</span><strong>{isAdmin ? 'Administrator' : 'Store user'}</strong></div><div><span>Session expires</span><strong>{expiryLabel}</strong></div></div><button className="button button-secondary signout-button" onClick={onLogout}>Sign out <span>→</span></button></section>
    <section className="panel profile-note"><span className="profile-note-icon">✓</span><p className="eyebrow">ACCOUNT ACCESS</p><h2>{isAdmin ? 'Administrator account' : 'Store user account'}</h2><p>{isAdmin ? 'You can update the admin login and create regular user accounts.' : 'Username and password are managed by the administrator.'}</p><button className="text-button" onClick={onLogout}>Sign out of this session <span>→</span></button></section>
    {!account ? <section className="panel profile-admin-panel"><p className="muted">Loading account permissions…</p></section> : isAdmin ? <><section className="panel profile-admin-panel"><div className="panel-head"><div><p className="eyebrow">ADMIN ONLY</p><h2>Change admin login</h2></div></div><form className="form-grid" onSubmit={changeCredentials}><label>Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label><label>New username<input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder={username} autoComplete="off" /></label><label className="wide">New password<input type="password" minLength="12" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Leave blank to keep current password" /></label><p className="field-note wide">Use at least 12 characters. Changing credentials signs you out so you can sign in again.</p>{actionError && <p className="login-error wide" role="alert">{actionError}</p>}<button className="button button-primary wide">Update admin credentials <span>→</span></button></form></section><section className="panel profile-admin-panel"><div className="panel-head"><div><p className="eyebrow">STAFF ACCESS</p><h2>Create a regular user</h2></div></div><form className="form-grid" onSubmit={createAccount}><label>Username<input required maxLength="100" value={staffUsername} onChange={(e) => setStaffUsername(e.target.value)} autoComplete="off" /></label><label>Password<input required type="password" minLength="12" value={staffPassword} onChange={(e) => setStaffPassword(e.target.value)} autoComplete="new-password" /></label><p className="field-note wide">Regular users can use inventory features but cannot change account credentials or create accounts.</p><button className="button button-secondary wide">Create user account <span>＋</span></button></form>{users.length > 0 && <div className="managed-users"><h3>Accounts</h3>{users.map((user) => <div className="managed-user" key={user.id}><span>{user.username}</span><b className={user.role === 'admin' ? 'role-admin' : ''}>{user.role}</b></div>)}</div>}</section></> : <section className="panel profile-admin-panel"><p className="eyebrow">ACCOUNT SETTINGS</p><h2>Managed by your administrator</h2><p className="panel-copy">Ask an administrator to update your username or password.</p></section>}
  </div>;
}

function localDateKey(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function Empty({ children }) { return <div className="empty-state"><span>✳</span><p>{children}</p></div>; }

export default App;
