const express = require('express');
const { exec, spawn } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

const execPromise = util.promisify(exec);

// Función helper para obtener la ruta de un proyecto de manera genérica
async function getProjectPath(projectId) {
    const { scanAllProjects } = require('/Users/mini-server/server-config/project-scanner.js');
    const projects = await scanAllProjects();
    const project = projects.find(p => p.id === projectId);
    return project ? project.path : null;
}

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Socket.io para logs en tiempo real
io.on('connection', (socket) => {
    console.log('Cliente conectado');
    
    socket.on('subscribe-logs', ({ source, app }) => {
        socket.join(`logs-${source}`);
        streamLogs(socket, source, app);
    });
    
    socket.on('disconnect', () => {
        console.log('Cliente desconectado');
    });
});

// Función para streaming de logs
function streamLogs(socket, source, app) {
    let command;
    
    switch(source) {
        case 'system':
            command = 'tail -f /var/log/system.log';
            break;
        case 'nginx':
            command = 'tail -f /usr/local/var/log/nginx/error.log';
            break;
        case 'pm2':
            command = app ? `pm2 logs ${app} --lines 100` : 'pm2 logs --lines 100';
            break;
        case 'docker':
            command = app ? `docker logs -f ${app}` : 'docker logs -f $(docker ps -q | head -1)';
            break;
        default:
            return;
    }
    
    const logProcess = spawn('sh', ['-c', command]);
    
    logProcess.stdout.on('data', (data) => {
        socket.emit('log-data', { line: data.toString() });
    });
    
    logProcess.stderr.on('data', (data) => {
        socket.emit('log-data', { line: data.toString() });
    });
    
    socket.on('disconnect', () => {
        logProcess.kill();
    });
}

// API: Puertos en uso
app.get('/api/system/ports', async (req, res) => {
    try {
        const { stdout } = await execPromise(
            `lsof -i -P | grep LISTEN | grep -E ":(3[0-9]{3}|[4-9][0-9]{3})" | awk '{print $9}' | cut -d: -f2 | sort -nu`
        );
        
        const ports = stdout.trim().split('\n').filter(p => p).map(p => parseInt(p));
        
        res.json({ 
            ports: ports,
            count: ports.length 
        });
    } catch (error) {
        res.json({ ports: [], count: 0 });
    }
});

// API: Estado del sistema mejorado
app.get('/api/system/status', async (req, res) => {
    try {
        // CPU
        const { stdout: cpuUsage } = await execPromise(
            "ps -A -o %cpu | awk '{s+=$1} END {print s}'"
        );
        
        // Memoria
        const { stdout: memInfo } = await execPromise(
            "vm_stat | perl -ne '/page size of (\\d+)/ and $size=$1; /Pages\\s+([^:]+):\\s+(\\d+)/ and printf(\"%s=%d\\n\", \"$1\",$2 * $size);'"
        );
        
        const memStats = {};
        memInfo.split('\n').forEach(line => {
            if (line) {
                const [key, value] = line.split('=');
                memStats[key] = parseInt(value);
            }
        });
        
        const totalMem = Object.values(memStats).reduce((a, b) => a + b, 0);
        const freeMem = (memStats['free'] || 0) + (memStats['inactive'] || 0);
        const usedMem = totalMem - freeMem;
        const memPercent = Math.round((usedMem / totalMem) * 100);
        
        // Disco
        const { stdout: diskInfo } = await execPromise(
            "df -h / | tail -1 | awk '{print $5}' | sed 's/%//'"
        );
        
        // Uptime
        const { stdout: uptimeInfo } = await execPromise(
            "sysctl -n kern.boottime | awk '{print $4}' | sed 's/,//'"
        );
        const bootTime = parseInt(uptimeInfo);
        const uptime = Math.floor(Date.now() / 1000) - bootTime;
        
        res.json({
            cpu: Math.round(parseFloat(cpuUsage)),
            memory: {
                used: usedMem,
                total: totalMem,
                percent: memPercent
            },
            disk: {
                percent: parseInt(diskInfo)
            },
            uptime: uptime
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Estado de aplicaciones (PM2 + Docker)
app.get('/api/apps/status', async (req, res) => {
    try {
        // PM2 apps
        let pm2Apps = [];
        try {
            const { stdout: pm2Data } = await execPromise('pm2 jlist');
            pm2Apps = JSON.parse(pm2Data || '[]');
        } catch (e) {
            console.log('PM2 no disponible');
        }
        
        // Docker containers
        let dockerApps = [];
        try {
            const { stdout: dockerData } = await execPromise(
                'docker ps --format "{\\"Names\\":\\"{{.Names}}\\",\\"State\\":\\"{{.State}}\\",\\"Status\\":\\"{{.Status}}\\",\\"Ports\\":\\"{{.Ports}}\\"}"'
            );
            dockerApps = dockerData.split('\n').filter(l => l).map(l => JSON.parse(l));
        } catch (e) {
            console.log('Docker no disponible');
        }
        
        res.json({
            pm2: pm2Apps,
            docker: dockerApps
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Control de aplicaciones
app.post('/api/apps/:app/control', async (req, res) => {
    const { app } = req.params;
    const { action, type } = req.body;
    
    try {
        let command;
        if (type === 'pm2') {
            command = `pm2 ${action} "${app}"`;
        } else {
            command = `docker ${action} "${app}"`;
        }
        
        await execPromise(command);
        
        // Notificar cambio vía socket
        io.emit('app-status-change', { app, action, type });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Deploy desde GitHub
app.post('/api/apps/deploy', async (req, res) => {
    const { repoUrl, appName, appPort, subdomain, appType } = req.body;
    
    try {
        const deployScript = path.join('/Users/mini-server/server-config/scripts/deploy-app.sh');
        
        // Clonar repositorio
        await execPromise(`cd /Users/mini-server/apps && git clone ${repoUrl} ${appName}`);
        
        // Deploy según tipo
        if (appType === 'node') {
            await execPromise(`cd /Users/mini-server/apps/${appName} && npm install`);
            await execPromise(`pm2 start npm --name ${appName} -- start`);
        } else if (appType === 'docker') {
            await execPromise(`cd /Users/mini-server/apps/${appName} && docker build -t ${appName} .`);
            await execPromise(`docker run -d --name ${appName} -p ${appPort}:${appPort} ${appName}`);
        }
        
        // Configurar dominio si se especificó
        if (subdomain) {
            await execPromise(`${deployScript} ${appName} ${appPort} ${subdomain}.lisbontiles.com`);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Lista de bases de datos
app.get('/api/databases/list', async (req, res) => {
    try {
        // PostgreSQL
        let pgDbs = [];
        try {
            const { stdout: pgData } = await execPromise(
                `PGPASSWORD=postgres psql -U postgres -h localhost -t -c "SELECT datname FROM pg_database WHERE datistemplate = false;" 2>/dev/null`
            );
            pgDbs = pgData.split('\n').filter(db => db.trim() && !db.includes('|'));
        } catch (e) {
            console.log('PostgreSQL no disponible');
        }
        
        // SQLite
        const { stdout: sqliteFiles } = await execPromise(
            'find /Users/mini-server -name "*.db" -o -name "*.sqlite" 2>/dev/null | grep -v node_modules | head -20'
        );
        
        res.json({
            postgresql: pgDbs,
            sqlite: sqliteFiles.split('\n').filter(f => f)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Tablas de una base de datos
app.get('/api/databases/:db/tables', async (req, res) => {
    const { db } = req.params;
    const { type } = req.query;
    
    try {
        let tables = [];
        
        if (type === 'postgresql') {
            const { stdout } = await execPromise(
                `PGPASSWORD=postgres psql -U postgres -h localhost -d "${db}" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';" 2>/dev/null`
            );
            tables = stdout.split('\n').filter(t => t.trim() && !t.includes('|'));
        } else {
            const { stdout } = await execPromise(`sqlite3 "${db}" ".tables"`);
            tables = stdout.split(/\s+/).filter(t => t);
        }
        
        res.json({ tables });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Datos de una tabla
app.get('/api/databases/:db/table/:table', async (req, res) => {
    const { db, table } = req.params;
    const { type } = req.query;
    
    try {
        let data;
        
        if (type === 'postgresql') {
            const { stdout: columns } = await execPromise(
                `PGPASSWORD=postgres psql -U postgres -h localhost -d "${db}" -t -c "SELECT column_name FROM information_schema.columns WHERE table_name = '${table}';" 2>/dev/null`
            );
            
            const { stdout: rows } = await execPromise(
                `PGPASSWORD=postgres psql -U postgres -h localhost -d "${db}" -t -A -F"," -c "SELECT * FROM ${table} LIMIT 100;" 2>/dev/null`
            );
            
            const { stdout: count } = await execPromise(
                `PGPASSWORD=postgres psql -U postgres -h localhost -d "${db}" -t -c "SELECT COUNT(*) FROM ${table};" 2>/dev/null`
            );
            
            data = {
                columns: columns.split('\n').filter(c => c.trim() && !c.includes('|')),
                rows: rows.split('\n').filter(r => r).map(r => {
                    const values = r.split(',');
                    const row = {};
                    data.columns.forEach((col, i) => {
                        row[col] = values[i];
                    });
                    return row;
                }),
                count: parseInt(count)
            };
        } else {
            const { stdout } = await execPromise(
                `sqlite3 -header -csv "${db}" "SELECT * FROM ${table} LIMIT 100;"`
            );
            
            const lines = stdout.split('\n').filter(l => l);
            const columns = lines[0].split(',');
            
            const { stdout: countData } = await execPromise(
                `sqlite3 "${db}" "SELECT COUNT(*) FROM ${table};"`
            );
            
            data = {
                columns,
                rows: lines.slice(1).map(line => {
                    const values = line.split(',');
                    const row = {};
                    columns.forEach((col, i) => {
                        row[col] = values[i];
                    });
                    return row;
                }),
                count: parseInt(countData)
            };
        }
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Exportar tabla a CSV
app.post('/api/databases/export', async (req, res) => {
    const { database, table, type } = req.body;
    
    try {
        let csvData;
        
        if (type === 'postgresql') {
            const { stdout } = await execPromise(
                `PGPASSWORD=postgres psql -U postgres -h localhost -d "${database}" -t -A -F"," -c "COPY ${table} TO STDOUT WITH CSV HEADER;"`
            );
            csvData = stdout;
        } else {
            const { stdout } = await execPromise(
                `sqlite3 -header -csv "${database}" "SELECT * FROM ${table};"`
            );
            csvData = stdout;
        }
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
        res.send(csvData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Backup de base de datos
app.post('/api/databases/backup', async (req, res) => {
    const { database, type } = req.body;
    
    try {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupDir = '/Users/mini-server/backups/databases';
        await execPromise(`mkdir -p ${backupDir}`);
        
        if (type === 'postgresql') {
            const backupFile = `${backupDir}/${database}_${timestamp}.sql`;
            await execPromise(
                `PGPASSWORD=postgres pg_dump -U postgres -h localhost ${database} > ${backupFile}`
            );
        } else {
            const backupFile = `${backupDir}/${path.basename(database)}_${timestamp}.db`;
            await execPromise(`cp "${database}" "${backupFile}"`);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Lista de dominios
app.get('/api/domains/list', async (req, res) => {
    try {
        const domainsFile = '/Users/mini-server/server-config/domains.json';
        const data = await fsPromises.readFile(domainsFile, 'utf8').catch(() => '{"domains":[]}');
        const parsedData = JSON.parse(data);
        const domains = parsedData.domains || [];
        
        // Mantener la estructura jerárquica para mejor visualización
        const enrichedDomains = domains.map(domain => ({
            ...domain,
            totalSubdomains: (domain.subdomains || []).length,
            localSubdomains: (domain.subdomains || []).filter(s => s.ip === parsedData.server_info?.public_ip).length,
            externalSubdomains: (domain.subdomains || []).filter(s => s.ip !== parsedData.server_info?.public_ip).length
        }));
        
        res.json({ 
            domains: enrichedDomains,
            serverInfo: parsedData.server_info
        });
    } catch (error) {
        console.error('Error loading domains:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Agregar dominio
app.post('/api/domains/add', async (req, res) => {
    const { subdomain, app, port, zoneId, domainName } = req.body;
    
    try {
        // Configurar en Cloudflare
        const cfToken = process.env.CLOUDFLARE_API_TOKEN;
        
        const { stdout } = await execPromise(`
            curl -X POST "https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records" \
                -H "Authorization: Bearer ${cfToken}" \
                -H "Content-Type: application/json" \
                --data '{"type":"A","name":"${subdomain}","content":"85.245.221.221","ttl":120,"proxied":true}'
        `);
        
        const result = JSON.parse(stdout);
        if (!result.success) {
            throw new Error(result.errors?.[0]?.message || 'Error al crear registro DNS');
        }
        
        // Configurar Nginx
        const fullDomain = `${subdomain}.${domainName}`;
        const nginxConfig = `
server {
    listen 80;
    server_name ${fullDomain};
    
    location / {
        proxy_pass http://localhost:${port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;
        
        await fsPromises.writeFile(
            `/usr/local/etc/nginx/servers/${subdomain}-${domainName.replace(/\./g, '-')}.conf`,
            nginxConfig
        );
        
        await execPromise('brew services reload nginx');
        
        // Actualizar domains.json
        const domainsFile = '/Users/mini-server/server-config/domains.json';
        const data = await fsPromises.readFile(domainsFile, 'utf8');
        const domainsData = JSON.parse(data);
        
        // Encontrar el dominio principal y agregar el subdominio
        const domainIndex = domainsData.domains.findIndex(d => d.zone_id === zoneId);
        if (domainIndex !== -1) {
            if (!domainsData.domains[domainIndex].subdomains) {
                domainsData.domains[domainIndex].subdomains = [];
            }
            
            domainsData.domains[domainIndex].subdomains.push({
                name: fullDomain,
                ip: "85.245.221.221",
                ssl: true,
                app: app,
                port: parseInt(port),
                created: new Date().toISOString()
            });
            
            // Actualizar subdominios disponibles
            const subIndex = domainsData.domains[domainIndex].available_subdomains.indexOf(subdomain);
            if (subIndex > -1) {
                domainsData.domains[domainIndex].available_subdomains.splice(subIndex, 1);
            }
        }
        
        domainsData.last_updated = new Date().toISOString();
        await fsPromises.writeFile(domainsFile, JSON.stringify(domainsData, null, 2));
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Eliminar dominio
app.delete('/api/domains/:domain', async (req, res) => {
    const { domain } = req.params;
    
    try {
        // Buscar información del dominio
        const domainsFile = '/Users/mini-server/server-config/domains.json';
        const data = await fsPromises.readFile(domainsFile, 'utf8');
        const domainsData = JSON.parse(data);
        
        let domainInfo = null;
        let parentDomain = null;
        
        // Buscar el subdominio en todos los dominios
        for (const d of domainsData.domains) {
            const subIndex = d.subdomains?.findIndex(s => s.name === domain);
            if (subIndex !== undefined && subIndex !== -1) {
                domainInfo = d.subdomains[subIndex];
                parentDomain = d;
                
                // Eliminar el subdominio del array
                d.subdomains.splice(subIndex, 1);
                
                // Agregar el subdominio de vuelta a los disponibles
                const subdomain = domain.split('.')[0];
                if (!d.available_subdomains.includes(subdomain)) {
                    d.available_subdomains.push(subdomain);
                }
                break;
            }
        }
        
        if (!domainInfo || !parentDomain) {
            throw new Error('Dominio no encontrado');
        }
        
        // Eliminar de Cloudflare
        const cfToken = process.env.CLOUDFLARE_API_TOKEN;
        
        // Primero obtener el ID del registro DNS
        const { stdout: recordsData } = await execPromise(`
            curl -X GET "https://api.cloudflare.com/client/v4/zones/${parentDomain.zone_id}/dns_records?name=${domain}" \
                -H "Authorization: Bearer ${cfToken}" \
                -H "Content-Type: application/json"
        `);
        
        const records = JSON.parse(recordsData);
        if (records.result && records.result.length > 0) {
            const recordId = records.result[0].id;
            
            // Eliminar el registro DNS
            await execPromise(`
                curl -X DELETE "https://api.cloudflare.com/client/v4/zones/${parentDomain.zone_id}/dns_records/${recordId}" \
                    -H "Authorization: Bearer ${cfToken}" \
                    -H "Content-Type: application/json"
            `);
        }
        
        // Eliminar de Nginx
        const nginxFile = `/usr/local/etc/nginx/servers/${domain.split('.')[0]}-${parentDomain.name.replace(/\./g, '-')}.conf`;
        await execPromise(`rm -f "${nginxFile}"`).catch(() => {
            // Si no existe el archivo, intentar con el formato antiguo
            return execPromise(`rm -f /usr/local/etc/nginx/servers/${domain.split('.')[0]}.conf`);
        });
        
        await execPromise('brew services reload nginx');
        
        // Guardar cambios
        domainsData.last_updated = new Date().toISOString();
        await fsPromises.writeFile(domainsFile, JSON.stringify(domainsData, null, 2));
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Información de backups
app.get('/api/backups/info', async (req, res) => {
    try {
        const backupDir = '/Users/mini-server/backups';
        
        // Obtener lista de backups
        const { stdout: backupList } = await execPromise(
            `find ${backupDir} -name "*.tar.gz" -o -name "*.sql" -o -name "*.db" | head -20`
        );
        
        const backups = await Promise.all(
            backupList.split('\n').filter(f => f).map(async (file) => {
                const stats = await fsPromises.stat(file);
                return {
                    id: path.basename(file),
                    date: stats.mtime,
                    size: stats.size,
                    type: file.includes('databases') ? 'database' : 'system',
                    status: 'success'
                };
            })
        );
        
        // Calcular tamaño total
        const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
        
        // Último backup
        const lastBackup = backups.length > 0 
            ? Math.max(...backups.map(b => new Date(b.date).getTime()))
            : null;
        
        res.json({
            lastBackup,
            totalSize,
            nextBackup: new Date(Date.now() + 86400000).toISOString(), // +24h
            history: backups.sort((a, b) => new Date(b.date) - new Date(a.date))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Crear backup manual
app.post('/api/backups/create', async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupDir = '/Users/mini-server/backups/manual';
        await execPromise(`mkdir -p ${backupDir}`);
        
        // Crear backup de aplicaciones y bases de datos
        const backupFile = `${backupDir}/backup_${timestamp}.tar.gz`;
        
        await execPromise(`
            tar -czf ${backupFile} \
                /Users/mini-server/apps \
                /Users/mini-server/MiGestPro \
                /Users/mini-server/server-config \
                --exclude node_modules \
                --exclude .git
        `);
        
        // Backup de bases de datos PostgreSQL
        await execPromise(`
            PGPASSWORD=postgres pg_dumpall -U postgres -h localhost > ${backupDir}/postgres_${timestamp}.sql
        `);
        
        res.json({ success: true, file: backupFile });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Lista de proyectos disponibles
app.get('/api/projects/list', async (req, res) => {
    try {
        // Usar el escáner automático de proyectos
        const { scanAllProjects } = require('/Users/mini-server/server-config/project-scanner.js');
        let projects = await scanAllProjects();
        
        // Filtrar solo proyectos que queremos mostrar
        projects = projects.filter(p => 
            p.id !== 'server-config' &&
            !p.path.includes('node_modules')
        );

        // Verificar estado real de cada proyecto
        for (let project of projects) {
            try {
                await fsPromises.access(project.path);
                
                // Verificar si tiene CLAUDE.md
                try {
                    await fsPromises.access(`${project.path}/CLAUDE.md`);
                    project.hasClaude = true;
                } catch {
                    project.hasClaude = false;
                }

                // Verificar si es repositorio git
                try {
                    await execPromise(`cd "${project.path}" && git rev-parse --git-dir`);
                    project.hasGit = true;
                    
                    // Detectar cambios en Git
                    const { stdout: statusOutput } = await execPromise(`cd "${project.path}" && git status --porcelain 2>/dev/null || echo ""`);
                    const changes = statusOutput.trim().split('\n').filter(line => line.length > 0);
                    
                    // Detectar commits sin push
                    let unpushedCommits = 0;
                    try {
                        const currentBranch = await execPromise(`cd "${project.path}" && git branch --show-current`);
                        const { stdout: logOutput } = await execPromise(`cd "${project.path}" && git log origin/${currentBranch.stdout.trim()}..HEAD --oneline 2>/dev/null | wc -l`);
                        unpushedCommits = parseInt(logOutput.trim()) || 0;
                    } catch (e) {
                        // No hay remote o no hay commits
                    }
                    
                    // Detectar si está desplegado
                    let deployedVersion = null;
                    let isDeployed = false;
                    
                    // Verificar si está en PM2
                    try {
                        const { stdout: pm2Output } = await execPromise(`pm2 list | grep -i "${project.name}" || true`);
                        if (pm2Output.trim()) {
                            isDeployed = true;
                            
                            // Obtener versión desplegada (si hay tags)
                            try {
                                const { stdout: deployedTag } = await execPromise(`cd "${project.path}" && git describe --tags --abbrev=0 2>/dev/null`);
                                deployedVersion = deployedTag.trim();
                            } catch (e) {
                                deployedVersion = 'latest';
                            }
                        }
                    } catch (e) {
                        // No está en PM2
                    }
                    
                    project.gitStatus = {
                        hasChanges: changes.length > 0,
                        changedFiles: changes.length,
                        unpushedCommits: unpushedCommits,
                        needsCommit: changes.length > 0,
                        needsPush: unpushedCommits > 0,
                        needsRedeploy: (changes.length > 0 || unpushedCommits > 0) && isDeployed,
                        isDeployed: isDeployed,
                        deployedVersion: deployedVersion
                    };
                    
                    // Obtener última versión
                    try {
                        const { stdout } = await execPromise(`cd "${project.path}" && git describe --tags --abbrev=0`);
                        project.currentVersion = stdout.trim();
                    } catch {
                        project.currentVersion = 'v0.0.0';
                    }
                } catch {
                    project.hasGit = false;
                }
            } catch {
                project.status = 'not_found';
            }
        }

        res.json({ projects });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Cerrar proyecto (Usando script universal)
app.post('/api/projects/:projectId/close', async (req, res) => {
    const { projectId } = req.params;
    
    try {
        // Obtener ruta del proyecto de manera genérica
        const projectPath = await getProjectPath(projectId);
        if (!projectPath) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        // Usar el script universal de cierre que ya tiene la lógica correcta
        const closeScript = '/Users/mini-server/project-management/scripts/project-close.sh';
        const closeCommand = `"${closeScript}" "${projectPath}"`;
        
        console.log('Ejecutando cierre:', closeCommand);
        
        let stdout = '';
        let stderr = '';
        
        try {
            const result = await execPromise(closeCommand, {
                maxBuffer: 1024 * 1024 * 10, // 10MB buffer
                timeout: 60000, // 60 segundos timeout
                cwd: projectPath // Asegurar que se ejecuta en el directorio correcto
            });
            stdout = result.stdout || '';
            stderr = result.stderr || '';
        } catch (execError) {
            console.error('Error ejecutando script de cierre:', execError);
            // Si hay salida parcial, usarla
            stdout = execError.stdout || '';
            stderr = execError.stderr || execError.message;
            
            // Si el error es porque ya está en la versión actual, no es realmente un error
            if (stderr.includes('already exists') || 
                stderr.includes('nada para hacer commit') ||
                stderr.includes('No hay cambios nuevos') ||
                stderr.includes('nothing to commit') ||
                stdout.includes('No hay cambios nuevos para commitear')) {
                console.log('El proyecto ya está actualizado - no hay cambios pendientes');
                // Continuar con la información disponible
            } else {
                throw execError;
            }
        }
        
        // Parsear la salida del script para extraer información relevante
        const result = {
            project: projectId,
            status: 'success',
            output: stdout,
            steps: [],
            currentVersion: 'v0.0.0',
            newVersion: 'v0.0.1',
            hasChanges: false,
            gitInitialized: false,
            needsRemote: false,
            pushedToGitHub: false,
            projectDetails: {}
        };

        // Parsear información del stdout
        if (stdout.includes('Nueva versión:')) {
            const versionMatch = stdout.match(/Nueva versión: (v[\d\.]+)/);
            if (versionMatch) result.newVersion = versionMatch[1];
        }
        
        if (stdout.includes('Versión actual:')) {
            const currentMatch = stdout.match(/Versión actual: (v[\d\.]+)/);
            if (currentMatch) result.currentVersion = currentMatch[1];
        }
        
        if (stdout.includes('GitHub:')) {
            const githubMatch = stdout.match(/GitHub: (https:\/\/github\.com\/[^\s]+)/);
            if (githubMatch) result.githubUrl = githubMatch[1];
        }
        
        // Extraer pasos del script
        const lines = stdout.split('\n');
        for (const line of lines) {
            if (line.includes('✅') || line.includes('🔄') || line.includes('📝') || 
                line.includes('🏷️') || line.includes('📤') || line.includes('⚠️')) {
                result.steps.push(line.trim());
            }
        }

        // Determinar si el push fue exitoso
        if (stdout.includes('✅ Cambios y tags subidos exitosamente a GitHub') || 
            stdout.includes('Successfully pushed to GitHub')) {
            result.pushedToGitHub = true;
        } else if (stdout.includes('GitHub no configurado') || 
                   stdout.includes('GitHub: No configurado')) {
            result.needsRemote = true;
        }
        
        // Detectar tipo de proyecto
        if (stdout.includes('Tipo detectado:')) {
            const typeMatch = stdout.match(/Tipo detectado: ([^\n]+)/);
            if (typeMatch) result.projectDetails.type = typeMatch[1];
        }
        
        // Detectar si fue Git inicializado
        if (stdout.includes('Repositorio Git inicializado')) {
            result.gitInitialized = true;
        }
        
        // Detectar si repo ya existe en GitHub
        if (stdout.includes('El repositorio existe como:')) {
            const repoMatch = stdout.match(/El repositorio existe como: ([^\s,]+)/);
            if (repoMatch) {
                result.steps.push(`✅ Repositorio GitHub detectado correctamente: ${repoMatch[1]}`);
            }
        }
        
        // Detectar problemas específicos de push
        if (stdout.includes('Push failed:') || stdout.includes('Error subiendo a GitHub:')) {
            result.pushError = 'Error de sincronización con GitHub';
            result.needsSync = true;
        }
        
        // Preparar resumen para UI
        result.summary = {
            project: projectId,
            version: `${result.currentVersion} → ${result.newVersion}`,
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            type: result.projectDetails.type || 'Unknown',
            location: projectPath,
            github: result.pushedToGitHub ? result.githubUrl : (result.needsSync ? 'Necesita sincronización' : 'No configurado'),
            actions: result.steps.filter(step => step.includes('✅')).slice(0, 6)
        };
        
        // Si hay errores en stderr, incluirlos
        if (stderr) {
            result.warnings = stderr;
        }
        
        res.json(result);
    } catch (error) {
        console.error('Error cerrando proyecto:', error);
        res.status(500).json({ 
            error: error.message,
            project: projectId,
            status: 'error'
        });
    }
});

// API: Deploy proyecto
app.post('/api/projects/:projectId/deploy', async (req, res) => {
    const { projectId } = req.params;
    const { subdomain, port } = req.body;
    
    try {
        // Obtener ruta del proyecto de manera genérica
        const projectPath = await getProjectPath(projectId);
        if (!projectPath) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        // Verificar que se proporcionó puerto
        if (!port) {
            return res.status(400).json({ 
                error: 'El puerto es obligatorio para el deploy',
                message: 'Debes especificar un puerto para el deploy'
            });
        }
        
        // Ejecutar script de deploy
        const deployScript = '/Users/mini-server/project-management/scripts/project-deploy.sh';
        const deployCommand = `"${deployScript}" "${projectPath}" "${subdomain || projectId}" "${port}"`;
        
        console.log('Ejecutando deploy:', deployCommand);
        
        const { stdout, stderr } = await execPromise(deployCommand);
        
        // Detectar si se ejecutó auto-cierre
        const autoClosed = stdout.includes('Ejecutando cierre automático') || 
                          stdout.includes('Detectados cambios sin commitear');
        
        // Extraer nueva versión si se cerró
        let newVersion = null;
        if (autoClosed) {
            const versionMatch = stdout.match(/Nueva versión: (v[\d.]+)/);
            if (versionMatch) {
                newVersion = versionMatch[1];
            }
        }
        
        // Parsear resultado del script
        const result = {
            project: projectId,
            status: 'success',
            output: stdout,
            error: stderr,
            timestamp: new Date().toISOString(),
            deployUrl: subdomain ? `https://${subdomain}.lisbontiles.com` : null,
            localUrl: port ? `http://localhost:${port}` : null,
            autoClosed: autoClosed,
            newVersion: newVersion
        };

        res.json(result);
    } catch (error) {
        console.error('Error deployando proyecto:', error);
        res.status(500).json({ 
            error: error.message,
            project: projectId,
            status: 'error',
            output: error.stdout || '',
            errorDetails: error.stderr || ''
        });
    }
});

// API: Iniciar proyecto (development)
app.post('/api/projects/:projectId/start', async (req, res) => {
    const { projectId } = req.params;
    const { mode = 'analyze' } = req.body; // Por defecto, analizar primero
    
    try {
        // Obtener ruta del proyecto de manera genérica
        const projectPath = await getProjectPath(projectId);
        if (!projectPath) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        // Si el modo es "analyze", ejecutar script de análisis
        if (mode === 'analyze') {
            const analyzeScript = '/Users/mini-server/project-management/scripts/project-analyze.sh';
            const analyzeCommand = `"${analyzeScript}" "${projectPath}"`;
            
            console.log('Analizando proyecto:', analyzeCommand);
            
            const { stdout: analyzeOutput, stderr: analyzeError } = await execPromise(analyzeCommand);
            
            try {
                const analysis = JSON.parse(analyzeOutput);
                
                // También preparar información de desarrollo remoto
                const remoteScript = '/Users/mini-server/project-management/scripts/project-start-remote.sh';
                const { stdout: remoteOutput } = await execPromise(`"${remoteScript}" "${projectPath}" "mini-server"`);
                
                // Extraer información remota
                const jsonMatch = remoteOutput.match(/---JSON_OUTPUT---([\s\S]*?)---END_JSON_OUTPUT---/);
                let remoteInfo = {};
                if (jsonMatch) {
                    try {
                        remoteInfo = JSON.parse(jsonMatch[1].trim());
                    } catch (e) {
                        console.error('Error parsing remote info:', e);
                    }
                }
                
                res.json({
                    project: projectId,
                    status: 'analyzed',
                    mode: mode,
                    analysis: analysis,
                    remoteInfo: remoteInfo,
                    quickConnect: {
                        sshCommand: remoteInfo.ssh_command,
                        warpUrl: remoteInfo.warp_url
                    },
                    timestamp: new Date().toISOString()
                });
                
            } catch (parseError) {
                console.error('Error parsing analysis:', parseError);
                res.json({
                    project: projectId,
                    status: 'error',
                    error: 'Error analizando proyecto',
                    output: analyzeOutput,
                    stderr: analyzeError
                });
            }
            return;
        }

        // Modo tradicional de inicio (para compatibilidad)
        const startScript = '/Users/mini-server/project-management/scripts/project-start.sh';
        const startCommand = `"${startScript}" "${projectPath}" "${mode}"`;
        
        console.log('Preparando proyecto:', startCommand);
        
        const { stdout, stderr } = await execPromise(startCommand);
        
        // Extraer información relevante del output
        const portMatch = stdout.match(/Puerto:\s*(\d+)/);
        const typeMatch = stdout.match(/Tipo:\s*([^\n]+)/);
        const dependenciesMatch = stdout.match(/DEPENDENCIAS ACTIVAS:\s*([\s\S]*?)(?=\n\n|\n🚀|$)/);
        
        const result = {
            project: projectId,
            status: 'success',
            mode: mode,
            output: stdout,
            error: stderr,
            timestamp: new Date().toISOString(),
            projectType: typeMatch ? typeMatch[1].trim() : 'Unknown',
            port: portMatch ? portMatch[1] : null,
            localUrl: portMatch ? `http://localhost:${portMatch[1]}` : null,
            dependencies: dependenciesMatch ? dependenciesMatch[1].split('\n').filter(line => line.includes('✅')).map(line => line.replace(/.*✅\s*/, '').trim()) : [],
            ready: true
        };

        res.json(result);
    } catch (error) {
        console.error('Error iniciando proyecto:', error);
        res.status(500).json({ 
            error: error.message,
            project: projectId,
            status: 'error',
            output: error.stdout || '',
            errorDetails: error.stderr || ''
        });
    }
});

// API: Iniciar proyecto en modo desarrollo remoto
app.post('/api/projects/:projectId/start-remote', async (req, res) => {
    const { projectId } = req.params;
    const { remoteUser = 'mini-server' } = req.body;
    
    try {
        // Obtener ruta del proyecto de manera genérica
        const projectPath = await getProjectPath(projectId);
        if (!projectPath) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        // Ejecutar script de desarrollo remoto
        const remoteScript = '/Users/mini-server/project-management/scripts/project-start-remote.sh';
        const remoteCommand = `"${remoteScript}" "${projectPath}" "${remoteUser}"`;
        
        console.log('Preparando desarrollo remoto:', remoteCommand);
        
        const { stdout, stderr } = await execPromise(remoteCommand);
        
        // Extraer JSON del output
        const jsonMatch = stdout.match(/---JSON_OUTPUT---([\s\S]*?)---END_JSON_OUTPUT---/);
        let remoteInfo = {};
        
        if (jsonMatch) {
            try {
                remoteInfo = JSON.parse(jsonMatch[1].trim());
            } catch (e) {
                console.error('Error parsing remote info:', e);
            }
        }
        
        // Generar URLs de conexión
        const connectUrl = `http://${req.headers.host}/api/projects/${projectId}/remote-dev`;
        const warpCommand = `curl -s '${connectUrl}' | bash -s -- --open-warp`;
        
        const result = {
            project: projectId,
            status: 'success',
            mode: 'remote-development',
            output: stdout,
            error: stderr,
            timestamp: new Date().toISOString(),
            remoteInfo: remoteInfo,
            quickConnect: {
                sshCommand: remoteInfo.ssh_command,
                warpUrl: remoteInfo.warp_url,
                downloadScript: `${connectUrl}/script`,
                curlCommand: warpCommand
            }
        };

        res.json(result);
    } catch (error) {
        console.error('Error preparando desarrollo remoto:', error);
        res.status(500).json({ 
            error: error.message,
            project: projectId,
            timestamp: new Date().toISOString()
        });
    }
});

// API: Obtener información de desarrollo remoto
app.get('/api/projects/:projectId/remote-dev', async (req, res) => {
    const { projectId } = req.params;
    
    try {
        // Leer información del archivo temporal
        const infoFile = `/tmp/remote-dev-${projectId}.json`;
        
        if (fs.existsSync(infoFile)) {
            const data = await fsPromises.readFile(infoFile, 'utf8');
            const remoteInfo = JSON.parse(data);
            
            // Si se solicita el script
            if (req.path.endsWith('/script')) {
                res.type('text/plain');
                res.send(`#!/bin/bash
# Auto-generated script for remote development
PROJECT="${remoteInfo.project}"
SSH_CMD="${remoteInfo.ssh_command}"

echo "🚀 Conectando a desarrollo remoto: $PROJECT"
echo ""

# Verificar si estamos en macOS con Warp
if [[ "$OSTYPE" == "darwin"* ]] && [ -d "/Applications/Warp.app" ]; then
    echo "🔗 Abriendo Warp Terminal..."
    osascript -e "tell app \\"Warp\\" to activate" \\
              -e "tell app \\"System Events\\" to keystroke \\"t\\" using command down" \\
              -e "tell app \\"System Events\\" to keystroke \\"$SSH_CMD\\"" \\
              -e "tell app \\"System Events\\" to key code 36"
else
    echo "📋 Comando SSH (copia y pega):"
    echo "$SSH_CMD"
    echo ""
    echo "$SSH_CMD" | pbcopy 2>/dev/null && echo "✅ Copiado al clipboard"
fi
`);
            } else {
                res.json(remoteInfo);
            }
        } else {
            res.status(404).json({ error: 'Información de desarrollo remoto no encontrada' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Obtener historial de operaciones (todos)
app.get('/api/projects/history', async (req, res) => {
    const { limit = 50 } = req.query;
    
    try {
        const historyData = await getHistoryData(null, limit);
        res.json({
            success: true,
            type: 'all',
            count: historyData.all.length,
            data: historyData
        });
    } catch (error) {
        console.error('Error leyendo historial:', error);
        res.status(500).json({ 
            error: error.message,
            success: false
        });
    }
});

// API: Obtener historial de operaciones (por tipo)
app.get('/api/projects/history/:type', async (req, res) => {
    const { type } = req.params;
    const { limit = 50 } = req.query;
    
    try {
        const historyData = await getHistoryData(type, limit);
        const result = type && historyData[type] ? historyData[type] : historyData;
        
        res.json({
            success: true,
            type: type || 'all',
            count: Array.isArray(result) ? result.length : Object.values(result).flat().length,
            data: result
        });
        
    } catch (error) {
        console.error('Error leyendo historial:', error);
        res.status(500).json({ 
            error: error.message,
            success: false
        });
    }
});

// API: Obtener archivos MD de un proyecto
app.get('/api/projects/:projectId/docs', async (req, res) => {
    const { projectId } = req.params;
    
    try {
        // Obtener información del proyecto de manera genérica
        const projectPath = await getProjectPath(projectId);
        if (!projectPath) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }
        
        // Obtener el nombre del proyecto del scanner
        const { scanAllProjects } = require('/Users/mini-server/server-config/project-scanner.js');
        const projects = await scanAllProjects();
        const project = projects.find(p => p.id === projectId);
        const projectName = project ? project.name : projectId;
        const mdFiles = [];
        
        // Buscar archivos .md en el directorio del proyecto
        const searchPaths = [
            projectPath,
            path.join(projectPath, 'docs'),
            path.join(projectPath, 'documentation')
        ];
        
        for (const searchPath of searchPaths) {
            if (fs.existsSync(searchPath)) {
                const files = await fsPromises.readdir(searchPath);
                
                for (const file of files) {
                    if (file.endsWith('.md') || file.endsWith('.MD')) {
                        const filePath = path.join(searchPath, file);
                        const stats = await fsPromises.stat(filePath);
                        
                        if (stats.isFile()) {
                            try {
                                const content = await fsPromises.readFile(filePath, 'utf8');
                                mdFiles.push({
                                    name: file,
                                    path: filePath.replace(projectPath, ''),
                                    content: content,
                                    size: stats.size,
                                    modified: stats.mtime
                                });
                            } catch (readError) {
                                console.error(`Error leyendo ${file}:`, readError);
                            }
                        }
                    }
                }
            }
        }
        
        res.json({
            success: true,
            project: projectName,
            files: mdFiles,
            count: mdFiles.length
        });
        
    } catch (error) {
        console.error('Error obteniendo documentación:', error);
        res.status(500).json({ 
            error: error.message,
            success: false
        });
    }
});

// API: Estadísticas de operaciones
app.get('/api/projects/stats', async (req, res) => {
    try {
        const stats = {
            totalProjects: 0,
            totalOperations: 0,
            operationsByType: {
                deploy: 0,
                start: 0,
                close: 0
            },
            projectActivity: {},
            recentActivity: [],
            lastWeek: {
                deploy: 0,
                start: 0,
                close: 0
            }
        };
        
        // Obtener historial completo
        const historyResponse = await fetch('http://localhost:8888/api/projects/history');
        const historyData = await historyResponse.json();
        
        if (historyData.success && historyData.data.all) {
            const entries = historyData.data.all;
            stats.totalOperations = entries.length;
            
            // Fecha límite para "última semana"
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            
            // Procesar entradas
            const projects = new Set();
            
            entries.forEach(entry => {
                projects.add(entry.project);
                stats.operationsByType[entry.type]++;
                
                // Actividad por proyecto
                if (!stats.projectActivity[entry.project]) {
                    stats.projectActivity[entry.project] = {
                        deploy: 0,
                        start: 0,
                        close: 0,
                        total: 0,
                        lastActivity: entry.timestamp
                    };
                }
                stats.projectActivity[entry.project][entry.type]++;
                stats.projectActivity[entry.project].total++;
                
                // Última semana
                if (entry.date > weekAgo) {
                    stats.lastWeek[entry.type]++;
                }
            });
            
            stats.totalProjects = projects.size;
            stats.recentActivity = entries.slice(0, 10);
        }
        
        res.json({
            success: true,
            stats
        });
        
    } catch (error) {
        console.error('Error generando estadísticas:', error);
        res.status(500).json({ 
            error: error.message,
            success: false
        });
    }
});

// Función auxiliar para leer datos de historial
async function getHistoryData(filterType = null, limit = 50) {
    const historyData = {
        all: [],
        deploy: [],
        start: [],
        close: []
    };
    
    // Rutas de los archivos de log
    const logFiles = {
        deploy: '/Users/mini-server/project-management/logs/deploy-history.log',
        start: '/Users/mini-server/project-management/logs/start-history.log',
        close: '/Users/mini-server/project-management/logs/closure-history.log'
    };
    
    // Leer cada archivo de log
    for (const [logType, filePath] of Object.entries(logFiles)) {
        try {
            if (await fsPromises.access(filePath).then(() => true).catch(() => false)) {
                const content = await fsPromises.readFile(filePath, 'utf8');
                const lines = content.trim().split('\n').filter(line => line);
                
                const entries = lines.map(line => {
                    // Parsear formato: [timestamp] project: info
                    const match = line.match(/^\[([^\]]+)\]\s+([^:]+):\s+(.+)$/);
                    if (match) {
                        const [, timestamp, project, details] = match;
                        return {
                            timestamp,
                            project: project.trim(),
                            details: details.trim(),
                            type: logType,
                            date: new Date(timestamp)
                        };
                    }
                    return null;
                }).filter(Boolean);
                
                historyData[logType] = entries;
                historyData.all.push(...entries);
            }
        } catch (error) {
            console.log(`Log file ${logType} not found or empty`);
        }
    }
    
    // Ordenar por fecha (más reciente primero)
    historyData.all.sort((a, b) => b.date - a.date);
    
    // Aplicar límite
    const limitNum = parseInt(limit);
    if (filterType && historyData[filterType]) {
        historyData[filterType] = historyData[filterType].slice(0, limitNum);
    } else {
        historyData.all = historyData.all.slice(0, limitNum);
    }
    
    return historyData;
}

// Funciones auxiliares para el cierre universal
function generateUniversalCommitMessage(projectId, version, projectType, result) {
    // Usar descripción genérica para todos los proyectos
    const description = `- Proyecto ${projectType} completamente funcional\n- Sistema estable y documentado`;

    return `🎯 Cierre de proyecto ${projectId} ${version}

${description}

Cambios en esta sesión:
${result.gitInitialized ? '- Repositorio Git inicializado' : '- Proyecto actualizado y versionado'}
- CLAUDE.md ${result.hasChanges ? 'actualizado' : 'creado'} con documentación completa
- ${result.pushedToGitHub ? 'Subido exitosamente a GitHub' : 'Preparado para GitHub'}

🤖 Generated with Claude Code (Dashboard)
Co-Authored-By: Claude <noreply@anthropic.com>`;
}

function generateUniversalClosureInfo(projectId, version, result, projectType) {
    const now = new Date();
    
    return `

## Project Closure Information

**Closed:** ${now.toISOString()}
**Version:** ${version}
**Status:** ✅ Successfully Closed

### Final State Summary:
- **Project Type**: ${projectType}
- **System Status**: Completely functional and documented
- **Version Control**: ${result.gitInitialized ? 'Git initialized and' : 'Git'} configured with version ${version}
- **Documentation**: CLAUDE.md comprehensive and up-to-date
${result.githubUrl ? `- **GitHub**: ✅ [Repository](${result.githubUrl})` : '- **GitHub**: ⚠️ Not configured yet'}

### Key Achievements:
${getProjectAchievements(projectId)}

### Technical Stack:
${getTechnicalStack(projectId, projectType)}

### Repository Status:
${result.pushedToGitHub ? `
- ✅ **GitHub**: Successfully pushed to [${result.githubUrl}](${result.githubUrl})
- ✅ **Version**: ${version} available on GitHub
- ✅ **Tags**: All tags pushed successfully
- ✅ **Status**: Ready for collaboration and deployment
` : result.needsRemote ? `
- ⚠️ **GitHub**: Not connected yet
- 📋 **Setup Required**:
  1. Create GitHub repository: [${projectId}](https://github.com/new)
  2. Add remote: \`git remote add origin https://github.com/username/${projectId}.git\`
  3. Push: \`git push -u origin main --tags\`
` : `
- ⚠️ **GitHub**: Push failed
- 🔧 **Fix Required**: ${result.pushError}
- 💡 **Try**: \`git push origin main --tags\`
`}

### Development Notes:
- **Last Closure**: ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}
- **Automation**: Dashboard MVP with universal closure script
- **Versioning**: Semantic versioning (${version})
- **Continuity**: All context preserved for next development session

### Next Development Session:
- Review this closure information for context
- Check pending tasks and improvements
- Continue development with full project history
- All tools and documentation ready for immediate use

`;
}

function getProjectDescription(projectId, projectType) {
    // Retornar descripción genérica para todos los proyectos
    return `Proyecto ${projectType} con gestión automatizada de desarrollo.`;
}

function getTechnologyStack(projectPath) {
    if (fs.existsSync(`${projectPath}/package.json`)) return 'Node.js/JavaScript';
    if (fs.existsSync(`${projectPath}/requirements.txt`)) return 'Python';
    if (fs.existsSync(`${projectPath}/Dockerfile`)) return 'Docker';
    return 'General';
}

function getProjectAchievements(projectId) {
    // Retornar logros genéricos para todos los proyectos
    return `- Sistema ${projectId} completamente funcional
- Documentación completa y actualizada
- Versionado automático implementado
- Preparado para desarrollo continuo`;
}

function getTechnicalStack(projectId, projectType) {
    // Retornar stack técnico genérico para todos los proyectos
    return `- **Technology**: ${projectType}
- **Process Management**: PM2
- **Version Control**: Git con GitHub
- **Deployment**: Mac Mini Server`;
}

function getProjectTagDescription(projectId, projectType) {
    // Retornar descripción genérica para todos los proyectos
    return `Proyecto ${projectType} completamente funcional`;
}

function generateGitignore(projectType) {
    const base = `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# Dependency directories
node_modules/

# Optional npm cache directory
.npm

# Environment variables
.env
.env.local
.env.production
.env.test

# IDE files
.vscode/
.idea/
*.swp
*.swo
*~

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Temporary files
*.tmp
*.temp
`;

    const typeSpecific = {
        'Node.js': `
# Node.js specific
dist/
build/
.nyc_output/
`,
        'Python': `
# Python specific
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
ENV/
env.bak/
venv.bak/
.pytest_cache/
`,
        'Docker': `
# Docker specific
.dockerignore
`,
        'Web': `
# Web specific
dist/
build/
`,
        'General': `
# General project files
config/
secrets/
`
    };

    return base + (typeSpecific[projectType] || typeSpecific['General']);
}

// Función auxiliar para detectar tipo de proyecto
function getProjectType(projectPath) {
    const fs = require('fs');
    
    // Verificar archivos de configuración específicos
    if (fs.existsSync(`${projectPath}/package.json`)) return 'Node.js';
    if (fs.existsSync(`${projectPath}/requirements.txt`)) return 'Python';
    if (fs.existsSync(`${projectPath}/pyproject.toml`)) return 'Python';
    if (fs.existsSync(`${projectPath}/Dockerfile`)) return 'Docker';
    if (fs.existsSync(`${projectPath}/docker-compose.yml`)) return 'Docker';
    if (fs.existsSync(`${projectPath}/composer.json`)) return 'PHP';
    if (fs.existsSync(`${projectPath}/pom.xml`)) return 'Java';
    if (fs.existsSync(`${projectPath}/Cargo.toml`)) return 'Rust';
    if (fs.existsSync(`${projectPath}/go.mod`)) return 'Go';
    
    // Verificar por extensiones de archivos si no hay archivos de configuración
    try {
        const files = fs.readdirSync(projectPath);
        
        // Contar archivos por tipo
        const pythonFiles = files.filter(f => f.endsWith('.py')).length;
        const jsFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.ts')).length;
        const phpFiles = files.filter(f => f.endsWith('.php')).length;
        const javaFiles = files.filter(f => f.endsWith('.java')).length;
        
        // Determinar tipo principal
        if (pythonFiles > 0) return 'Python';
        if (jsFiles > 0) return 'JavaScript';
        if (phpFiles > 0) return 'PHP';
        if (javaFiles > 0) return 'Java';
        
        // Verificar si es un proyecto web
        if (files.some(f => f === 'index.html' || f === 'index.htm')) return 'Web';
        
    } catch (e) {
        console.error('Error reading project directory:', e);
    }
    
    return 'General';
}

// API: Obtener información de un proyecto
app.get('/api/projects/:projectId/info', async (req, res) => {
    const { projectId } = req.params;
    
    try {
        const projectPath = await getProjectPath(projectId);
        if (!projectPath) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        // Información del proyecto
        const { stdout: gitStatus } = await execPromise(`cd "${projectPath}" && git status --porcelain`);
        const { stdout: gitLog } = await execPromise(`cd "${projectPath}" && git log --oneline -10`);
        
        let currentVersion = 'Sin versión';
        try {
            const { stdout } = await execPromise(`cd "${projectPath}" && git describe --tags --abbrev=0`);
            currentVersion = stdout.trim();
        } catch (e) {
            // No hay tags
        }

        // Leer CLAUDE.md si existe
        let claudeContent = null;
        try {
            claudeContent = await fsPromises.readFile(`${projectPath}/CLAUDE.md`, 'utf8');
        } catch {
            // No existe
        }

        res.json({
            id: projectId,
            path: projectPath,
            currentVersion,
            hasChanges: !!gitStatus,
            changeCount: gitStatus.split('\n').filter(l => l).length,
            recentCommits: gitLog.split('\n').filter(l => l).slice(0, 5),
            hasClaude: !!claudeContent,
            claudePreview: claudeContent ? claudeContent.substring(0, 500) : null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Métricas en tiempo real
setInterval(async () => {
    try {
        // Obtener métricas actualizadas
        const { stdout: cpuUsage } = await execPromise(
            "ps -A -o %cpu | awk '{s+=$1} END {print s}'"
        );
        
        const { stdout: memInfo } = await execPromise(
            "vm_stat | awk '/Pages free/ {free=$3} /Pages active/ {active=$3} /Pages inactive/ {inactive=$3} /Pages wired/ {wired=$4} END {print (active+wired)*4096/1048576}'"
        );
        
        const { stdout: diskInfo } = await execPromise(
            "df -h / | tail -1 | awk '{print $5}' | sed 's/%//'"
        );
        
        io.emit('server-metrics', {
            cpu: Math.round(parseFloat(cpuUsage)),
            memory: Math.round(parseFloat(memInfo)),
            disk: parseInt(diskInfo)
        });
    } catch (error) {
        console.error('Error enviando métricas:', error);
    }
}, 5000);

// Iniciar servidor
const PORT = process.env.PORT || 8888;

server.listen(PORT, () => {
    console.log(`✅ Dashboard completo ejecutándose en http://localhost:${PORT}`);
    console.log('🌙 Modo oscuro incluido');
    console.log('📊 Gestión completa de bases de datos');
    console.log('🚀 Deploy desde GitHub');
    console.log('📜 Logs en tiempo real');
    console.log('💾 Sistema de backups');
});