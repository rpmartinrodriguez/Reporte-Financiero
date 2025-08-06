document.addEventListener('DOMContentLoaded', () => {
    // Lógica para el menú de navegación móvil (hamburger menu)
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');

    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }

    // Lógica para Mostrar/ocultar formulario de carga de datos
    const toggleFormButton = document.getElementById('toggle-form-button');
    const formSection = document.getElementById('form-section');
    const toggleIcon = document.getElementById('toggle-icon');

    if (toggleFormButton && formSection) {
        toggleFormButton.addEventListener('click', () => {
            const isHidden = formSection.classList.contains('hidden');
            
            if (isHidden) {
                formSection.classList.remove('hidden');
                setTimeout(() => {
                    formSection.style.maxHeight = formSection.scrollHeight + 'px';
                    formSection.style.opacity = '1';
                }, 10);
                toggleIcon.style.transform = 'rotate(45deg)';
            } else {
                formSection.style.maxHeight = '0';
                formSection.style.opacity = '0';
                setTimeout(() => {
                    formSection.classList.add('hidden');
                }, 300); // La duración debe coincidir con la transición en CSS
                toggleIcon.style.transform = 'rotate(0deg)';
            }
        });
    }
});
