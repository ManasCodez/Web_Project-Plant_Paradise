document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.querySelector('.register-form');
    const dobInput = document.getElementById('dob');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');

    const today = new Date().toISOString().split('T')[0];
    if (dobInput) {
        dobInput.max = today;
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const fullname = document.getElementById('fullname')?.value.trim();
            const username = document.getElementById('username')?.value.trim();
            const email = document.getElementById('email')?.value.trim();
            const password = passwordInput ? passwordInput.value : '';
            const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
            const dob = dobInput ? dobInput.value : '';

            if (password !== confirmPassword) {
                alert('Passwords do not match. Please re-enter.');
                confirmPasswordInput.focus();
                return;
            }

            if (password.length < 6) {
                alert('Password must be at least 6 characters long.');
                passwordInput.focus();
                return;
            }

            const submitBtn = registerForm.querySelector('button[type="submit"]') || registerForm.querySelector('.btn-primary');
            const originalBtnText = submitBtn ? submitBtn.textContent : 'Create Account';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Registering...';
            }

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        fullname,
                        username,
                        email,
                        password,
                        dob,
                    }),
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    alert('Registration successful! Redirecting to login page.');
                    window.location.href = '../login/';
                } else {
                    alert(data.message || 'Registration failed. Please try again.');
                }
            } catch (err) {
                console.error('Registration fetch error:', err);
                alert('An error occurred during registration. Please make sure the server and database are reachable.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                }
            }
        });
    }
});
