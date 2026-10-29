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
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const email = document.getElementById('email')?.value.trim();
            const password = passwordInput ? passwordInput.value : '';
            const remember = document.getElementById('remember')?.checked || false;

            const loginData = {
                email: email,
                password: password,
                remember: remember,
                timestamp: new Date().toISOString()
            };

            const jsonString = JSON.stringify(loginData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const downloadUrl = URL.createObjectURL(blob);
            const downloadAnchor = document.createElement('a');
            downloadAnchor.href = downloadUrl;
            downloadAnchor.download = 'login_data.json';
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();

            document.body.removeChild(downloadAnchor);
            URL.revokeObjectURL(downloadUrl);
        });
    }
});
