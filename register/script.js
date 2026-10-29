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
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const fullname = document.getElementById('fullname')?.value.trim();
            const username = document.getElementById('username')?.value.trim();
            const email = document.getElementById('email')?.value.trim();
            const password = passwordInput ? passwordInput.value : '';
            const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
            const dob = dobInput ? dobInput.value : '';

            if (dob && dob > today) {
                alert('Date of Birth cannot be in the future.');
                dobInput.focus();
                return;
            }

            if (password !== confirmPassword) {
                alert('Passwords do not match. Please re-enter.');
                confirmPasswordInput.focus();
                return;
            }

            const registrationData = {
                fullname: fullname,
                username: username,
                email: email,
                password: password,
                dob: dob,
                timestamp: new Date().toISOString()
            };

            const jsonString = JSON.stringify(registrationData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const downloadUrl = URL.createObjectURL(blob);
            const downloadAnchor = document.createElement('a');
            downloadAnchor.href = downloadUrl;
            downloadAnchor.download = 'registration_data.json';
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();

            document.body.removeChild(downloadAnchor);
            URL.revokeObjectURL(downloadUrl);
        });
    }
});
