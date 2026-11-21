document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.querySelector('.login-form');
  const passwordInput = document.getElementById('password');
  const togglePasswordIcon = document.querySelector('.field-icon-right');

  if (togglePasswordIcon && passwordInput) {
    togglePasswordIcon.style.cursor = 'pointer';
    togglePasswordIcon.addEventListener('click', () => {
      const isPassword = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
      togglePasswordIcon.classList.toggle('fa-eye');
      togglePasswordIcon.classList.toggle('fa-eye-slash');
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email')?.value.trim();
      const password = passwordInput ? passwordInput.value : '';
      const remember = document.getElementById('remember')?.checked || false;

      const submitBtn =
        loginForm.querySelector('button[type="submit"]') || loginForm.querySelector('.btn-primary');
      const originalBtnText = submitBtn ? submitBtn.textContent : 'Sign In';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';
      }

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
            remember,
          }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          // Cache display data; the server sets an HttpOnly session cookie.
          localStorage.setItem('plantParadiseUser', JSON.stringify(data.user));
          localStorage.removeItem('plantParadiseToken');

          alert(`Welcome back, ${data.user.fullname}!`);
          const next = new URLSearchParams(location.search).get('next');
          const safeNext =
            next === '/checkout' ||
            next === '/my-orders' ||
            /^\/orders\/confirmation\/[a-f0-9]{24}$/i.test(next || '')
              ? next
              : null;
          window.location.href = safeNext || (data.user.role === 'admin' ? '/admin' : '/');
        } else {
          alert(data.message || 'Login failed. Please check your credentials.');
        }
      } catch (err) {
        console.error('Login fetch error:', err);
        alert('An error occurred during login. Please check server connectivity.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        }
      }
    });
  }
});
