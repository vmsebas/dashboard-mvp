// utils.js - Utilidades compartidas para el dashboard
// Este archivo consolida funciones duplicadas sin cambiar la funcionalidad

// Sistema de notificaciones mejorado
function showNotification(message, type = 'info', options = {}) {
    const config = {
        duration: type === 'error' ? 10000 : (type === 'warning' ? 7000 : 5000),
        persistent: false,
        actions: [],
        playSound: type === 'error' || type === 'warning',
        ...options
    };
    
    const notificationContainer = document.getElementById('notification-container') || createNotificationContainer();
    
    const alertClass = {
        'success': 'alert-success',
        'error': 'alert-danger',
        'warning': 'alert-warning',
        'info': 'alert-info'
    }[type] || 'alert-info';
    
    const icon = {
        'success': 'bi-check-circle-fill',
        'error': 'bi-x-circle-fill',
        'warning': 'bi-exclamation-triangle-fill',
        'info': 'bi-info-circle-fill'
    }[type] || 'bi-info-circle-fill';
    
    const notificationId = 'notification-' + Date.now();
    const actionsHtml = config.actions.map(action => `
        <button class="btn btn-sm btn-${action.style || 'primary'} ms-2" 
                onclick="${action.onclick}">
            ${action.text}
        </button>
    `).join('');
    
    const notificationHtml = `
        <div id="${notificationId}" class="alert ${alertClass} notification alert-dismissible fade show shadow-sm" role="alert">
            <div class="d-flex align-items-start">
                <i class="bi ${icon} me-2 fs-5"></i>
                <div class="flex-grow-1">
                    <div>${escapeHtml(message)}</div>
                    ${actionsHtml ? `<div class="mt-2">${actionsHtml}</div>` : ''}
                </div>
                ${!config.persistent ? '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>' : ''}
            </div>
        </div>
    `;
    
    notificationContainer.insertAdjacentHTML('beforeend', notificationHtml);
    
    // Reproducir sonido si está habilitado
    if (config.playSound && window.notificationSound) {
        window.notificationSound.play().catch(() => {});
    }
    
    // Auto-cerrar después del tiempo especificado
    if (!config.persistent && config.duration > 0) {
        setTimeout(() => {
            const notification = document.getElementById(notificationId);
            if (notification) {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 150);
            }
        }, config.duration);
    }
    
    return notificationId;
}

// Crear contenedor de notificaciones si no existe
function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
    document.body.appendChild(container);
    return container;
}

// Escape HTML para prevenir XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Formatear fechas de manera consistente
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Fecha inválida';
    
    return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Formatear tiempo relativo
function formatRelativeTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Fecha inválida';
    
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'hace unos segundos';
    if (diffInSeconds < 3600) return `hace ${Math.floor(diffInSeconds / 60)} minutos`;
    if (diffInSeconds < 86400) return `hace ${Math.floor(diffInSeconds / 3600)} horas`;
    if (diffInSeconds < 2592000) return `hace ${Math.floor(diffInSeconds / 86400)} días`;
    return formatDate(dateString);
}

// Crear y mostrar modales de forma consistente
function showModal(modalId, title, content, options = {}) {
    // Eliminar modal existente si existe
    const existingModal = document.getElementById(modalId);
    if (existingModal) {
        const bsModal = bootstrap.Modal.getInstance(existingModal);
        if (bsModal) bsModal.dispose();
        existingModal.remove();
    }
    
    const modalHtml = `
        <div class="modal fade" id="${modalId}" tabindex="-1">
            <div class="modal-dialog ${options.size || 'modal-lg'}">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${escapeHtml(title)}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    ${options.footer ? `<div class="modal-footer">${options.footer}</div>` : ''}
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();
    
    return modal;
}

// Manejador de fetch mejorado con manejo de errores
async function fetchAPI(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
            throw new Error(errorData.error || `Error HTTP: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error en API ${url}:`, error);
        throw error;
    }
}

// Confirmación mejorada con modal
function confirmAction(title, message, onConfirm, options = {}) {
    const modalId = 'confirm-modal-' + Date.now();
    const content = `<p>${escapeHtml(message)}</p>`;
    const footer = `
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
        <button type="button" class="btn btn-${options.btnClass || 'danger'}" id="${modalId}-confirm">
            ${options.confirmText || 'Confirmar'}
        </button>
    `;
    
    const modal = showModal(modalId, title, content, { footer, size: 'modal-md' });
    
    document.getElementById(`${modalId}-confirm`).addEventListener('click', async () => {
        try {
            await onConfirm();
            modal.hide();
        } catch (error) {
            showNotification('Error: ' + error.message, 'error');
        }
    });
}

// Renderizar tabla vacía con mensaje
function renderEmptyState(container, message = 'No hay datos disponibles') {
    container.innerHTML = `
        <div class="text-center text-muted py-5">
            <i class="bi bi-inbox fs-1 d-block mb-3"></i>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

// Debounce para optimizar eventos frecuentes
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Copiar al portapapeles con feedback
async function copyToClipboard(text, feedbackElement) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Copiado al portapapeles', 'success', 2000);
        
        if (feedbackElement) {
            const originalText = feedbackElement.textContent;
            feedbackElement.textContent = '¡Copiado!';
            setTimeout(() => {
                feedbackElement.textContent = originalText;
            }, 2000);
        }
    } catch (error) {
        showNotification('Error al copiar', 'error');
    }
}

// Formatear tamaño de archivos
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Validación básica de inputs
const validators = {
    isAlphanumeric: (str) => /^[a-zA-Z0-9]+$/.test(str),
    isValidPath: (str) => /^[a-zA-Z0-9/_.-]+$/.test(str),
    isValidPort: (port) => {
        const num = parseInt(port);
        return !isNaN(num) && num >= 1 && num <= 65535;
    },
    isValidDomain: (domain) => /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?$/.test(domain),
    isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
};

// Exportar todas las funciones para uso global
window.DashboardUtils = {
    showNotification,
    escapeHtml,
    formatDate,
    formatRelativeTime,
    showModal,
    fetchAPI,
    confirmAction,
    renderEmptyState,
    debounce,
    copyToClipboard,
    formatFileSize,
    validators
};