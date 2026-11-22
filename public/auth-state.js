// Display data is cached for navigation only; all authorization is server-side.
document.addEventListener('DOMContentLoaded', () => {
  updateNavAuth();
  if (location.protocol !== 'file:') {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (response) => {
        if (response.ok) {
          const body = await response.json();
          if (body.user) localStorage.setItem('plantParadiseUser', JSON.stringify(body.user));
        } else if (response.status === 401) {
          localStorage.removeItem('plantParadiseUser');
          localStorage.removeItem('plantParadiseToken');
        }
        updateNavAuth();
      })
      .catch(() => {});
  }
});
function updateNavAuth() {
  if (location.protocol === 'file:') return;
  const nav = document.querySelector('.nav-links');
  if (!nav) return;
  let user;
  try {
    user = JSON.parse(localStorage.getItem('plantParadiseUser'));
  } catch {
    localStorage.removeItem('plantParadiseUser');
  }
  for (const li of nav.querySelectorAll('li')) {
    if (['login', 'register'].includes(li.textContent.trim().toLowerCase()))
      li.style.display = user?.email ? 'none' : '';
  }
  document.getElementById('nav-user-item')?.remove();
  if (!user?.email) return;
  const li = document.createElement('li');
  li.id = 'nav-user-item';
  li.style.cssText = 'display:inline-flex;align-items:center;gap:8px';
  const label = document.createElement('span');
  label.style.cssText =
    'color:#2e7d32;font-weight:600;font-size:.95rem;display:inline-flex;align-items:center;gap:4px';
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-user-circle';
  label.append(
    icon,
    document.createTextNode(String(user.fullname || user.username || user.email).split(' ')[0]),
  );
  const orders = document.createElement('a');
  orders.href = '/my-orders';
  orders.textContent = 'My Orders';
  li.append(orders);
  if (user.role === 'admin') {
    const link = document.createElement('a');
    link.href = '/admin';
    link.textContent = 'Admin';
    li.append(link);
  }
  li.append(label);
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'nav-logout-btn';
  button.textContent = 'Logout';
  button.style.cssText =
    'background:#c62828;color:#fff;padding:5px 12px;border:0;border-radius:20px;font-size:.85rem;font-weight:500;margin-left:6px;cursor:pointer';
  button.onclick = async () => {
    if (!confirm('Are you sure you want to log out?')) return;
    button.disabled = true;
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok && response.status !== 401) throw Error('Logout failed. Please retry.');
      localStorage.removeItem('plantParadiseUser');
      localStorage.removeItem('plantParadiseToken');
      updateNavAuth();
      location.href = '/';
    } catch (error) {
      alert(error.message);
      button.disabled = false;
    }
  };
  li.append(button);
  nav.append(li);
}
