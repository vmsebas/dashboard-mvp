// Filtro para subdominios irrelevantes
const HIDDEN_SUBDOMAINS = [
    '*.', // Wildcards
    'autodiscover.', // Microsoft
    '_e16c98ee', // AWS validation
    'enterpriseenrollment.', // Microsoft
    'enterpriseregistration.', // Microsoft
    'sig1._domainkey.', // DKIM email
    '_domainconnect.', // Domain connection
    'www.' // WWW subdomain (mostrar solo si es local)
];

// Función para filtrar subdominios
function shouldShowSubdomain(subdomain) {
    // No mostrar subdominios de configuración interna
    for (const hidden of HIDDEN_SUBDOMAINS) {
        if (subdomain.name.includes(hidden)) {
            // Excepción: mostrar www si es local
            if (hidden === 'www.' && subdomain.ip === window.serverInfo?.public_ip) {
                return true;
            }
            return false;
        }
    }
    return true;
}

// Aplicar filtro antes de mostrar
window.filterSubdomains = function(subdomains) {
    return subdomains.filter(shouldShowSubdomain);
};