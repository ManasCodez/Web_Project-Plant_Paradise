// auth-state.js - Manages navigation state across all Plant Paradise pages

document.addEventListener('DOMContentLoaded', () => {
    updateNavAuth();
});

function updateNavAuth() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    const userRaw = localStorage.getItem('plantParadiseUser');
    let user = null;
    if (userRaw) {
        try {
            user = JSON.parse(userRaw);
        } catch (e) {
            localStorage.removeItem('plantParadiseUser');
            localStorage.removeItem('plantParadiseToken');
        }
    }

    // Find login and register link items
    const allListItems = Array.from(navLinks.querySelectorAll('li'));
    
    let loginLi = null;
    let registerLi = null;

    allListItems.forEach(li => {
        const text = li.textContent.trim().toLowerCase();
        if (text === 'login') loginLi = li;
        if (text === 'register') registerLi = li;
    });

    if (user && user.email) {
        // Hide or remove Login and Register links
        if (loginLi) loginLi.style.display = 'none';
        if (registerLi) registerLi.style.display = 'none';

        // Check if user badge/logout already added
        if (!document.getElementById('nav-user-item')) {
            const userLi = document.createElement('li');
            userLi.id = 'nav-user-item';
            userLi.style.display = 'inline-flex';
            userLi.style.alignItems = 'center';
            userLi.style.gap = '8px';

            const displayName = user.fullname ? user.fullname.split(' ')[0] : (user.username || user.email);

            userLi.innerHTML = `
                <span style="color: #2e7d32; font-weight: 600; font-size: 0.95rem; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-user-circle"></i> ${escapeHTML(displayName)}
                </span>
                <a href="javascript:void(0)" id="nav-logout-btn" style="
                    background: #c62828;
                    color: #fff;
                    padding: 5px 12px;
                    border-radius: 20px;
                    text-decoration: none;
                    font-size: 0.85rem;
                    font-weight: 500;
                    margin-left: 6px;
                    transition: background 0.2s;
                ">Logout</a>
            `;

            navLinks.appendChild(userLi);

            const logoutBtn = document.getElementById('nav-logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('mouseenter', () => logoutBtn.style.background = '#b71c1c');
                logoutBtn.addEventListener('mouseleave', () => logoutBtn.style.background = '#c62828');
                logoutBtn.addEventListener('click', () => {
                    if (confirm('Are you sure you want to log out?')) {
                        localStorage.removeItem('plantParadiseUser');
                        localStorage.removeItem('plantParadiseToken');
                        alert('You have logged out.');
                        // Redirect to home page
                        window.location.href = window.location.pathname.includes('/public/') ? '/public/' : '/';
                    }
                });
            }
        }
    } else {
        // Not logged in: show Login & Register
        if (loginLi) loginLi.style.display = '';
        if (registerLi) registerLi.style.display = '';
        const userLi = document.getElementById('nav-user-item');
        if (userLi) userLi.remove();
    }
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
