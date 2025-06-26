// Gestión mejorada de dominios y subdominios

// Cargar y mostrar dominios
async function loadDomains() {
    try {
        const response = await fetch('/api/domains/list');
        const data = await response.json();
        
        const grid = document.getElementById('domains-grid');
        
        if (!data.domains || data.domains.length === 0) {
            grid.innerHTML = '<div class="col-12 text-center text-secondary">No hay dominios configurados</div>';
            return;
        }
        
        // Guardar info del servidor globalmente
        window.serverInfo = data.serverInfo;
        
        // Mostrar dominios agrupados por dominio principal
        grid.innerHTML = data.domains.map(domain => {
            const statusBadge = domain.status === 'active' 
                ? '<span class="badge bg-success">Activo</span>' 
                : '<span class="badge bg-warning">Pendiente</span>';
            
            // Filtrar subdominios usando la función de filtro
            const filteredSubdomains = window.filterSubdomains ? 
                window.filterSubdomains(domain.subdomains || []) : 
                (domain.subdomains || []);
            
            const subdomainsList = filteredSubdomains.map(sub => {
                const isLocal = sub.ip === data.serverInfo?.public_ip;
                const typeIcon = isLocal ? 'bi-hdd-network' : 'bi-cloud';
                const typeBadge = isLocal ? 'Local' : 'Externo';
                const typeColor = isLocal ? 'primary' : 'secondary';
                
                return `
                    <div class="col-md-6 mb-2">
                        <div class="subdomain-card p-3 border rounded">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <h6 class="mb-1">
                                        <i class="bi ${typeIcon}"></i> ${sub.name}
                                    </h6>
                                    <small class="text-muted">
                                        App: ${sub.app} ${sub.port ? `| Puerto: ${sub.port}` : ''}
                                    </small>
                                </div>
                                <div class="text-end">
                                    <span class="badge bg-${typeColor} mb-1">${typeBadge}</span>
                                    <div class="btn-group btn-group-sm d-block">
                                        <a href="https://${sub.name}" target="_blank" class="btn btn-outline-primary">
                                            <i class="bi bi-box-arrow-up-right"></i>
                                        </a>
                                        ${isLocal ? `
                                        <button class="btn btn-outline-danger" onclick="removeDomain('${sub.name}', '${domain.name}')">
                                            <i class="bi bi-trash"></i>
                                        </button>` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            return `
                <div class="col-12 mb-4 domain-group fade-in">
                    <div class="card">
                        <div class="card-header bg-primary text-white">
                            <div class="d-flex justify-content-between align-items-center">
                                <h5 class="mb-0">
                                    <i class="bi bi-globe"></i> ${domain.name}
                                </h5>
                                <div>
                                    ${statusBadge}
                                    <span class="badge bg-light text-dark">${domain.plan}</span>
                                </div>
                            </div>
                            <small class="d-block mt-1">
                                ${filteredSubdomains.length} subdominios visibles de ${domain.totalSubdomains} totales
                            </small>
                        </div>
                        <div class="card-body">
                            ${domain.status !== 'active' ? `
                                <div class="alert alert-warning mb-3">
                                    <i class="bi bi-exclamation-triangle"></i> 
                                    Este dominio está pendiente de activación. 
                                    Actualiza los nameservers en tu proveedor de dominio.
                                </div>
                            ` : ''}
                            
                            ${subdomainsList || '<p class="text-muted">No hay subdominios configurados</p>'}
                            
                            ${domain.status === 'active' && domain.available_subdomains?.length > 0 ? `
                                <div class="row ${subdomainsList ? 'mt-3' : ''}">
                                    <div class="col-12">
                                        <details>
                                            <summary class="cursor-pointer text-primary">
                                                <i class="bi bi-plus-circle"></i> 
                                                Subdominios disponibles (${domain.available_subdomains.length})
                                            </summary>
                                            <div class="mt-2">
                                                <div class="d-flex flex-wrap gap-2">
                                                    ${domain.available_subdomains.map(sub => 
                                                        `<span class="badge bg-light text-dark">${sub}</span>`
                                                    ).join('')}
                                                </div>
                                                <button class="btn btn-sm btn-success mt-2" 
                                                    onclick="showAddSubdomainModal('${domain.name}', '${domain.zone_id}')">
                                                    <i class="bi bi-plus"></i> Agregar Subdominio
                                                </button>
                                            </div>
                                        </details>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Actualizar opciones en el modal
        updateDomainModalOptions(data.domains);
        
    } catch (error) {
        console.error('Error loading domains:', error);
        DashboardUtils.showNotification('Error al cargar dominios', 'error');
    }
}

// Mostrar modal para agregar subdominio
function showAddSubdomainModal(domainName, zoneId) {
    const modal = new bootstrap.Modal(document.getElementById('domainModal'));
    
    // Pre-seleccionar el dominio
    document.getElementById('parentDomainSelect').value = domainName;
    document.getElementById('domainZoneId').value = zoneId;
    
    modal.show();
}

// Actualizar opciones del modal
function updateDomainModalOptions(domains) {
    const select = document.getElementById('parentDomainSelect');
    if (!select) return;
    
    const activeDomains = domains.filter(d => d.status === 'active');
    
    select.innerHTML = '<option value="">Seleccionar dominio...</option>' +
        activeDomains.map(domain => 
            `<option value="${domain.name}" data-zone-id="${domain.zone_id}">
                ${domain.name} (${domain.available_subdomains?.length || 0} disponibles)
            </option>`
        ).join('');
}

// Agregar subdominio
async function addDomain() {
    const form = document.getElementById('domainForm');
    const parentSelect = document.getElementById('parentDomainSelect');
    const selectedOption = parentSelect.options[parentSelect.selectedIndex];
    
    const data = {
        subdomain: form.subdomainName.value,
        app: form.domainApp.value,
        port: form.domainPort.value,
        parentDomain: parentSelect.value,
        zoneId: selectedOption.getAttribute('data-zone-id')
    };
    
    if (!data.subdomain || !data.app || !data.port || !data.parentDomain) {
        DashboardUtils.showNotification('Por favor completa todos los campos', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/domains/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        if (result.success) {
            DashboardUtils.showNotification(`Subdominio ${data.subdomain}.${data.parentDomain} agregado`, 'success');
            bootstrap.Modal.getInstance(document.getElementById('domainModal')).hide();
            form.reset();
            loadDomains();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        DashboardUtils.showNotification(`Error: ${error.message}`, 'error');
    }
}

// Eliminar subdominio
async function removeDomain(subdomain, parentDomain) {
    if (!confirm(`¿Eliminar ${subdomain}?`)) return;
    
    try {
        const response = await fetch(`/api/domains/${encodeURIComponent(subdomain)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parentDomain })
        });
        
        if (response.ok) {
            DashboardUtils.showNotification(`Subdominio ${subdomain} eliminado`, 'success');
            loadDomains();
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Error al eliminar dominio');
        }
    } catch (error) {
        DashboardUtils.showNotification(`Error: ${error.message}`, 'error');
    }
}

// Estilos adicionales para dominios
(function() {
    const style = document.createElement('style');
style.textContent = `
    .domain-group {
        animation: fadeIn 0.5s ease-in;
    }
    
    .subdomain-card {
        background-color: var(--bg-secondary);
        transition: all 0.3s ease;
    }
    
    .subdomain-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    [data-theme="dark"] .subdomain-card {
        background-color: rgba(255,255,255,0.05);
        border-color: var(--border-color) !important;
    }
    
    details summary {
        cursor: pointer;
        user-select: none;
    }
    
    details summary::-webkit-details-marker {
        display: none;
    }
    
    .cursor-pointer {
        cursor: pointer;
    }
`;
document.head.appendChild(style);
})();

// Exportar funciones
window.showAddSubdomainModal = showAddSubdomainModal;