// Helper para forzar el modo oscuro correctamente
document.addEventListener('DOMContentLoaded', function() {
    // Forzar recarga de estilos si hay problemas con las tablas
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
        // Aplicar estilos adicionales para asegurar que las tablas sean oscuras
        const style = document.createElement('style');
        style.textContent = `
            [data-theme="dark"] .table,
            [data-theme="dark"] .table td,
            [data-theme="dark"] .table th,
            [data-theme="dark"] .table tr,
            [data-theme="dark"] tbody,
            [data-theme="dark"] thead {
                background-color: transparent !important;
                color: #e9ecef !important;
            }
            
            [data-theme="dark"] .table-responsive {
                background-color: transparent !important;
            }
            
            [data-theme="dark"] .card-body {
                background-color: #242424 !important;
                color: #e9ecef !important;
            }
        `;
        document.head.appendChild(style);
    }
});

// Función para limpiar estilos inline de Bootstrap
function cleanBootstrapStyles() {
    const tables = document.querySelectorAll('.table');
    tables.forEach(table => {
        table.style.removeProperty('background-color');
        const cells = table.querySelectorAll('td, th, tr');
        cells.forEach(cell => {
            cell.style.removeProperty('background-color');
        });
    });
}

// Ejecutar limpieza cuando cambie el tema
window.addEventListener('theme-changed', cleanBootstrapStyles);

// Ejecutar limpieza después de cargar datos
window.addEventListener('data-loaded', cleanBootstrapStyles);