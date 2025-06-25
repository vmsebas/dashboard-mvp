// projects.js - Gestión de proyectos desde el dashboard

let projects = [];

// Cargar proyectos al inicializar
document.addEventListener('DOMContentLoaded', function() {
    loadProjects();
    
    // Actualizar cada 30 segundos
    setInterval(loadProjects, 30000);
});

async function loadProjects() {
    try {
        const response = await fetch('/api/projects/list');
        const data = await response.json();
        projects = data.projects;
        renderProjects();
    } catch (error) {
        console.error('Error cargando proyectos:', error);
        showNotification('Error cargando proyectos', 'error');
    }
}

function renderProjects() {
    const container = document.getElementById('projects-list');
    
    if (projects.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center text-secondary">
                <i class="bi bi-folder-x" style="font-size: 3rem;"></i>
                <p class="mt-2">No se encontraron proyectos</p>
            </div>
        `;
        return;
    }

    container.innerHTML = projects.map(project => `
        <div class="col-lg-4 col-md-6 mb-4">
            <div class="card h-100">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">
                        <i class="bi bi-folder"></i> ${project.name}
                    </h6>
                    <span class="badge ${getStatusBadge(project.status)}">${getStatusText(project.status)}</span>
                </div>
                <div class="card-body">
                    <p class="text-muted small mb-2">${project.description}</p>
                    
                    <div class="mb-3">
                        <div class="row g-2">
                            <div class="col-6">
                                <div class="d-flex align-items-center">
                                    <i class="bi bi-tag me-1"></i>
                                    <small class="text-muted">Versión:</small>
                                </div>
                                <div class="fw-bold">${project.currentVersion || 'Sin versión'}</div>
                            </div>
                            <div class="col-6">
                                <div class="d-flex align-items-center">
                                    <i class="bi bi-gear me-1"></i>
                                    <small class="text-muted">Tipo:</small>
                                </div>
                                <div class="fw-bold">${project.type}</div>
                            </div>
                        </div>
                    </div>

                    <div class="mb-3">
                        <div class="d-flex justify-content-between">
                            <span class="d-flex align-items-center">
                                <i class="bi bi-git me-1"></i>
                                <small>Git:</small>
                            </span>
                            <span class="badge ${project.hasGit ? 'bg-success' : 'bg-secondary'}">
                                ${project.hasGit ? 'Sí' : 'No'}
                            </span>
                        </div>
                        <div class="d-flex justify-content-between">
                            <span class="d-flex align-items-center">
                                <i class="bi bi-file-text me-1"></i>
                                <small>CLAUDE.md:</small>
                            </span>
                            <span class="badge ${project.hasClaude ? 'bg-success' : 'bg-warning'}">
                                ${project.hasClaude ? 'Sí' : 'No'}
                            </span>
                        </div>
                    </div>

                    <div class="d-grid gap-2">
                        <button class="btn btn-primary btn-sm" onclick="viewProjectInfo('${project.id}')">
                            <i class="bi bi-info-circle"></i> Ver Información
                        </button>
                        <div class="btn-group" role="group">
                            <button class="btn btn-success btn-sm" onclick="closeProject('${project.id}')" 
                                    title="${project.hasGit ? 'Cerrar proyecto con Git configurado' : 'Cerrar proyecto (inicializará Git automáticamente)'}">
                                <i class="bi bi-check-circle"></i> Cerrar Proyecto
                            </button>
                            <button class="btn btn-outline-primary btn-sm" onclick="deployProject('${project.id}')"
                                    title="Deploy automático (en desarrollo)">
                                <i class="bi bi-rocket"></i> Deploy
                            </button>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <small class="text-muted">
                        <i class="bi bi-folder"></i> ${project.path}
                    </small>
                </div>
            </div>
        </div>
    `).join('');
}

function getStatusBadge(status) {
    switch(status) {
        case 'active': return 'bg-success';
        case 'not_found': return 'bg-danger';
        default: return 'bg-secondary';
    }
}

function getStatusText(status) {
    switch(status) {
        case 'active': return 'Activo';
        case 'not_found': return 'No encontrado';
        default: return 'Desconocido';
    }
}

async function viewProjectInfo(projectId) {
    try {
        const response = await fetch(`/api/projects/${projectId}/info`);
        const project = await response.json();
        
        if (!response.ok) throw new Error(project.error);
        
        // Mostrar modal con información detallada
        showProjectInfoModal(project);
    } catch (error) {
        console.error('Error obteniendo información del proyecto:', error);
        showNotification('Error obteniendo información del proyecto', 'error');
    }
}

function showProjectInfoModal(project) {
    const modalHtml = `
        <div class="modal fade" id="projectInfoModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-folder"></i> Información de ${project.id}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <h6><i class="bi bi-tag"></i> Versión Actual</h6>
                                <p class="fw-bold">${project.currentVersion}</p>
                            </div>
                            <div class="col-md-6">
                                <h6><i class="bi bi-pencil"></i> Cambios Pendientes</h6>
                                <p class="fw-bold ${project.hasChanges ? 'text-warning' : 'text-success'}">
                                    ${project.hasChanges ? `${project.changeCount} archivos modificados` : 'Sin cambios'}
                                </p>
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <h6><i class="bi bi-clock-history"></i> Commits Recientes</h6>
                            <div class="bg-light p-3 rounded">
                                ${project.recentCommits.length > 0 ? 
                                    project.recentCommits.map(commit => `<div class="font-monospace small">${commit}</div>`).join('') :
                                    '<div class="text-muted">No hay commits</div>'
                                }
                            </div>
                        </div>
                        
                        ${project.hasClaude ? `
                            <div class="mb-3">
                                <h6><i class="bi bi-file-text"></i> CLAUDE.md (preview)</h6>
                                <div class="bg-light p-3 rounded">
                                    <pre class="mb-0" style="white-space: pre-wrap; font-size: 0.85rem;">${project.claudePreview || 'Archivo vacío'}...</pre>
                                </div>
                            </div>
                        ` : `
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle"></i> 
                                Este proyecto no tiene archivo CLAUDE.md. Se creará uno al cerrar el proyecto.
                            </div>
                        `}
                        
                        <div class="mb-3">
                            <h6><i class="bi bi-folder"></i> Ruta del Proyecto</h6>
                            <code>${project.path}</code>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                        ${project.hasChanges ? `
                            <button type="button" class="btn btn-success" onclick="closeProjectFromModal('${project.id}')">
                                <i class="bi bi-check-circle"></i> Cerrar Proyecto
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remover modal existente si lo hay
    const existingModal = document.getElementById('projectInfoModal');
    if (existingModal) existingModal.remove();
    
    // Agregar nuevo modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('projectInfoModal'));
    modal.show();
}

async function closeProject(projectId) {
    const confirmed = confirm(`¿Estás seguro de que quieres cerrar el proyecto "${projectId}"?\n\nEsto creará un commit con los cambios pendientes y añadirá un tag de versión.`);
    
    if (!confirmed) return;
    
    try {
        showNotification('Cerrando proyecto...', 'info');
        
        const response = await fetch(`/api/projects/${projectId}/close`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error);
        
        // Mostrar resultado del cierre
        showProjectCloseResult(result);
        
        // Recargar lista de proyectos
        setTimeout(loadProjects, 2000);
        
    } catch (error) {
        console.error('Error cerrando proyecto:', error);
        showNotification(`Error cerrando proyecto: ${error.message}`, 'error');
    }
}

async function closeProjectFromModal(projectId) {
    // Cerrar modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('projectInfoModal'));
    modal.hide();
    
    // Ejecutar cierre
    await closeProject(projectId);
}

function showProjectCloseResult(result) {
    const modalHtml = `
        <div class="modal fade" id="projectCloseResultModal" tabindex="-1">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">
                            <i class="bi bi-check-circle"></i> 🎉 Cierre Completado Exitosamente
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <!-- Resumen Principal -->
                        <div class="row mb-4">
                            <div class="col-md-6">
                                <div class="card bg-light">
                                    <div class="card-body">
                                        <h6><i class="bi bi-info-circle"></i> Información del Proyecto</h6>
                                        <p class="mb-1"><strong>Proyecto:</strong> ${result.summary?.project || result.project}</p>
                                        <p class="mb-1"><strong>Tipo:</strong> ${result.summary?.type || 'No especificado'}</p>
                                        <p class="mb-1"><strong>Versión:</strong> ${result.summary?.version || `${result.currentVersion} → ${result.newVersion}`}</p>
                                        <p class="mb-0"><strong>Fecha:</strong> ${result.summary?.date || new Date().toLocaleDateString()} ${result.summary?.time || new Date().toLocaleTimeString()}</p>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card bg-light">
                                    <div class="card-body">
                                        <h6><i class="bi bi-github"></i> Estado del Repositorio</h6>
                                        <p class="mb-1"><strong>Git:</strong> ${result.gitInitialized ? 'Inicializado ✅' : 'Validado ✅'}</p>
                                        <p class="mb-1"><strong>GitHub:</strong> ${result.pushedToGitHub ? 'Subido ✅' : result.needsRemote ? 'No configurado ⚠️' : 'Error ❌'}</p>
                                        <p class="mb-1"><strong>CLAUDE.md:</strong> ${result.steps.some(s => s.includes('creado')) ? 'Creado ✅' : 'Actualizado ✅'}</p>
                                        <p class="mb-0"><strong>Ubicación:</strong> ${result.summary?.location || 'No especificada'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Pasos Detallados -->
                        <div class="mb-4">
                            <h6><i class="bi bi-list-check"></i> Proceso de Cierre Ejecutado:</h6>
                            <div class="card">
                                <div class="card-body">
                                    <div class="row">
                                        ${result.steps.map((step, index) => `
                                            <div class="col-md-6 mb-2">
                                                <small class="text-muted">${index + 1}.</small> ${step}
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Estado específico según resultado -->
                        ${result.gitInitialized ? `
                            <div class="alert alert-info">
                                <i class="bi bi-git"></i> 
                                <strong>Repositorio Git inicializado</strong><br>
                                Este proyecto no tenía Git configurado. Se ha inicializado automáticamente con todas las mejores prácticas.
                            </div>
                        ` : ''}
                        
                        ${result.needsRemote ? `
                            <div class="alert alert-warning">
                                <i class="bi bi-github"></i> 
                                <strong>Configuración de GitHub pendiente</strong><br>
                                Para completar la integración con GitHub:
                                <div class="mt-3">
                                    <h6>Pasos a seguir:</h6>
                                    <ol>
                                        <li>Crear repositorio en GitHub: <strong>${result.project}</strong></li>
                                        <li>Ejecutar comandos de configuración:</li>
                                    </ol>
                                    <div class="bg-dark text-light p-3 rounded mt-2">
                                        <code class="d-block">${result.setupCommands[0]}</code>
                                        <code class="d-block">${result.setupCommands[1]}</code>
                                    </div>
                                    <button class="btn btn-sm btn-outline-primary mt-2" onclick="copyToClipboard('${result.setupCommands.join('\\n')}')">
                                        <i class="bi bi-clipboard"></i> Copiar comandos
                                    </button>
                                </div>
                            </div>
                        ` : result.pushedToGitHub ? `
                            <div class="alert alert-success">
                                <i class="bi bi-cloud-check"></i> 
                                <strong>✅ Proyecto subido exitosamente a GitHub</strong><br>
                                El proyecto está ahora disponible en línea con toda la documentación actualizada.
                                <div class="mt-2">
                                    <a href="${result.githubUrl}" target="_blank" class="btn btn-success">
                                        <i class="bi bi-github"></i> Ver en GitHub
                                    </a>
                                    <a href="${result.githubUrl}/releases/tag/${result.newVersion}" target="_blank" class="btn btn-outline-success ms-2">
                                        <i class="bi bi-tag"></i> Ver Release ${result.newVersion}
                                    </a>
                                </div>
                            </div>
                        ` : result.pushError ? `
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle"></i> 
                                <strong>Push a GitHub falló</strong><br>
                                Error: ${result.pushError}<br>
                                <div class="mt-2">
                                    <strong>Solución:</strong> Ejecuta manualmente:
                                    <code class="d-block mt-1 p-2 bg-dark text-light rounded">git push origin main --tags</code>
                                </div>
                            </div>
                        ` : ''}

                        <!-- Resumen de Acciones -->
                        ${result.summary ? `
                            <div class="card bg-primary text-white">
                                <div class="card-body">
                                    <h6><i class="bi bi-clipboard-check"></i> Resumen de Acciones Completadas:</h6>
                                    <div class="row">
                                        ${result.summary.actions.map(action => `
                                            <div class="col-md-6">
                                                <small>✅ ${action}</small>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        ${result.needsRemote ? `
                            <a href="https://github.com/new" target="_blank" class="btn btn-success">
                                <i class="bi bi-plus-circle"></i> Crear repositorio en GitHub
                            </a>
                        ` : ''}
                        ${result.pushedToGitHub ? `
                            <a href="${result.githubUrl}" target="_blank" class="btn btn-outline-primary">
                                <i class="bi bi-github"></i> Ir a GitHub
                            </a>
                        ` : ''}
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">
                            <i class="bi bi-check-lg"></i> Entendido
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remover modal existente si lo hay
    const existingModal = document.getElementById('projectCloseResultModal');
    if (existingModal) existingModal.remove();
    
    // Agregar nuevo modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('projectCloseResultModal'));
    modal.show();
    
    showNotification(`Proyecto ${result.project} cerrado exitosamente`, 'success');
}

async function deployProject(projectId) {
    showNotification('Función de deploy en desarrollo...', 'info');
    // TODO: Implementar deploy desde dashboard
}

// Función auxiliar para copiar al portapapeles
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Comandos copiados al portapapeles', 'success');
    } catch (err) {
        console.error('Error copiando al portapapeles:', err);
        showNotification('Error copiando al portapapeles', 'error');
    }
}

// Función auxiliar para mostrar notificaciones
function showNotification(message, type = 'info') {
    const alertClass = type === 'error' ? 'alert-danger' : 
                      type === 'success' ? 'alert-success' : 
                      type === 'warning' ? 'alert-warning' : 'alert-info';
    
    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} alert-dismissible fade show notification`;
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.getElementById('notifications').appendChild(notification);
    
    // Auto-eliminar después de 5 segundos
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}