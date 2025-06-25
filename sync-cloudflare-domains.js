#!/usr/bin/env node

// Script para sincronizar dominios desde Cloudflare
const { exec } = require('child_process');
const fs = require('fs').promises;
const util = require('util');
const execPromise = util.promisify(exec);

async function syncCloudflaredomains() {
    console.log('🔄 Sincronizando dominios desde Cloudflare...\n');
    
    try {
        // Leer configuración actual
        const domainsFile = '/Users/mini-server/server-config/domains.json';
        const data = await fs.readFile(domainsFile, 'utf8');
        const domainsData = JSON.parse(data);
        
        const cfToken = process.env.CLOUDFLARE_API_TOKEN;
        if (!cfToken) {
            console.error('❌ Error: CLOUDFLARE_API_TOKEN no está configurado');
            process.exit(1);
        }
        
        // Para cada dominio, obtener todos los registros DNS de Cloudflare
        for (const domain of domainsData.domains) {
            console.log(`📍 Procesando ${domain.name}...`);
            
            try {
                // Obtener todos los registros DNS del dominio
                const { stdout } = await execPromise(`
                    curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${domain.zone_id}/dns_records?per_page=100" \
                        -H "Authorization: Bearer ${cfToken}" \
                        -H "Content-Type: application/json"
                `);
                
                const response = JSON.parse(stdout);
                
                if (!response.success) {
                    console.error(`❌ Error obteniendo registros de ${domain.name}`);
                    continue;
                }
                
                // Filtrar solo registros A y CNAME que son subdominios
                const dnsRecords = response.result.filter(record => 
                    (record.type === 'A' || record.type === 'CNAME') && 
                    record.name !== domain.name && 
                    record.name.endsWith(domain.name)
                );
                
                console.log(`  ✅ Encontrados ${dnsRecords.length} subdominios en Cloudflare`);
                
                // Crear mapa de subdominios existentes
                const existingSubdomains = new Map(
                    domain.subdomains.map(sub => [sub.name, sub])
                );
                
                // Procesar cada registro DNS
                for (const record of dnsRecords) {
                    if (!existingSubdomains.has(record.name)) {
                        console.log(`  🆕 Nuevo subdominio encontrado: ${record.name}`);
                        
                        // Determinar si es local o externo
                        const isLocal = record.type === 'A' && record.content === domainsData.server_info.public_ip;
                        const isCloudflareТunnel = record.type === 'CNAME' && record.content.includes('cfargotunnel.com');
                        
                        // Intentar encontrar la aplicación y puerto
                        let app = 'unknown';
                        let port = null;
                        
                        // Buscar en configuración de nginx
                        const subdomain = record.name.split('.')[0];
                        try {
                            const { stdout: nginxFiles } = await execPromise(
                                `find /usr/local/etc/nginx/servers /opt/homebrew/etc/nginx/servers -name "*${subdomain}*" 2>/dev/null | head -1`
                            );
                            
                            if (nginxFiles.trim()) {
                                const { stdout: nginxContent } = await execPromise(`cat "${nginxFiles.trim()}"`);
                                
                                // Extraer puerto del proxy_pass
                                const portMatch = nginxContent.match(/proxy_pass.*:(\d+)/);
                                if (portMatch) {
                                    port = parseInt(portMatch[1]);
                                }
                                
                                // Intentar determinar la aplicación
                                if (subdomain === 'iva') app = 'iva-compensator';
                                else if (subdomain === 'gspro' || subdomain === 'app') app = 'MiGestPro';
                                else if (subdomain === 'n8n') app = 'n8n';
                                else app = subdomain;
                            }
                        } catch (e) {
                            // Ignorar errores al buscar nginx
                        }
                        
                        // Agregar el subdominio
                        const newSubdomain = {
                            name: record.name,
                            ip: isLocal || isCloudflareТunnel ? domainsData.server_info.public_ip : record.content,
                            ssl: record.proxied,
                            app: isLocal || isCloudflareТunnel ? app : 'external',
                            port: port,
                            cloudflare_id: record.id,
                            cloudflare_tunnel: isCloudflareТunnel,
                            created: record.created_on
                        };
                        
                        domain.subdomains.push(newSubdomain);
                        
                        // Remover de subdominios disponibles si aplica
                        const idx = domain.available_subdomains.indexOf(subdomain);
                        if (idx > -1) {
                            domain.available_subdomains.splice(idx, 1);
                        }
                    } else {
                        // Actualizar cloudflare_id si no lo tiene
                        const existingSub = existingSubdomains.get(record.name);
                        if (!existingSub.cloudflare_id) {
                            existingSub.cloudflare_id = record.id;
                        }
                    }
                }
                
                // Verificar si hay subdominios locales que ya no existen en Cloudflare
                for (const [subName, subData] of existingSubdomains) {
                    const existsInCloudflare = dnsRecords.some(r => r.name === subName);
                    if (!existsInCloudflare && subData.app !== 'external') {
                        console.log(`  ⚠️  Subdominio ${subName} no encontrado en Cloudflare`);
                    }
                }
                
            } catch (error) {
                console.error(`❌ Error procesando ${domain.name}: ${error.message}`);
            }
        }
        
        // Actualizar timestamp
        domainsData.last_updated = new Date().toISOString();
        
        // Guardar cambios
        await fs.writeFile(domainsFile, JSON.stringify(domainsData, null, 2));
        
        console.log('\n✅ Sincronización completada');
        console.log(`📄 Archivo actualizado: ${domainsFile}`);
        
        // Mostrar resumen
        console.log('\n📊 Resumen:');
        for (const domain of domainsData.domains) {
            console.log(`  ${domain.name}: ${domain.subdomains.length} subdominios`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    syncCloudflaredomains();
}

module.exports = syncCloudflaredomains;