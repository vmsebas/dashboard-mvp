// projects.js - Gestión de proyectos desde el dashboard

let projects = [];
let userRepos = [];

// Función para mostrar skeleton loaders
function showProjectsSkeleton() {
    const container = document.getElementById('projects-list');
    if (!container) return;
    
    const skeleton = `
        <div class="col-lg-4 col-md-6 mb-4">
            <div class="skeleton-card">
                <div class="skeleton-line skeleton-title"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
                <div class="d-flex gap-2 mt-3">
                    <div class="skeleton-line" style="width: 80px; height: 30px;"></div>
                    <div class="skeleton-line" style="width: 80px; height: 30px;"></div>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = skeleton.repeat(6);
}

// Cargar proyectos al inicializar
document.addEventListener('DOMContentLoaded', function() {
    loadProjects();
    
    // Actualizar cada 30 segundos
    setInterval(loadProjects, 30000);
});

async function loadProjects() {
    try {
        // Mostrar skeleton loader
        showProjectsSkeleton();
        
        const response = await fetch('/api/projects/list');
        const data = await response.json();
        projects = data.projects;
        renderProjects();
        updateGlobalNotifications();
        updateSyncSummary();
        
        // Actualizar badges en tabs
        if (window.updateTabBadges) {
            window.updateTabBadges();
        }
    } catch (error) {
        console.error('Error cargando proyectos:', error);
        showNotification('Error cargando proyectos', 'error');
    }
}

// Función para actualizar notificaciones globales
function updateGlobalNotifications() {
    const container = document.getElementById('global-notifications');
    const notifications = [];
    
    
    // Analizar todos los proyectos
    projects.forEach(project => {
        if (project.gitStatus) {
            const alerts = [];
            
            if (project.gitStatus.needsCommit) {
                alerts.push(`${project.gitStatus.changedFiles} archivo${project.gitStatus.changedFiles > 1 ? 's' : ''} sin commitear`);
            }
            
            if (project.gitStatus.needsPush) {
                alerts.push(`${project.gitStatus.unpushedCommits} commit${project.gitStatus.unpushedCommits > 1 ? 's' : ''} sin push`);
            }
            
            if (project.gitStatus.needsRedeploy && project.gitStatus.isDeployed) {
                alerts.push('necesita re-deploy');
            }
            
            if (alerts.length > 0) {
                notifications.push({
                    project: project.name,
                    projectId: project.id,
                    alerts: alerts,
                    type: project.gitStatus.needsRedeploy ? 'danger' : project.gitStatus.needsPush ? 'warning' : 'info'
                });
            }
        }
    });
    
    // Limpiar contenedor
    container.innerHTML = '';
    
    // Si hay notificaciones, mostrarlas
    if (notifications.length > 0) {
        const alertHtml = `
            <div class="alert alert-warning alert-dismissible fade show sync-notification-banner" role="alert">
                <div class="d-flex align-items-center">
                    <i class="bi bi-exclamation-triangle-fill me-2"></i>
                    <div class="flex-grow-1">
                        <strong>Proyectos con cambios pendientes:</strong>
                        <div class="d-flex flex-wrap gap-3 mt-2">
                            ${notifications.map(notif => `
                                <div class="notification-item">
                                    <i class="bi bi-folder-fill text-${notif.type} me-1"></i>
                                    <strong>${DashboardUtils.escapeHtml(notif.project)}:</strong>
                                    <span class="text-muted small">${notif.alerts.join(', ')}</span>
                                    <button class="btn btn-sm btn-link p-0 ms-2" onclick="startProject('${notif.projectId}')">
                                        <i class="bi bi-eye"></i>
                                    </button>
                                    ${notif.type === 'danger' ? `
                                        <button class="btn btn-sm btn-link text-danger p-0 ms-1" onclick="deployProject('${notif.projectId}')">
                                            <i class="bi bi-arrow-repeat"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert"></button>
                </div>
            </div>
        `;
        
        container.innerHTML = alertHtml;
        
        // También actualizar el título de la página para llamar la atención
        const totalAlerts = notifications.reduce((sum, n) => sum + n.alerts.length, 0);
        document.title = `(${totalAlerts}) Mac Mini Server Dashboard`;
    } else {
        console.log('No notifications to show');
        // Sin notificaciones, título normal
        document.title = 'Mac Mini Server Dashboard';
    }
}

// Función para actualizar el resumen de sincronización
function updateSyncSummary() {
    let totalProjects = projects.length;
    let syncedProjects = 0;
    let pendingCommits = 0;
    let needsDeploy = 0;
    
    projects.forEach(project => {
        if (project.gitStatus) {
            if (!project.gitStatus.needsCommit && !project.gitStatus.needsPush) {
                syncedProjects++;
            }
            if (project.gitStatus.needsCommit || project.gitStatus.needsPush) {
                pendingCommits++;
            }
            if (project.gitStatus.needsRedeploy) {
                needsDeploy++;
            }
        } else {
            syncedProjects++; // Si no tiene git, lo consideramos sincronizado
        }
    });
    
    // Actualizar los contadores
    document.getElementById('total-projects').textContent = totalProjects;
    document.getElementById('synced-projects').textContent = syncedProjects;
    document.getElementById('pending-commits').textContent = pendingCommits;
    document.getElementById('needs-deploy').textContent = needsDeploy;
}

function renderProjects() {
    const container = document.getElementById('projects-list');
    
    if (projects.length === 0) {
        container.innerHTML = `
            <div class="col-12">
                <div class="empty-state text-center py-5">
                    <i class="bi bi-folder-plus display-1 text-muted"></i>
                    <h5 class="mt-3">No hay proyectos activos</h5>
                    <p class="text-muted">Comienza clonando un repositorio desde GitHub o creando uno nuevo</p>
                    <div class="mt-4">
                        <button class="btn btn-primary me-2" onclick="showCloneFromGitHubModal()">
                            <i class="bi bi-github"></i> Clonar desde GitHub
                        </button>
                        <button class="btn btn-outline-primary" onclick="showNewProjectModal()">
                            <i class="bi bi-plus-circle"></i> Nuevo Proyecto
                        </button>
                    </div>
                </div>
            </div>
        `;
        updateTabBadges(); // Actualizar badges cuando no hay proyectos
        return;
    }

    container.innerHTML = projects.map(project => {
        // Preparar indicadores de estado
        let statusIndicators = [];
        if (project.gitStatus) {
            if (project.gitStatus.needsCommit) {
                statusIndicators.push('<span class="badge bg-warning" title="Cambios sin commitear"><i class="bi bi-exclamation-circle"></i> ' + project.gitStatus.changedFiles + ' cambios</span>');
            }
            if (project.gitStatus.needsPush) {
                statusIndicators.push('<span class="badge bg-info" title="Commits sin push"><i class="bi bi-cloud-upload"></i> ' + project.gitStatus.unpushedCommits + ' commits</span>');
            }
            if (project.gitStatus.needsRedeploy) {
                statusIndicators.push('<span class="badge bg-danger" title="Necesita re-deploy"><i class="bi bi-arrow-repeat"></i> Re-deploy</span>');
            }
        }
        
        // Añadir clase para badges
        const needsAttention = project.gitStatus?.needsCommit || project.gitStatus?.needsPush || project.gitStatus?.needsRedeploy;
        
        return `
        <div class="col-lg-4 col-md-6 mb-4">
            <div class="card h-100 ${project.gitStatus?.needsRedeploy ? 'border-danger' : ''} ${needsAttention ? 'project-warning' : ''}">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">
                        <i class="bi bi-folder"></i> ${DashboardUtils.escapeHtml(project.name)}
                    </h6>
                    <span class="badge ${getStatusBadge(project.status)}">${getStatusText(project.status)}</span>
                </div>
                <div class="card-body">
                    <p class="text-muted small mb-2">${DashboardUtils.escapeHtml(project.description || '')}</p>
                    
                    ${statusIndicators.length > 0 ? `
                        <div class="mb-2">
                            ${statusIndicators.join(' ')}
                        </div>
                    ` : ''}
                    
                    <div class="mb-3">
                        <div class="row g-2">
                            <div class="col-6">
                                <div class="d-flex align-items-center">
                                    <i class="bi bi-tag me-1"></i>
                                    <small class="text-muted">Versión:</small>
                                </div>
                                <div class="fw-bold">${DashboardUtils.escapeHtml(project.currentVersion || 'Sin versión')}</div>
                            </div>
                            <div class="col-6">
                                <div class="d-flex align-items-center">
                                    <i class="bi bi-gear me-1"></i>
                                    <small class="text-muted">Tipo:</small>
                                </div>
                                <div class="fw-bold">${DashboardUtils.escapeHtml(project.type || 'Desconocido')}</div>
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
                        <div class="btn-group" role="group">
                            <button class="btn btn-info btn-sm" onclick="showProjectInfo('${project.id}')">
                                <i class="bi bi-info-circle"></i> Información
                            </button>
                            <button class="btn btn-primary btn-sm" onclick="showProjectDocs('${project.id}')">
                                <i class="bi bi-file-earmark-text"></i> Documentación
                            </button>
                        </div>
                        <div class="btn-group" role="group">
                            <button class="btn btn-outline-success btn-sm" onclick="startProject('${project.id}')"
                                    title="Analizar e iniciar desarrollo">
                                <i class="bi bi-play-circle"></i> Iniciar Desarrollo
                            </button>
                            <button class="btn ${project.gitStatus?.needsRedeploy ? 'btn-danger' : 'btn-outline-primary'} btn-sm" 
                                    onclick="deployProject('${project.id}')"
                                    title="${project.gitStatus?.needsRedeploy ? 'Re-deploy necesario - hay cambios pendientes' : 'Deploy automático con Nginx y DNS'}">
                                <i class="bi bi-${project.gitStatus?.needsRedeploy ? 'arrow-repeat' : 'rocket'}"></i> 
                                ${project.gitStatus?.needsRedeploy ? 'Re-deploy' : 'Deploy'}
                            </button>
                        </div>
                        <button class="btn btn-success btn-sm" onclick="closeProject('${project.id}')" 
                                title="${project.hasGit ? 'Cerrar proyecto con Git configurado' : 'Cerrar proyecto (inicializará Git automáticamente)'}">
                            <i class="bi bi-check-circle"></i> Cerrar Proyecto
                        </button>
                    </div>
                </div>
                <div class="card-footer d-flex justify-content-between align-items-center">
                    <small class="text-muted">
                        <i class="bi bi-folder"></i> ${project.path}
                    </small>
                    <button class="btn btn-danger btn-sm" onclick="deleteProject('${project.id}')" 
                            title="Eliminar proyecto completamente">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    }).join('');
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
                            <div class="alert alert-secondary">
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
    console.log('deployProject llamado para:', projectId);
    try {
        // Mostrar modal de configuración de deploy
        await showDeployConfigModal(projectId);
    } catch (error) {
        console.error('Error mostrando modal de deploy:', error);
        console.error('Stack trace:', error.stack);
        showNotification('Error al mostrar configuración de deploy', 'error');
    }
}

async function startProject(projectId) {
    try {
        showNotification('Analizando proyecto...', 'info');
        
        const response = await fetch(`/api/projects/${projectId}/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mode: 'analyze' }) // Primero analizar
        });
        
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error);
        
        // Mostrar análisis del proyecto
        showProjectAnalysis(result);
        
        // Actualizar lista de proyectos después de iniciar
        setTimeout(loadProjects, 2000);
        
    } catch (error) {
        console.error('Error analizando proyecto:', error);
        showNotification(`Error: ${error.message}`, 'error');
    }
}

async function showDeployConfigModal(projectId) {
    console.log('==== showDeployConfigModal INICIO ====');
    console.log('ProjectId recibido:', projectId);
    console.log('Tipo de projectId:', typeof projectId);
    console.log('Proyectos disponibles:', projects.map(p => ({ id: p.id, name: p.name, type: typeof p.id })));
    
    // Buscar el proyecto para verificar si tiene cambios
    const project = projects.find(p => p.id === projectId);
    console.log('Proyecto encontrado:', project);
    console.log('==== showDeployConfigModal búsqueda completa ====');
    
    const hasUncommittedChanges = project?.gitStatus?.needsCommit || false;
    
    // Cargar el puerto actual del registro de aplicaciones
    let currentPort = null;
    let currentDomain = null;
    try {
        const response = await fetch('/api/apps/registry');
        const data = await response.json();
        
        // Buscar en el registro usando diferentes posibles nombres
        const projectName = project?.name || projectId;
        let registryEntry = null;
        
        // Intentar encontrar la entrada en el registro
        if (data.apps) {
            // Buscar por nombre exacto
            registryEntry = data.apps[projectName];
            
            // Si no se encuentra, buscar por ID
            if (!registryEntry) {
                registryEntry = data.apps[projectId];
            }
            
            // Si aún no se encuentra, buscar por coincidencias parciales
            if (!registryEntry) {
                for (const [key, value] of Object.entries(data.apps)) {
                    if (key.toLowerCase() === projectName.toLowerCase() || 
                        key.toLowerCase() === projectId.toLowerCase()) {
                        registryEntry = value;
                        break;
                    }
                }
            }
            
            // Si aún no se encuentra, buscar por ruta del proyecto
            if (!registryEntry && project?.path) {
                for (const [key, value] of Object.entries(data.apps)) {
                    if (value.path === project.path) {
                        registryEntry = value;
                        console.log(`Encontrado por ruta: ${key} -> ${project.path}`);
                        break;
                    }
                }
            }
        }
        
        if (registryEntry) {
            currentPort = registryEntry.port;
            currentDomain = registryEntry.domain;
        }
    } catch (error) {
        console.error('Error cargando registro de aplicaciones:', error);
    }
    
    const modalHtml = `
        <div class="modal fade" id="deployConfigModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-rocket"></i> Configurar Deploy - ${projectId}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${hasUncommittedChanges ? `
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle"></i>
                                <strong>Cambios sin commitear detectados</strong><br>
                                <small>El script de deploy cerrará automáticamente el proyecto y creará un commit con los cambios pendientes antes de continuar.</small>
                            </div>
                        ` : ''}
                        
                        ${currentPort ? `
                            <div class="alert alert-secondary">
                                <i class="bi bi-info-circle"></i>
                                <strong>Configuración actual detectada:</strong><br>
                                <small>Puerto: <strong>${currentPort}</strong></small>
                                ${currentDomain ? `<br><small>Dominio: <strong>${currentDomain}</strong></small>` : ''}
                            </div>
                        ` : ''}
                        
                        <form id="deployConfigForm">
                            <div class="mb-3">
                                <label for="domain" class="form-label">Dominio</label>
                                <select class="form-select" id="domain" onchange="updateDomainPreview()">
                                    <option value="lisbontiles.com" ${(!currentDomain || currentDomain.includes('lisbontiles.com')) ? 'selected' : ''}>lisbontiles.com</option>
                                    <option value="lisbontiles.net" ${currentDomain && currentDomain.includes('lisbontiles.net') ? 'selected' : ''}>lisbontiles.net</option>
                                    <option value="vimasero.com" ${currentDomain && currentDomain.includes('vimasero.com') ? 'selected' : ''}>vimasero.com</option>
                                </select>
                                <div class="form-text">Selecciona el dominio principal para tu aplicación</div>
                            </div>
                            <div class="mb-3">
                                <label for="subdomain" class="form-label">Subdominio</label>
                                <div class="input-group">
                                    <input type="text" class="form-control" id="subdomain" 
                                           placeholder="${projectId}" value="${currentDomain ? currentDomain.split('.')[0] : projectId}"
                                           oninput="updateDomainPreview()">
                                    <span class="input-group-text" id="domainSuffix">.lisbontiles.com</span>
                                </div>
                                <div class="form-text" id="urlPreview">URL final: https://[subdominio].lisbontiles.com</div>
                            </div>
                            <div class="mb-3">
                                <label for="port" class="form-label">Puerto <span class="text-danger">*</span></label>
                                <div class="input-group">
                                    <input type="number" class="form-control" id="port" 
                                           placeholder="${currentPort || '8500'}" value="${currentPort || ''}" min="1000" max="65535" required>
                                    <button class="btn btn-outline-secondary" type="button" id="suggestPortBtn">
                                        <i class="bi bi-lightbulb"></i> Sugerir
                                    </button>
                                </div>
                                ${currentPort ? `
                                    <div class="form-check mt-2">
                                        <input class="form-check-input" type="checkbox" id="keepCurrentPort" checked>
                                        <label class="form-check-label" for="keepCurrentPort">
                                            Mantener puerto actual (${currentPort})
                                        </label>
                                    </div>
                                ` : ''}
                                <div class="form-text">
                                    <strong>Puertos recomendados:</strong> 4200, 4500, 4800, 5200, 5500, 5800, 6200, 6500, 6800, 7200, 7500, 7800, 8200, 8500, 8800<br>
                                    <strong class="text-warning">Evitar:</strong> 3000, 5000, 8000, 8080 (comúnmente usados)
                                </div>
                            </div>
                            <div class="mb-3" id="portsInUse">
                                <div class="text-muted small">Cargando puertos en uso...</div>
                            </div>
                            <!-- Información de acceso -->
                            <div class="alert alert-info">
                                <i class="bi bi-globe"></i>
                                <strong>Tu aplicación será accesible a través de:</strong>
                                <ul class="mb-0 mt-2">
                                    <li><i class="bi bi-house-door"></i> <strong>Local:</strong> <code>http://localhost:[puerto]</code></li>
                                    <li id="tailscale-info-deploy-modal">
                                        <i class="bi bi-shield-lock"></i> <strong>Tailscale:</strong> <span class="text-muted">Verificando...</span>
                                    </li>
                                    <li><i class="bi bi-cloud"></i> <strong>Cloudflare (opcional):</strong> Requiere túnel activo</li>
                                </ul>
                            </div>
                            
                            <div class="alert alert-secondary">
                                <i class="bi bi-gear"></i>
                                <strong>El deploy incluye:</strong>
                                <ul class="mb-0 mt-2">
                                    <li>Configuración automática de Nginx</li>
                                    <li>DNS en Cloudflare</li>
                                    <li>SSL automático</li>
                                    <li>Monitoreo con PM2/Docker</li>
                                    ${hasUncommittedChanges ? '<li class="text-warning"><strong>Auto-cierre del proyecto con versionado</strong></li>' : ''}
                                </ul>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-success" onclick="executeDeploy('${projectId}')">
                            <i class="bi bi-rocket"></i> Deployar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remover modal existente si lo hay
    const existingModal = document.getElementById('deployConfigModal');
    if (existingModal) existingModal.remove();
    
    // Agregar nuevo modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Mostrar modal
    console.log('Creando modal Bootstrap...');
    const modalElement = document.getElementById('deployConfigModal');
    console.log('Elemento modal encontrado:', modalElement);
    
    const modal = new bootstrap.Modal(modalElement);
    console.log('Modal Bootstrap creado:', modal);
    
    modal.show();
    console.log('Modal.show() ejecutado');
    
    // Cargar puertos en uso y configurar eventos
    loadPortsInUse();
    setupPortSuggestions();
    
    // Inicializar el preview del dominio
    updateDomainPreview();
    
    // Cargar información de Tailscale
    updateTailscaleInfoInModal();
    
    // Si hay un checkbox de mantener puerto actual, configurar el evento
    if (currentPort) {
        const keepPortCheckbox = document.getElementById('keepCurrentPort');
        const portInput = document.getElementById('port');
        
        if (keepPortCheckbox) {
            keepPortCheckbox.addEventListener('change', function() {
                if (this.checked) {
                    portInput.value = currentPort;
                    portInput.readOnly = true;
                } else {
                    portInput.readOnly = false;
                }
            });
            
            // Inicialmente hacer el campo de solo lectura si el checkbox está marcado
            if (keepPortCheckbox.checked) {
                portInput.readOnly = true;
            }
        }
    }
    
    console.log('==== showDeployConfigModal COMPLETADO ====');
}

async function loadPortsInUse() {
    try {
        const response = await fetch('/api/system/ports');
        const data = await response.json();
        
        // Guardar puertos en uso para sugerencias
        window.portsInUse = data.ports || [];
        
        const portsContainer = document.getElementById('portsInUse');
        if (data.ports && data.ports.length > 0) {
            portsContainer.innerHTML = `
                <div class="alert alert-warning p-2">
                    <strong class="small">Puertos actualmente en uso:</strong>
                    <div class="mt-1">
                        ${data.ports.map(port => `<span class="badge bg-secondary me-1">${port}</span>`).join('')}
                    </div>
                </div>
            `;
        } else {
            portsContainer.innerHTML = '';
        }
    } catch (error) {
        console.error('Error cargando puertos:', error);
        window.portsInUse = [];
    }
}

// Nueva función para configurar sugerencias de puerto
function setupPortSuggestions() {
    const suggestBtn = document.getElementById('suggestPortBtn');
    const portInput = document.getElementById('port');
    
    if (suggestBtn) {
        suggestBtn.addEventListener('click', function() {
            const suggestedPort = getSuggestedPort();
            if (suggestedPort) {
                portInput.value = suggestedPort;
                showNotification(`Puerto ${suggestedPort} sugerido (disponible)`, 'success');
            } else {
                showNotification('No se encontraron puertos disponibles en el rango recomendado', 'warning');
            }
        });
    }
}

// Nueva función para obtener un puerto sugerido
function getSuggestedPort() {
    // Lista de puertos recomendados
    const recommendedPorts = [4200, 4500, 4800, 5200, 5500, 5800, 6200, 6500, 6800, 7200, 7500, 7800, 8200, 8500, 8800, 9200, 9500, 9800];
    const portsInUse = window.portsInUse || [];
    
    // Buscar el primer puerto disponible
    for (const port of recommendedPorts) {
        if (!portsInUse.includes(port)) {
            return port;
        }
    }
    
    // Si todos están ocupados, buscar uno al azar en rangos seguros
    for (let i = 0; i < 50; i++) {
        const randomPort = 4000 + Math.floor(Math.random() * 5000); // Entre 4000 y 9000
        if (!portsInUse.includes(randomPort) && 
            randomPort !== 3000 && randomPort !== 5000 && 
            randomPort !== 8000 && randomPort !== 8080) {
            return randomPort;
        }
    }
    
    return null;
}

async function executeDeploy(projectId) {
    const domain = document.getElementById('domain').value;
    const subdomainInput = document.getElementById('subdomain');
    const subdomain = subdomainInput.value.trim() || projectId;
    const port = document.getElementById('port').value.trim();
    
    if (!subdomain) {
        showNotification('El subdominio es requerido', 'error');
        return;
    }
    
    if (!port) {
        showNotification('El puerto es obligatorio', 'error');
        return;
    }
    
    // Verificar si el puerto está en el rango válido
    const portNum = parseInt(port);
    if (portNum < 1000 || portNum > 65535) {
        showNotification('El puerto debe estar entre 1000 y 65535', 'error');
        return;
    }
    
    // Buscar el proyecto para verificar si tiene cambios
    const project = projects.find(p => p.id === projectId);
    const hasUncommittedChanges = project?.gitStatus?.needsCommit || false;
    
    // Cerrar modal de configuración
    const modal = bootstrap.Modal.getInstance(document.getElementById('deployConfigModal'));
    modal.hide();
    
    try {
        if (hasUncommittedChanges) {
            showNotification('Cerrando proyecto automáticamente antes del deploy...', 'info');
        }
        showNotification(`Deployando proyecto en ${subdomain}.${domain}...`, 'info');
        
        const response = await fetch(`/api/projects/${projectId}/deploy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ subdomain, domain, port })
        });
        
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error);
        
        // Mostrar resultado del deploy
        await showProjectDeployResult(result);
        
        // Recargar lista de proyectos
        setTimeout(loadProjects, 3000);
        
    } catch (error) {
        console.error('Error deployando proyecto:', error);
        
        // Analizar el tipo de error para dar mensajes más útiles
        let userMessage = error.message;
        let suggestions = [];
        
        if (error.message.includes('puerto') && error.message.includes('en uso')) {
            userMessage = 'El puerto está ocupado por otro proceso';
            suggestions.push('Verificar si el proyecto ya está corriendo');
            suggestions.push('Usar un puerto diferente');
            suggestions.push('Detener el proceso existente si es necesario');
        } else if (error.message.includes('Command failed') && error.message.includes('project-deploy.sh')) {
            userMessage = 'Error en el script de deployment';
            suggestions.push('Verificar logs del servidor para más detalles');
            suggestions.push('Verificar permisos y dependencias del proyecto');
        }
        
        // Mostrar notificación mejorada con sugerencias
        const notificationOptions = {
            persistent: true,
            actions: suggestions.length > 0 ? [
                {
                    text: 'Ver Sugerencias',
                    style: 'info',
                    onclick: `showDeployErrorModal('${projectId}', '${userMessage}', ${JSON.stringify(suggestions).replace(/"/g, '&quot;')})`
                }
            ] : []
        };
        
        showNotification(`Error en deploy: ${userMessage}`, 'error', notificationOptions);
    }
}

// Mostrar modal de error con sugerencias
function showDeployErrorModal(projectId, errorMessage, suggestions) {
    const suggestionsHtml = suggestions.map(suggestion => `
        <li class="mb-2">
            <i class="bi bi-lightbulb text-warning"></i> ${suggestion}
        </li>
    `).join('');
    
    const modalHtml = `
        <div class="modal fade" id="deployErrorModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-warning text-dark">
                        <h5 class="modal-title">
                            <i class="bi bi-exclamation-triangle"></i> Error de Deployment
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-danger">
                            <h6><i class="bi bi-x-circle"></i> Error encontrado:</h6>
                            <p class="mb-0">${errorMessage}</p>
                        </div>
                        
                        <h6><i class="bi bi-lightbulb"></i> Sugerencias para resolver el problema:</h6>
                        <ul class="list-unstyled">
                            ${suggestionsHtml}
                        </ul>
                        
                        <div class="row mt-4">
                            <div class="col-md-6">
                                <div class="card bg-light">
                                    <div class="card-body">
                                        <h6><i class="bi bi-info-circle"></i> Estado del Proyecto</h6>
                                        <p class="small">Verifica si el proyecto ya está corriendo:</p>
                                        <button class="btn btn-sm btn-outline-primary" onclick="checkProjectStatus('${projectId}')">
                                            <i class="bi bi-search"></i> Verificar Estado
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card bg-light">
                                    <div class="card-body">
                                        <h6><i class="bi bi-terminal"></i> Acciones Rápidas</h6>
                                        <p class="small">Opciones para resolver el problema:</p>
                                        <div class="btn-group-vertical w-100">
                                            <button class="btn btn-sm btn-outline-info" onclick="showPortChecker()">
                                                <i class="bi bi-ethernet"></i> Ver Puertos Disponibles
                                            </button>
                                            <button class="btn btn-sm btn-outline-warning" onclick="suggestAlternativePort('${projectId}')">
                                                <i class="bi bi-arrow-repeat"></i> Probar Puerto Alternativo
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="bi bi-x-lg"></i> Cerrar
                        </button>
                        <button type="button" class="btn btn-primary" onclick="retryDeploy('${projectId}')">
                            <i class="bi bi-arrow-clockwise"></i> Intentar de Nuevo
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remover modal existente
    const existingModal = document.getElementById('deployErrorModal');
    if (existingModal) existingModal.remove();
    
    // Agregar y mostrar modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('deployErrorModal'));
    modal.show();
}

// Funciones auxiliares para el modal de error
function checkProjectStatus(projectId) {
    showNotification('Verificando estado del proyecto...', 'info');
    loadProjects(); // Recargar la lista para ver el estado actual
}

function showPortChecker() {
    // Implementar verificador de puertos
    showNotification('Verificando puertos disponibles...', 'info');
    // Aquí podrías llamar a una API para obtener puertos disponibles
}

function suggestAlternativePort(projectId) {
    const alternativePorts = [4500, 5200, 5500, 6200, 6500, 7200, 7500, 8200, 8500];
    const randomPort = alternativePorts[Math.floor(Math.random() * alternativePorts.length)];
    
    showNotification(`Puerto sugerido: ${randomPort}. Úsalo en la configuración de deploy.`, 'info', {
        persistent: true,
        actions: [{
            text: 'Copiar Puerto',
            style: 'primary',
            onclick: `copyToClipboard('${randomPort}')`
        }]
    });
}

function retryDeploy(projectId) {
    // Cerrar modal y abrir configuración de deploy nuevamente
    const modal = bootstrap.Modal.getInstance(document.getElementById('deployErrorModal'));
    if (modal) modal.hide();
    
    setTimeout(() => {
        deployProject(projectId);
    }, 500);
}

async function showProjectDeployResult(result) {
    // Obtener información fresca de Tailscale desde el servidor
    let tailscaleHostname = 'mini-server';
    let tailscaleSuffix = '';
    let tailscaleActive = false;
    let tailscaleFunnel = false;
    
    try {
        const tailscaleResponse = await fetch('/api/system/tailscale');
        if (tailscaleResponse.ok) {
            const tailscaleData = await tailscaleResponse.json();
            tailscaleHostname = tailscaleData.hostname || 'mini-server';
            tailscaleSuffix = tailscaleData.magicDNSSuffix || '';
            tailscaleActive = tailscaleData.active || false;
            tailscaleFunnel = tailscaleData.funnel || false;
            
            // Actualizar también la variable global para futuro uso
            window.tailscaleInfo = tailscaleData;
        }
    } catch (error) {
        console.warn('No se pudo obtener información de Tailscale:', error);
    }
    
    // Extraer puerto del resultado o de la URL local
    let port = result.port;
    if (!port && result.localUrl) {
        const portMatch = result.localUrl.match(/:(\d+)$/);
        if (portMatch) {
            port = portMatch[1];
        }
    }
    port = port || '3000';
    
    // Construir URL de Tailscale
    const tailscaleUrl = tailscaleActive && tailscaleHostname && tailscaleSuffix
        ? `https://${tailscaleHostname}.${tailscaleSuffix}:${port}`
        : `https://${tailscaleHostname}:${port}`;
    
    const modalHtml = `
        <div class="modal fade" id="projectDeployResultModal" tabindex="-1">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">
                            <i class="bi bi-rocket"></i> 🚀 Deploy Completado Exitosamente
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <!-- Resumen Principal -->
                        <div class="row mb-4">
                            <div class="col-md-6">
                                <div class="card bg-light">
                                    <div class="card-body">
                                        <h6><i class="bi bi-info-circle"></i> Información del Deploy</h6>
                                        <p class="mb-1"><strong>Proyecto:</strong> ${result.project}</p>
                                        <p class="mb-1"><strong>Fecha:</strong> ${new Date(result.timestamp).toLocaleDateString()} ${new Date(result.timestamp).toLocaleTimeString()}</p>
                                        <p class="mb-0"><strong>Estado:</strong> <span class="badge bg-success">Exitoso</span></p>
                                        ${result.autoClosed ? `<p class="mb-0 mt-2"><span class="badge bg-info">✅ Proyecto cerrado automáticamente</span></p>` : ''}
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card bg-primary text-white">
                                    <div class="card-body">
                                        <h6><i class="bi bi-globe"></i> URLs de Acceso</h6>
                                        
                                        <!-- URL Local -->
                                        <div class="mb-3 bg-white bg-opacity-10 p-2 rounded">
                                            <div class="d-flex justify-content-between align-items-center">
                                                <div>
                                                    <i class="bi bi-house-door"></i> <strong>Local:</strong><br>
                                                    <code class="text-white">${result.localUrl || 'http://localhost:' + port}</code>
                                                </div>
                                                <button class="btn btn-sm btn-light" onclick="copyToClipboard('${result.localUrl || 'http://localhost:' + port}')">
                                                    <i class="bi bi-clipboard"></i>
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <!-- URL Tailscale -->
                                        ${tailscaleActive ? `
                                        <div class="mb-3 bg-white bg-opacity-10 p-2 rounded">
                                            <div class="d-flex justify-content-between align-items-center">
                                                <div>
                                                    <i class="bi bi-shield-check"></i> <strong>Tailscale VPN:</strong><br>
                                                    <code class="text-white">${tailscaleUrl}</code>
                                                    ${tailscaleFunnel && window.tailscaleInfo.funnelPorts?.includes(parseInt(port)) ? '<span class="badge bg-info ms-1">Funnel activo</span>' : ''}
                                                </div>
                                                <button class="btn btn-sm btn-light" onclick="copyToClipboard('${tailscaleUrl}')">
                                                    <i class="bi bi-clipboard"></i>
                                                </button>
                                            </div>
                                            ${!tailscaleFunnel ? '<small class="text-white-50">Requiere estar conectado a Tailscale VPN</small>' : ''}
                                        </div>
                                        ` : `
                                        <div class="mb-3 bg-white bg-opacity-10 p-2 rounded">
                                            <div class="text-white-50">
                                                <i class="bi bi-shield-x"></i> <strong>Tailscale:</strong> No disponible
                                                <br><small>Instala y configura Tailscale para acceso remoto seguro</small>
                                            </div>
                                        </div>
                                        `}
                                        
                                        <!-- URL Cloudflare -->
                                        ${result.deployUrl ? `
                                        <div class="bg-white bg-opacity-10 p-2 rounded border border-warning">
                                            <div class="d-flex justify-content-between align-items-start">
                                                <div class="flex-grow-1">
                                                    <div class="d-flex align-items-center mb-1">
                                                        <i class="bi bi-cloud"></i> <strong>Cloudflare:</strong>
                                                        <span class="badge bg-warning text-dark ms-2" title="Cloudflare Tunnel puede estar inestable">
                                                            <i class="bi bi-exclamation-triangle"></i> Inestable
                                                        </span>
                                                    </div>
                                                    <code class="text-white">${result.deployUrl}</code>
                                                    <br><small class="text-warning">⚠️ Si da Error 1033, usa las URLs de arriba (más confiables)</small>
                                                </div>
                                                <button class="btn btn-sm btn-light ms-2" onclick="copyToClipboard('${result.deployUrl}')">
                                                    <i class="bi bi-clipboard"></i>
                                                </button>
                                            </div>
                                        </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>

                        ${result.autoClosed ? `
                            <div class="alert alert-secondary mb-3">
                                <i class="bi bi-check-circle"></i>
                                <strong>Auto-cierre ejecutado</strong><br>
                                <small>Se detectó cambios sin commitear y el proyecto fue cerrado automáticamente con la nueva versión <strong>${result.newVersion || 'N/A'}</strong> antes del deploy.</small>
                            </div>
                        ` : ''}
                        
                        <!-- Output del Script -->
                        <div class="mb-4">
                            <h6><i class="bi bi-terminal"></i> Log del Deploy:</h6>
                            <div class="card">
                                <div class="card-body">
                                    <pre class="mb-0" style="white-space: pre-wrap; font-size: 0.85rem; max-height: 400px; overflow-y: auto;">${result.output}</pre>
                                </div>
                            </div>
                        </div>

                        ${result.error ? `
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle"></i>
                                <strong>Advertencias:</strong>
                                <pre class="mb-0 mt-2">${result.error}</pre>
                            </div>
                        ` : ''}

                        <div class="alert alert-success">
                            <i class="bi bi-check-circle"></i>
                            <strong>✅ Deploy completado exitosamente</strong><br>
                            ${result.deployUrl ? `Tu aplicación está disponible en: <a href="${result.deployUrl}" target="_blank">${result.deployUrl}</a>` : 'Aplicación deployada localmente'}
                        </div>
                    </div>
                    <div class="modal-footer">
                        ${result.deployUrl ? `
                            <a href="${result.deployUrl}" target="_blank" class="btn btn-success">
                                <i class="bi bi-globe"></i> Abrir Aplicación
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
    const existingModal = document.getElementById('projectDeployResultModal');
    if (existingModal) existingModal.remove();
    
    // Agregar nuevo modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('projectDeployResultModal'));
    modal.show();
    
    showNotification(`Proyecto ${result.project} deployado exitosamente`, 'success');
}

function showProjectStartResult(result) {
    const modalHtml = `
        <div class="modal fade" id="projectStartResultModal" tabindex="-1">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">
                            <i class="bi bi-play-circle"></i> 🚀 Proyecto Iniciado Exitosamente
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
                                        <p class="mb-1"><strong>Proyecto:</strong> ${result.project}</p>
                                        <p class="mb-1"><strong>Tipo:</strong> ${result.projectType}</p>
                                        <p class="mb-1"><strong>Modo:</strong> ${result.mode}</p>
                                        <p class="mb-0"><strong>Estado:</strong> <span class="badge bg-success">Listo</span></p>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card bg-light">
                                    <div class="card-body">
                                        <h6><i class="bi bi-gear"></i> Configuración</h6>
                                        ${result.port ? `<p class="mb-1"><strong>Puerto:</strong> ${result.port}</p>` : ''}
                                        ${result.localUrl ? `<p class="mb-1"><strong>URL Local:</strong> <a href="${result.localUrl}" target="_blank">${result.localUrl}</a></p>` : ''}
                                        <p class="mb-0"><strong>Dependencias:</strong> ${result.dependencies.length} activas</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        ${result.dependencies.length > 0 ? `
                            <div class="mb-4">
                                <h6><i class="bi bi-layers"></i> Dependencias Iniciadas:</h6>
                                <div class="row">
                                    ${result.dependencies.map(dep => `
                                        <div class="col-md-4 mb-2">
                                            <span class="badge bg-success">✅ ${dep}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Output del Script -->
                        <div class="mb-4">
                            <h6><i class="bi bi-terminal"></i> Log de Inicio:</h6>
                            <div class="card">
                                <div class="card-body">
                                    <pre class="mb-0" style="white-space: pre-wrap; font-size: 0.85rem; max-height: 400px; overflow-y: auto;">${result.output}</pre>
                                </div>
                            </div>
                        </div>

                        ${result.error ? `
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle"></i>
                                <strong>Advertencias:</strong>
                                <pre class="mb-0 mt-2">${result.error}</pre>
                            </div>
                        ` : ''}

                        <div class="alert alert-info">
                            <i class="bi bi-lightbulb"></i>
                            <strong>URLs de Acceso al Proyecto:</strong><br>
                            <div class="mt-2">
                                ${result.localUrl ? `
                                    <div class="mb-1">
                                        🏠 <strong>Local:</strong> <code>${result.localUrl}</code>
                                        <button class="btn btn-sm btn-outline-secondary ms-2" onclick="copyToClipboard('${result.localUrl}')">
                                            <i class="bi bi-clipboard"></i> Copiar
                                        </button>
                                    </div>
                                ` : ''}
                                ${result.port ? `
                                    <div class="mb-1">
                                        🔒 <strong>Tailscale:</strong> <code>https://mini-server:${result.port}</code>
                                        <button class="btn btn-sm btn-outline-secondary ms-2" onclick="copyToClipboard('https://mini-server:${result.port}')">
                                            <i class="bi bi-clipboard"></i> Copiar
                                        </button>
                                    </div>
                                ` : ''}
                                ${!result.localUrl && !result.port ? 'El entorno está preparado para desarrollo' : ''}
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        ${result.localUrl ? `
                            <a href="${result.localUrl}" target="_blank" class="btn btn-primary">
                                <i class="bi bi-eye"></i> Ver Aplicación
                            </a>
                        ` : ''}
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="bi bi-check-lg"></i> Entendido
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remover modal existente si lo hay
    const existingModal = document.getElementById('projectStartResultModal');
    if (existingModal) existingModal.remove();
    
    // Agregar nuevo modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('projectStartResultModal'));
    modal.show();
    
    showNotification(`Proyecto ${result.project} iniciado exitosamente en modo ${result.mode}`, 'success');
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
// Usar la función de utils.js
function showNotification(message, type) {
    return DashboardUtils.showNotification(message, type);
}

// Función para actualizar la vista previa del dominio
function updateDomainPreview() {
    const domain = document.getElementById('domain').value;
    const subdomain = document.getElementById('subdomain').value || '[subdominio]';
    
    document.getElementById('domainSuffix').textContent = `.${domain}`;
    document.getElementById('urlPreview').textContent = `URL final: https://${subdomain}.${domain}`;
}

// Función para mostrar información del proyecto
function showProjectInfo(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) {
        showNotification('Proyecto no encontrado', 'error');
        return;
    }
    
    const modalHtml = `
        <div class="modal fade" id="projectInfoModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-info-circle"></i> Información del Proyecto: ${project.name}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6>Detalles Generales</h6>
                                <ul class="list-unstyled">
                                    <li><strong>Nombre:</strong> ${project.name}</li>
                                    <li><strong>Tipo:</strong> ${project.type}</li>
                                    <li><strong>Tecnología:</strong> ${project.tech || 'N/A'}</li>
                                    <li><strong>Versión:</strong> ${project.currentVersion || 'Sin versión'}</li>
                                    <li><strong>Estado:</strong> <span class="badge ${getStatusBadge(project.status)}">${getStatusText(project.status)}</span></li>
                                </ul>
                            </div>
                            <div class="col-md-6">
                                <h6>Configuración</h6>
                                <ul class="list-unstyled">
                                    <li><strong>Git:</strong> ${project.hasGit ? '✅ Configurado' : '❌ No configurado'}</li>
                                    <li><strong>GitHub:</strong> ${project.hasRemote ? '✅ Conectado' : '❌ Sin remote'}</li>
                                    <li><strong>CLAUDE.md:</strong> ${project.hasClaude ? '✅ Existe' : '⚠️ No existe'}</li>
                                    <li><strong>PM2:</strong> ${project.pm2Status || 'No configurado'}</li>
                                    <li><strong>Docker:</strong> ${project.hasDocker ? '✅ Dockerfile encontrado' : '❌ Sin Docker'}</li>
                                </ul>
                            </div>
                        </div>
                        
                        <hr>
                        
                        <div class="row mt-3">
                            <div class="col-12">
                                <h6>Ubicación</h6>
                                <div class="bg-light p-2 rounded">
                                    <code>${project.path}</code>
                                </div>
                            </div>
                        </div>
                        
                        ${project.description ? `
                            <div class="row mt-3">
                                <div class="col-12">
                                    <h6>Descripción</h6>
                                    <p>${project.description}</p>
                                </div>
                            </div>
                        ` : ''}
                        
                        ${project.lastActivity ? `
                            <div class="row mt-3">
                                <div class="col-12">
                                    <h6>Última Actividad</h6>
                                    <p class="text-muted">
                                        ${new Date(project.lastActivity).toLocaleString('es-ES')}
                                    </p>
                                </div>
                            </div>
                        ` : ''}
                        
                        ${project.remoteUrl ? `
                            <div class="row mt-3">
                                <div class="col-12">
                                    <h6>GitHub URL</h6>
                                    <div class="input-group">
                                        <input type="text" class="form-control" value="${project.remoteUrl}" readonly>
                                        <button class="btn btn-outline-secondary" onclick="copyToClipboard('${project.remoteUrl}')">
                                            <i class="bi bi-clipboard"></i> Copiar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="row mt-3">
                            <div class="col-12">
                                <h6>Comandos Útiles</h6>
                                <div class="bg-dark text-light p-3 rounded">
                                    <code>
                                        cd ${project.path}<br>
                                        ${project.type === 'Node.js' ? 'npm install<br>npm start' : ''}
                                        ${project.type === 'Python' ? 'pip install -r requirements.txt<br>python app.py' : ''}
                                        ${project.type === 'Docker' ? 'docker-compose up -d' : ''}
                                    </code>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                        <button type="button" class="btn btn-primary" onclick="showProjectDocs('${project.id}')" data-bs-dismiss="modal">
                            <i class="bi bi-file-earmark-text"></i> Ver Documentación
                        </button>
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

// Función para mostrar documentación MD del proyecto
async function showProjectDocs(projectId) {
    try {
        const response = await fetch(`/api/projects/${projectId}/docs`);
        const data = await response.json();
        
        if (!data.success) {
            showNotification('Error al cargar la documentación', 'error');
            return;
        }
        
        // Crear modal para mostrar documentación
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div class="modal fade" id="docsModal" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="bi bi-file-earmark-text"></i> 
                                Documentación de ${data.project}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            ${data.files.length === 0 ? `
                                <div class="alert alert-secondary">
                                    <i class="bi bi-info-circle"></i> 
                                    No se encontraron archivos de documentación (.md) en este proyecto.
                                </div>
                            ` : `
                                <div class="row">
                                    <div class="col-md-3">
                                        <h6>Archivos de documentación</h6>
                                        <div class="list-group" id="docsList">
                                            ${data.files.map((file, index) => `
                                                <a href="#" class="list-group-item list-group-item-action ${index === 0 ? 'active' : ''}"
                                                   onclick="showDocContent(${index}); return false;"
                                                   data-file-index="${index}">
                                                    <i class="bi bi-file-text"></i> ${file.name}
                                                    <small class="d-block text-muted">${file.path}</small>
                                                </a>
                                            `).join('')}
                                        </div>
                                    </div>
                                    <div class="col-md-9">
                                        <div id="docContent" style="max-height: 70vh; overflow-y: auto;">
                                            <!-- Contenido del documento -->
                                        </div>
                                    </div>
                                </div>
                            `}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal.firstElementChild);
        
        // Guardar los archivos en el window para acceso global
        window.currentDocs = data.files;
        
        // Mostrar el primer archivo si existe
        if (data.files.length > 0) {
            showDocContent(0);
        }
        
        // Mostrar modal
        const docsModal = new bootstrap.Modal(document.getElementById('docsModal'));
        docsModal.show();
        
        // Limpiar cuando se cierre
        document.getElementById('docsModal').addEventListener('hidden.bs.modal', function () {
            this.remove();
            delete window.currentDocs;
        });
        
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error al cargar la documentación', 'error');
    }
}

// Función para mostrar el contenido de un documento específico
function showDocContent(index) {
    if (!window.currentDocs || !window.currentDocs[index]) return;
    
    const file = window.currentDocs[index];
    const contentDiv = document.getElementById('docContent');
    
    // Actualizar lista activa
    document.querySelectorAll('#docsList .list-group-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
    
    // Convertir Markdown a HTML (básico)
    let html = file.content
        .replace(/^### (.*$)/gim, '<h5>$1</h5>')
        .replace(/^## (.*$)/gim, '<h4>$1</h4>')
        .replace(/^# (.*$)/gim, '<h3>$1</h3>')
        .replace(/^\* (.+)/gim, '<li>$1</li>')
        .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        .replace(/\n/g, '<br>');
    
    // Envolver listas
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    contentDiv.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h6 class="mb-0">
                    <i class="bi bi-file-text"></i> ${file.name}
                </h6>
            </div>
            <div class="card-body">
                <div class="markdown-content">
                    ${html}
                </div>
            </div>
        </div>
    `;
    
    // Aplicar resaltado de sintaxis si Prism está disponible
    if (typeof Prism !== 'undefined') {
        Prism.highlightAllUnder(contentDiv);
    }
}

// Función para mostrar análisis del proyecto
function showProjectAnalysis(result) {
    const { analysis, remoteInfo, quickConnect } = result;
    
    // Preparar información de Git
    let gitStatusHtml = '';
    if (analysis.git_status) {
        const git = analysis.git_status;
        gitStatusHtml = `
            <div class="card mb-3">
                <div class="card-header">
                    <i class="bi bi-git"></i> Estado de Git
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>Rama actual:</strong> ${git.current_branch}</p>
                            <p><strong>Último commit:</strong> ${git.last_commit}</p>
                        </div>
                        <div class="col-md-6">
                            ${git.changes ? `
                                <p><strong>Cambios pendientes:</strong></p>
                                <ul class="small">
                                    ${git.changes.unstaged > 0 ? `<li>${git.changes.unstaged} archivos sin stage</li>` : ''}
                                    ${git.changes.staged > 0 ? `<li>${git.changes.staged} archivos en stage</li>` : ''}
                                    ${git.changes.untracked > 0 ? `<li>${git.changes.untracked} archivos sin trackear</li>` : ''}
                                    ${git.unpushed_commits > 0 ? `<li class="text-warning">${git.unpushed_commits} commits sin push</li>` : ''}
                                </ul>
                            ` : ''}
                        </div>
                    </div>
                    ${git.recent_commits && git.recent_commits.length > 0 ? `
                        <hr>
                        <h6>Commits recientes:</h6>
                        <ul class="small">
                            ${git.recent_commits.slice(0, 3).map(c => 
                                `<li><code>${c.hash}</code> - ${c.message} <span class="text-muted">(${c.relative})</span></li>`
                            ).join('')}
                        </ul>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // Preparar información de desarrollo
    let devContextHtml = '';
    if (analysis.development_context) {
        const ctx = analysis.development_context;
        devContextHtml = `
            <div class="card mb-3">
                <div class="card-header">
                    <i class="bi bi-clock-history"></i> Contexto de Desarrollo
                </div>
                <div class="card-body">
                    ${ctx.last_session ? `<p><strong>Última sesión:</strong> ${ctx.last_session}</p>` : ''}
                    ${ctx.last_closure ? `<p><strong>Último cierre:</strong> ${ctx.last_closure}</p>` : ''}
                    ${ctx.pending_todos > 0 ? `<p class="text-warning"><strong>TODOs pendientes:</strong> ${ctx.pending_todos}</p>` : ''}
                    ${!ctx.has_claude_md ? '<p class="text-muted">No hay CLAUDE.md (se creará automáticamente)</p>' : ''}
                </div>
            </div>
        `;
    }
    
    // Preparar dependencias
    let depsHtml = '';
    if (analysis.dependencies && analysis.dependencies.services.length > 0) {
        depsHtml = `
            <div class="card mb-3">
                <div class="card-header">
                    <i class="bi bi-gear"></i> Dependencias y Servicios
                </div>
                <div class="card-body">
                    <ul>
                        ${analysis.dependencies.services.map(s => 
                            `<li>${s.name} - <span class="${s.status === 'running' ? 'text-success' : 'text-danger'}">${s.status}</span></li>`
                        ).join('')}
                    </ul>
                    ${analysis.dependencies.outdated_packages > 0 ? 
                        `<p class="text-warning small">⚠️ ${analysis.dependencies.outdated_packages} paquetes desactualizados</p>` : ''}
                </div>
            </div>
        `;
    }
    
    // Preparar siguientes pasos
    let stepsHtml = '';
    if (analysis.next_steps && analysis.next_steps.length > 0) {
        stepsHtml = `
            <div class="alert alert-secondary">
                <h6><i class="bi bi-lightbulb"></i> Recomendaciones:</h6>
                <ul class="mb-0">
                    ${analysis.next_steps.map(step => 
                        `<li class="small">${step.message}</li>`
                    ).join('')}
                </ul>
            </div>
        `;
    }
    
    const modalHtml = `
        <div class="modal fade" id="projectAnalysisModal" tabindex="-1">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-clipboard-data"></i> Análisis del Proyecto: ${analysis.project}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-4">
                                <div class="card mb-3">
                                    <div class="card-header">
                                        <i class="bi bi-info-circle"></i> Información General
                                    </div>
                                    <div class="card-body">
                                        <p><strong>Tipo:</strong> ${analysis.project_info.type}</p>
                                        <p><strong>Tecnología:</strong> ${analysis.project_info.technology}</p>
                                        <p><strong>Versión:</strong> ${analysis.project_info.version || 'N/A'}</p>
                                        <hr>
                                        <p><strong>Estado:</strong></p>
                                        <ul class="small">
                                            <li>PM2: ${analysis.runtime_status.pm2}</li>
                                            <li>Docker: ${analysis.runtime_status.docker}</li>
                                            <li>Puerto: ${analysis.runtime_status.port}</li>
                                        </ul>
                                    </div>
                                </div>
                                ${depsHtml}
                            </div>
                            <div class="col-md-8">
                                ${gitStatusHtml}
                                ${devContextHtml}
                                ${stepsHtml}
                                
                                <div class="card">
                                    <div class="card-header bg-success text-white">
                                        <i class="bi bi-terminal"></i> Listo para Desarrollo
                                    </div>
                                    <div class="card-body">
                                        <p>Se creará la rama: <strong>${remoteInfo.branch}</strong></p>
                                        <p>Puerto de desarrollo: <strong>${remoteInfo.port}</strong></p>
                                        
                                        <div class="d-grid gap-2">
                                            <button class="btn btn-success" onclick="continueToWarp('${result.project}', '${quickConnect.sshCommand}', '${remoteInfo.branch}')">
                                                <i class="bi bi-terminal"></i> Continuar Desarrollo en Warp
                                            </button>
                                            <button class="btn btn-outline-secondary" onclick="copyToClipboard('analysisSSHCommand')">
                                                <i class="bi bi-clipboard"></i> Copiar Comando SSH
                                            </button>
                                        </div>
                                        
                                        <input type="hidden" id="analysisSSHCommand" value="${quickConnect.sshCommand}">
                                        
                                        <hr>
                                        <details>
                                            <summary class="text-muted small">Opciones avanzadas</summary>
                                            <div class="mt-2">
                                                <p class="small">Comando curl para terminal local:</p>
                                                <code class="small">curl -s '${window.location.origin}/api/projects/${analysis.project}/remote-dev/script' | bash</code>
                                            </div>
                                        </details>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Eliminar modal anterior si existe
    const existingModal = document.getElementById('projectAnalysisModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Añadir modal al DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('projectAnalysisModal'));
    modal.show();
}

// Función para continuar desarrollo en Warp
function continueToWarp(projectId, sshCommand, branch) {
    showNotification(`Abriendo Warp Terminal para ${projectId}...`, 'info');
    
    // Cerrar modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('projectAnalysisModal'));
    if (modal) modal.hide();
    
    // Intentar abrir Warp mediante URL scheme o mostrar instrucciones
    const warpCommand = `curl -s '${window.location.origin}/api/projects/${projectId}/remote-dev/script' | bash`;
    
    // Copiar comando al portapapeles
    const tempInput = document.createElement('input');
    tempInput.value = warpCommand;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    
    // Mostrar instrucciones
    const instructionsHtml = `
        <div class="alert alert-secondary alert-dismissible fade show" role="alert">
            <h5 class="alert-heading"><i class="bi bi-terminal"></i> Conectando a Desarrollo Remoto</h5>
            <p>El comando ha sido copiado al portapapeles. Pégalo en tu Terminal local:</p>
            <code>${warpCommand}</code>
            <hr>
            <p class="mb-0 small">Esto abrirá Warp Terminal conectado a la rama <strong>${branch}</strong></p>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    // Mostrar instrucciones en la página
    const alertContainer = document.querySelector('.container-fluid') || document.body;
    alertContainer.insertAdjacentHTML('afterbegin', instructionsHtml);
}

// Función para iniciar desarrollo remoto (legacy - se mantiene por compatibilidad)
async function startRemoteDev(projectId) {
    try {
        showNotification('Preparando desarrollo remoto...', 'info');
        
        const response = await fetch(`/api/projects/${projectId}/start-remote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ remoteUser: 'mini-server' })
        });
        
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error);
        
        // Mostrar modal con opciones de conexión
        showRemoteDevModal(result);
        
    } catch (error) {
        console.error('Error iniciando desarrollo remoto:', error);
        showNotification(`Error: ${error.message}`, 'error');
    }
}

// Modal para mostrar opciones de desarrollo remoto
function showRemoteDevModal(result) {
    const { remoteInfo, quickConnect } = result;
    
    const modalHtml = `
        <div class="modal fade" id="remoteDevModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-terminal"></i> Desarrollo Remoto - ${remoteInfo.project}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-success">
                            <i class="bi bi-check-circle"></i> Rama de desarrollo creada: <strong>${remoteInfo.branch}</strong>
                        </div>
                        
                        <h6>🚀 Opciones de Conexión:</h6>
                        
                        <div class="card mb-3">
                            <div class="card-header">
                                <i class="bi bi-1-circle"></i> Comando SSH Directo
                            </div>
                            <div class="card-body">
                                <div class="input-group">
                                    <input type="text" class="form-control font-monospace" 
                                           value="${quickConnect.sshCommand}" readonly id="sshCommand">
                                    <button class="btn btn-outline-secondary" onclick="copyToClipboard('sshCommand')">
                                        <i class="bi bi-clipboard"></i> Copiar
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="card mb-3">
                            <div class="card-header">
                                <i class="bi bi-2-circle"></i> Abrir en Warp Terminal (macOS)
                            </div>
                            <div class="card-body">
                                <p>Ejecuta este comando en tu Terminal local:</p>
                                <div class="input-group">
                                    <input type="text" class="form-control font-monospace" 
                                           value="curl -s '${window.location.origin}/api/projects/${remoteInfo.project}/remote-dev/script' | bash" 
                                           readonly id="warpCommand">
                                    <button class="btn btn-outline-secondary" onclick="copyToClipboard('warpCommand')">
                                        <i class="bi bi-clipboard"></i> Copiar
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="card">
                            <div class="card-header">
                                <i class="bi bi-3-circle"></i> Port Forwarding
                            </div>
                            <div class="card-body">
                                <p>Para acceder localmente al puerto ${remoteInfo.port}:</p>
                                <div class="input-group">
                                    <input type="text" class="form-control font-monospace" 
                                           value="ssh -L ${remoteInfo.port}:localhost:${remoteInfo.port} mini-server@${remoteInfo.server_ip}" 
                                           readonly id="portCommand">
                                    <button class="btn btn-outline-secondary" onclick="copyToClipboard('portCommand')">
                                        <i class="bi bi-clipboard"></i> Copiar
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <hr>
                        
                        <div class="row">
                            <div class="col-md-6">
                                <h6>📊 Información:</h6>
                                <ul class="small">
                                    <li>Proyecto: <strong>${remoteInfo.project}</strong></li>
                                    <li>Tipo: <strong>${remoteInfo.type}</strong></li>
                                    <li>Puerto Dev: <strong>${remoteInfo.port}</strong></li>
                                    <li>Rama: <strong>${remoteInfo.branch}</strong></li>
                                </ul>
                            </div>
                            <div class="col-md-6">
                                <h6>🌐 URLs de Acceso:</h6>
                                <ul class="small">
                                    <li>Local: <a href="http://localhost:${remoteInfo.port}" target="_blank">http://localhost:${remoteInfo.port}</a></li>
                                    ${remoteInfo.tailscale_ip ? `<li>Tailscale: <a href="http://mini-server:${remoteInfo.port}" target="_blank">http://mini-server:${remoteInfo.port}</a></li>` : ''}
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Eliminar modal anterior si existe
    const existingModal = document.getElementById('remoteDevModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Añadir modal al DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('remoteDevModal'));
    modal.show();
    
    showNotification('Desarrollo remoto preparado correctamente', 'success');
}

// Función auxiliar para copiar al clipboard
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    element.select();
    document.execCommand('copy');
    showNotification('Copiado al portapapeles', 'success');
}

// Función para mostrar modal de clonar desde GitHub
async function showGitHubCloneModal() {
    const modalHtml = `
        <div class="modal fade" id="githubCloneModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-github"></i> Clonar Repositorio desde GitHub
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <button class="btn btn-primary w-100" onclick="loadUserRepos()">
                                <i class="bi bi-download"></i> Cargar mis repositorios
                            </button>
                        </div>
                        
                        <div id="reposListContainer" style="display: none;">
                            <div class="mb-3">
                                <input type="text" class="form-control" id="repoSearch" placeholder="Buscar repositorio..." onkeyup="filterRepos()">
                            </div>
                            
                            <div class="alert alert-info">
                                <i class="bi bi-info-circle"></i> Selecciona un repositorio para clonarlo. Se analizará automáticamente y se guardará en la carpeta correcta.
                            </div>
                            
                            <div id="reposList" class="list-group" style="max-height: 400px; overflow-y: auto;">
                                <!-- Los repos se cargarán aquí -->
                            </div>
                        </div>
                        
                        <div id="reposLoading" style="display: none;" class="text-center">
                            <span class="loading-spinner"></span> Cargando repositorios...
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remover modal existente si lo hay
    const existingModal = document.getElementById('githubCloneModal');
    if (existingModal) existingModal.remove();
    
    // Agregar nuevo modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('githubCloneModal'));
    modal.show();
}

// Cargar repositorios del usuario
async function loadUserRepos() {
    document.getElementById('reposLoading').style.display = 'block';
    document.getElementById('reposListContainer').style.display = 'none';
    
    try {
        const response = await fetch('/api/github/repos');
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        userRepos = data.repos;
        displayRepos(userRepos);
        
        document.getElementById('reposLoading').style.display = 'none';
        document.getElementById('reposListContainer').style.display = 'block';
    } catch (error) {
        console.error('Error cargando repositorios:', error);
        showNotification('Error cargando repositorios: ' + error.message, 'error');
        document.getElementById('reposLoading').style.display = 'none';
    }
}

// Mostrar repositorios
function displayRepos(repos) {
    const container = document.getElementById('reposList');
    
    if (repos.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-3">No se encontraron repositorios</div>';
        return;
    }
    
    container.innerHTML = repos.map(repo => `
        <div class="list-group-item list-group-item-action" onclick="selectRepo('${repo.full_name}')">
            <div class="d-flex justify-content-between align-items-start">
                <div class="flex-grow-1">
                    <h6 class="mb-1">${repo.name}</h6>
                    <p class="mb-1 text-muted small">${repo.description || 'Sin descripción'}</p>
                    <div class="d-flex gap-3 small text-muted">
                        <span><i class="bi bi-star"></i> ${repo.language || 'No especificado'}</span>
                        <span><i class="bi bi-eye"></i> ${repo.private ? 'Privado' : 'Público'}</span>
                        <span><i class="bi bi-clock"></i> ${new Date(repo.updated_at).toLocaleDateString()}</span>
                    </div>
                </div>
                <button class="btn btn-sm btn-success">
                    <i class="bi bi-download"></i> Clonar
                </button>
            </div>
        </div>
    `).join('');
}

// Filtrar repositorios
function filterRepos() {
    const search = document.getElementById('repoSearch').value.toLowerCase();
    const filtered = userRepos.filter(repo => 
        repo.name.toLowerCase().includes(search) || 
        (repo.description && repo.description.toLowerCase().includes(search))
    );
    displayRepos(filtered);
}

// Seleccionar y clonar repositorio
async function selectRepo(repoFullName) {
    const modal = bootstrap.Modal.getInstance(document.getElementById('githubCloneModal'));
    modal.hide();
    
    showNotification('Clonando repositorio, instalando dependencias...', 'info');
    
    try {
        const response = await fetch('/api/github/clone', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ repo: repoFullName })
        });
        
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error);
        
        showNotification(`Repositorio clonado exitosamente en ${result.path}`, 'success');
        
        // Recargar la lista de proyectos
        setTimeout(loadProjects, 1000);
        
        // Mostrar información del proyecto clonado
        showCloneResult(result);
    } catch (error) {
        console.error('Error clonando repositorio:', error);
        showNotification('Error al clonar: ' + error.message, 'error');
    }
}

// Mostrar resultado del clon
function showCloneResult(result) {
    const modalHtml = `
        <div class="modal fade" id="cloneResultModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">
                            <i class="bi bi-check-circle"></i> Repositorio Clonado
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-success">
                            <strong>✅ ${result.repo} clonado exitosamente</strong>
                        </div>
                        
                        <h6>Análisis del proyecto:</h6>
                        <ul>
                            <li><strong>Tipo detectado:</strong> ${result.projectType}</li>
                            <li><strong>Tecnología:</strong> ${result.technology}</li>
                            <li><strong>Ubicación:</strong> <code>${result.path}</code></li>
                        </ul>
                        
                        <div class="row mt-3">
                            <div class="col-md-6">
                                <h6>Detección automática:</h6>
                                ${result.hasPackageJson ? '<p class="text-success mb-1"><i class="bi bi-check"></i> package.json detectado</p>' : ''}
                                ${result.hasDockerfile ? '<p class="text-success mb-1"><i class="bi bi-check"></i> Dockerfile detectado</p>' : ''}
                                ${result.hasRequirements ? '<p class="text-success mb-1"><i class="bi bi-check"></i> requirements.txt detectado</p>' : ''}
                                ${result.dependenciesInstalled ? '<p class="text-success mb-1"><i class="bi bi-check"></i> Dependencias instaladas</p>' : ''}
                                ${result.buildExecuted ? '<p class="text-success mb-1"><i class="bi bi-check"></i> Build ejecutado</p>' : ''}
                            </div>
                            <div class="col-md-6">
                                ${result.databasesRequired && result.databasesRequired.length > 0 ? `
                                    <h6>Bases de datos detectadas:</h6>
                                    ${result.databasesRequired.map(db => `
                                        <p class="text-warning mb-1"><i class="bi bi-database"></i> ${db} requerido</p>
                                    `).join('')}
                                ` : ''}
                            </div>
                        </div>
                        
                        ${result.warnings && result.warnings.length > 0 ? `
                            <div class="alert alert-warning mt-3">
                                <h6 class="alert-heading"><i class="bi bi-exclamation-triangle"></i> Configuración necesaria:</h6>
                                <ul class="mb-0">
                                    ${result.warnings.map(warning => `<li>${warning}</li>`).join('')}
                                </ul>
                            </div>
                        ` : ''}
                        
                        <div class="alert alert-info mt-3">
                            <i class="bi bi-info-circle"></i> El proyecto aparecerá en la lista de proyectos. 
                            ${result.configurationNeeded ? 
                                '<strong>Importante:</strong> Configura las variables de entorno y bases de datos antes de hacer deploy.' : 
                                'Puedes iniciar desarrollo o hacer deploy directamente.'
                            }
                        </div>
                        
                        <div class="bg-light p-3 rounded">
                            <h6>Próximos pasos:</h6>
                            <ol class="mb-0">
                                ${result.configurationNeeded ? '<li>Configurar variables de entorno en el archivo .env</li>' : ''}
                                ${result.databasesRequired && result.databasesRequired.length > 0 ? '<li>Configurar conexión a las bases de datos requeridas</li>' : ''}
                                <li>El proyecto aparecerá en la lista de proyectos</li>
                                <li>Usa el botón "Iniciar Desarrollo" para comenzar a trabajar</li>
                                <li>Cuando esté listo, usa "Deploy" para publicarlo</li>
                            </ol>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Entendido</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remover modal existente si lo hay
    const existingModal = document.getElementById('cloneResultModal');
    if (existingModal) existingModal.remove();
    
    // Agregar nuevo modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('cloneResultModal'));
    modal.show();
}

// Función para eliminar proyecto
async function deleteProject(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) {
        showNotification('Proyecto no encontrado', 'error');
        return;
    }
    
    // Modal de confirmación con más detalles
    const modalHtml = `
        <div class="modal fade" id="deleteConfirmModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-danger text-white">
                        <h5 class="modal-title">
                            <i class="bi bi-exclamation-triangle"></i> Confirmar Eliminación
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-danger">
                            <strong>⚠️ Esta acción es IRREVERSIBLE</strong>
                        </div>
                        
                        <p>¿Estás seguro de que quieres eliminar el proyecto <strong>${project.name}</strong>?</p>
                        
                        <div class="bg-light p-3 rounded mb-3">
                            <h6>Esto eliminará:</h6>
                            <ul class="mb-0">
                                <li>La carpeta completa del proyecto en: <code>${project.path}</code></li>
                                <li>Configuración de PM2/Docker (si existe)</li>
                                <li>Configuración de Nginx (si existe)</li>
                                <li>El proceso en ejecución (si está activo)</li>
                            </ul>
                        </div>
                        
                        ${project.hasGit && project.hasRemote ? `
                            <div class="alert alert-info">
                                <i class="bi bi-info-circle"></i> 
                                <strong>Nota:</strong> El proyecto tiene GitHub configurado. Podrás clonarlo de nuevo desde GitHub si es necesario.
                            </div>
                        ` : `
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle"></i> 
                                <strong>¡Advertencia!</strong> Este proyecto NO está en GitHub. Si lo eliminas, perderás todo el código.
                            </div>
                        `}
                        
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="confirmDelete">
                            <label class="form-check-label" for="confirmDelete">
                                Entiendo que esta acción eliminará permanentemente el proyecto
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-danger" onclick="confirmDeleteProject('${projectId}')" id="deleteBtn" disabled>
                            <i class="bi bi-trash"></i> Eliminar Proyecto
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remover modal existente si lo hay
    const existingModal = document.getElementById('deleteConfirmModal');
    if (existingModal) existingModal.remove();
    
    // Agregar nuevo modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Configurar checkbox
    document.getElementById('confirmDelete').addEventListener('change', function() {
        document.getElementById('deleteBtn').disabled = !this.checked;
    });
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    modal.show();
}

// Función para confirmar y ejecutar eliminación
async function confirmDeleteProject(projectId) {
    // Cerrar modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'));
    modal.hide();
    
    try {
        showNotification('Eliminando proyecto...', 'info');
        
        const response = await fetch(`/api/projects/${projectId}/delete`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error);
        
        showNotification(`Proyecto ${projectId} eliminado exitosamente`, 'success');
        
        // Recargar lista de proyectos
        setTimeout(loadProjects, 1000);
        
    } catch (error) {
        console.error('Error eliminando proyecto:', error);
        showNotification(`Error al eliminar: ${error.message}`, 'error');
    }
}

// Función para actualizar preview del dominio en el modal de deploy
function updateDomainPreview() {
    const domainSelect = document.getElementById('domain');
    const subdomainInput = document.getElementById('subdomain');
    const domainSuffix = document.getElementById('domainSuffix');
    const urlPreview = document.getElementById('urlPreview');
    
    if (!domainSelect || !subdomainInput || !domainSuffix || !urlPreview) {
        return;
    }
    
    const selectedDomain = domainSelect.value;
    const subdomain = subdomainInput.value.trim() || '[subdominio]';
    
    // Actualizar el sufijo del dominio
    domainSuffix.textContent = `.${selectedDomain}`;
    
    // Actualizar el preview de la URL
    urlPreview.innerHTML = `URL final: <strong>https://${subdomain}.${selectedDomain}</strong>`;
}

// Función para actualizar información de Tailscale en el modal de deploy
async function updateTailscaleInfoInModal() {
    const tailscaleInfo = document.getElementById('tailscale-info-deploy-modal');
    if (!tailscaleInfo) return;
    
    try {
        const response = await fetch('/api/system/tailscale');
        if (response.ok) {
            const data = await response.json();
            
            if (data.installed && data.active) {
                const hostname = data.hostname || 'mini-server';
                tailscaleInfo.innerHTML = `
                    <i class="bi bi-shield-check text-success"></i> 
                    <strong>Tailscale VPN:</strong> 
                    <code>https://${hostname}:[puerto]</code>
                    ${data.funnel ? '<span class="badge bg-info ms-1">Funnel disponible</span>' : ''}
                `;
            } else if (data.installed && !data.active) {
                tailscaleInfo.innerHTML = `
                    <i class="bi bi-shield-exclamation text-warning"></i> 
                    <strong>Tailscale:</strong> 
                    <span class="text-warning">Instalado pero inactivo</span>
                    <br><small class="text-muted">Ejecuta: <code>tailscale up</code></small>
                `;
            } else {
                tailscaleInfo.innerHTML = `
                    <i class="bi bi-shield-x text-muted"></i> 
                    <strong>Tailscale:</strong> 
                    <span class="text-muted">No instalado (recomendado para acceso remoto)</span>
                `;
            }
            
            // Actualizar también la variable global
            window.tailscaleInfo = data;
        } else {
            tailscaleInfo.innerHTML = `
                <i class="bi bi-shield-x text-muted"></i> 
                <strong>Tailscale:</strong> 
                <span class="text-muted">No disponible</span>
            `;
        }
    } catch (error) {
        console.warn('Error obteniendo información de Tailscale:', error);
        tailscaleInfo.innerHTML = `
            <i class="bi bi-shield-x text-muted"></i> 
            <strong>Tailscale:</strong> 
            <span class="text-muted">Error verificando estado</span>
        `;
    }
}