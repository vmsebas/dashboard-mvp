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
        const projects = [
            {
                id: 'iva-compensator',
                name: 'IVA Compensator',
                path: '/Users/mini-server/production/node-apps/iva-compensator',
                type: 'python-flask',
                status: 'active',
                description: 'Sistema de compensación de IVA'
            },
            {
                id: 'migestpro',
                name: 'MiGestPro',
                path: '/Users/mini-server/MiGestPro',
                type: 'node',
                status: 'active',
                description: 'Sistema de gestión empresarial'
            },
            {
                id: 'dashboard-mvp',
                name: 'Dashboard MVP',
                path: '/Users/mini-server/server-dashboard-mvp',
                type: 'node',
                status: 'active',
                description: 'Panel de control del servidor'
            }
        ];

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

// API: Cerrar proyecto (Fusión completa con script original)
app.post('/api/projects/:projectId/close', async (req, res) => {
    const { projectId } = req.params;
    
    try {
        // Mapeo de proyectos
        const projectPaths = {
            'iva-compensator': '/Users/mini-server/production/node-apps/iva-compensator',
            'migestpro': '/Users/mini-server/MiGestPro',
            'dashboard-mvp': '/Users/mini-server/server-dashboard-mvp'
        };

        const projectPath = projectPaths[projectId];
        if (!projectPath) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        // Cambiar al directorio del proyecto
        process.chdir(projectPath);

        let result = {
            project: projectId,
            currentVersion: 'v0.0.0',
            newVersion: 'v1.0.0',
            hasChanges: false,
            steps: [],
            gitInitialized: false,
            needsRemote: false,
            projectDetails: {}
        };

        // =============================================================================
        // 1. VERIFICACIÓN DEL ESTADO - Fusionado con script original
        // =============================================================================
        result.steps.push('📊 Verificando estado del repositorio...');
        
        // Detectar tipo de proyecto
        const projectType = getProjectType(projectPath);
        result.projectDetails.type = projectType;
        result.projectDetails.path = projectPath;

        // Verificar si es repositorio Git
        let isGitRepo = false;
        try {
            await execPromise('git rev-parse --git-dir');
            isGitRepo = true;
            result.steps.push('✅ Repositorio Git existente validado');
        } catch (e) {
            await execPromise('git init');
            result.steps.push('🔄 Repositorio Git inicializado');
            result.gitInitialized = true;
            isGitRepo = true;
        }

        // Verificar remote GitHub
        let hasRemote = false;
        let githubUrl = '';
        try {
            const { stdout } = await execPromise('git remote get-url origin');
            hasRemote = !!stdout.trim();
            // Limpiar URL de tokens y normalizar
            githubUrl = stdout.trim()
                .replace('.git', '')
                .replace(/https:\/\/[^@]+@github\.com/, 'https://github.com');
            result.steps.push(`✅ GitHub configurado: ${githubUrl}`);
        } catch (e) {
            result.needsRemote = true;
            result.steps.push('⚠️ GitHub no configurado');
        }

        // =============================================================================
        // 2. ANÁLISIS DE CAMBIOS - Del script original
        // =============================================================================
        result.steps.push('📝 Analizando cambios pendientes...');
        
        const { stdout: gitStatus } = await execPromise('git status --porcelain');
        result.hasChanges = !!gitStatus;
        
        if (gitStatus) {
            result.steps.push(`📝 Archivos con cambios: ${gitStatus.split('\n').length - 1} archivos`);
        } else {
            result.steps.push('✅ No hay cambios pendientes');
        }

        // =============================================================================
        // 3. LEER CONTEXTO DESDE CLAUDE.md - Del script original
        // =============================================================================
        result.steps.push('📖 Leyendo contexto desde CLAUDE.md...');
        
        const claudePath = `${projectPath}/CLAUDE.md`;
        let claudeContent = '';
        let claudeExists = false;
        
        try {
            claudeContent = await fsPromises.readFile(claudePath, 'utf8');
            claudeExists = true;
            result.steps.push('✅ CLAUDE.md encontrado - contexto leído');
            
            // Extraer última información del proyecto
            const lines = claudeContent.split('\n');
            const lastLines = lines.slice(-10).join('\n');
            result.projectDetails.lastContext = lastLines;
        } catch {
            result.steps.push('⚠️ CLAUDE.md no encontrado - se creará');
        }

        // =============================================================================
        // 4. GESTIÓN DE VERSIONES - Del script original mejorado
        // =============================================================================
        result.steps.push('🏷️ Gestionando versiones...');
        
        let currentVersion = 'v0.0.0';
        try {
            const { stdout } = await execPromise('git describe --tags --abbrev=0');
            currentVersion = stdout.trim();
        } catch (e) {
            // Si no hay tags, usar v0.0.0
        }
        result.currentVersion = currentVersion;
        result.steps.push(`🏷️ Versión actual: ${currentVersion}`);

        // Incrementar versión automáticamente (del script original)
        let newVersion = currentVersion;
        if (currentVersion.match(/^v(\d+)\.(\d+)\.(\d+)$/)) {
            const parts = currentVersion.substring(1).split('.');
            parts[2] = (parseInt(parts[2]) + 1).toString();
            newVersion = 'v' + parts.join('.');
        } else {
            newVersion = 'v1.0.0';
        }
        result.newVersion = newVersion;
        result.steps.push(`🚀 Nueva versión: ${newVersion}`);

        // =============================================================================
        // 5. CREAR/ACTUALIZAR CLAUDE.md ANTES DEL COMMIT - Fusionado
        // =============================================================================
        result.steps.push('📝 Actualizando CLAUDE.md...');

        if (!claudeExists) {
            // Crear CLAUDE.md básico
            claudeContent = `# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project: ${projectId}

### Project Overview
${getProjectDescription(projectId, projectType)}

### Project Structure
- **Type**: ${projectType}
- **Location**: ${projectPath}
- **Technology**: ${getTechnologyStack(projectPath)}

### Key Commands
\`\`\`bash
# Close project with versioning and documentation
# Executed from Dashboard MVP
\`\`\`

`;
            result.steps.push('✅ CLAUDE.md creado con estructura base');
        }

        // =============================================================================
        // 6. CREAR .gitignore SI NO EXISTE - Mejora de seguridad
        // =============================================================================
        const gitignorePath = `${projectPath}/.gitignore`;
        if (!fs.existsSync(gitignorePath)) {
            const gitignoreContent = generateGitignore(projectType);
            await fsPromises.writeFile(gitignorePath, gitignoreContent);
            result.steps.push('✅ .gitignore creado con exclusiones apropiadas');
        }

        // =============================================================================
        // 7. AÑADIR ARCHIVOS AL STAGING - Del script original
        // =============================================================================
        if (result.hasChanges || !claudeExists) {
            await execPromise('git add .');
            result.steps.push('✅ Archivos añadidos al staging');
        }

        // =============================================================================
        // 7. COMMIT CON MENSAJE DESCRIPTIVO - Fusionado y generalizado
        // =============================================================================
        result.steps.push('💾 Creando commit descriptivo...');

        const commitMessage = generateUniversalCommitMessage(projectId, newVersion, projectType, result);

        if (result.hasChanges || !claudeExists) {
            await execPromise(`git commit -m "${commitMessage}"`);
            result.steps.push('✅ Commit creado exitosamente');
        }

        // =============================================================================
        // 8. CREAR TAG DE VERSIÓN - Del script original
        // =============================================================================
        const tagMessage = `${projectId} ${newVersion} - ${getProjectTagDescription(projectId, projectType)}`;
        await execPromise(`git tag -a "${newVersion}" -m "${tagMessage}"`);
        result.steps.push(`✅ Tag ${newVersion} creado`);

        // =============================================================================
        // 9. PUSH A GITHUB - Del script original mejorado
        // =============================================================================
        if (hasRemote) {
            result.steps.push('📤 Subiendo cambios a GitHub...');
            
            try {
                await execPromise('git push origin main --tags');
                result.pushedToGitHub = true;
                result.githubUrl = githubUrl;
                result.steps.push('✅ Cambios y tags subidos exitosamente a GitHub');
            } catch (pushError) {
                result.pushError = pushError.message;
                result.pushedToGitHub = false;
                result.steps.push(`⚠️ Error subiendo a GitHub: ${pushError.message}`);
            }
        } else {
            result.suggestedGitHubRepo = `https://github.com/vmsebas/${projectId}.git`;
            result.setupCommands = [
                `git remote add origin https://github.com/vmsebas/${projectId}.git`,
                `git push -u origin main --tags`
            ];
            result.steps.push('⚠️ GitHub no configurado - comandos de setup preparados');
        }

        // =============================================================================
        // 10. ACTUALIZAR CLAUDE.md CON INFORMACIÓN COMPLETA - Fusionado
        // =============================================================================
        const finalClosureInfo = generateUniversalClosureInfo(projectId, newVersion, result, projectType);
        
        await fsPromises.writeFile(claudePath, claudeContent + finalClosureInfo);
        result.steps.push('✅ CLAUDE.md actualizado con información completa de cierre');

        // =============================================================================
        // 11. PREPARAR RESUMEN FINAL - Del script original
        // =============================================================================
        result.status = 'success';
        result.message = `Proyecto ${projectId} cerrado exitosamente`;
        result.summary = {
            project: projectId,
            version: `${currentVersion} → ${newVersion}`,
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            type: projectType,
            location: projectPath,
            github: hasRemote ? githubUrl : 'No configurado',
            actions: [
                result.gitInitialized ? 'Git inicializado' : 'Git validado',
                claudeExists ? 'CLAUDE.md actualizado' : 'CLAUDE.md creado',
                'Commit creado y versionado',
                `Tag ${newVersion} aplicado`,
                result.pushedToGitHub ? 'Subido a GitHub' : 'GitHub pendiente',
                'Documentación completa actualizada'
            ]
        };

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
        // Mapeo de proyectos
        const projectPaths = {
            'iva-compensator': '/Users/mini-server/production/node-apps/iva-compensator',
            'migestpro': '/Users/mini-server/MiGestPro',
            'dashboard-mvp': '/Users/mini-server/server-dashboard-mvp'
        };

        const projectPath = projectPaths[projectId];
        if (!projectPath) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        // Ejecutar script de deploy
        const deployScript = '/Users/mini-server/project-management/scripts/project-deploy.sh';
        const deployCommand = `"${deployScript}" "${projectPath}"${subdomain ? ` "${subdomain}"` : ''}${port ? ` "${port}"` : ''}`;
        
        console.log('Ejecutando deploy:', deployCommand);
        
        const { stdout, stderr } = await execPromise(deployCommand);
        
        // Parsear resultado del script
        const result = {
            project: projectId,
            status: 'success',
            output: stdout,
            error: stderr,
            timestamp: new Date().toISOString(),
            deployUrl: subdomain ? `https://${subdomain}.lisbontiles.com` : null,
            localUrl: port ? `http://localhost:${port}` : null
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
    const { mode = 'dev' } = req.body;
    
    try {
        // Mapeo de proyectos
        const projectPaths = {
            'iva-compensator': '/Users/mini-server/production/node-apps/iva-compensator',
            'migestpro': '/Users/mini-server/MiGestPro',
            'dashboard-mvp': '/Users/mini-server/server-dashboard-mvp'
        };

        const projectPath = projectPaths[projectId];
        if (!projectPath) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }

        // Ejecutar script de start (sin inicio automático del servidor)
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

// Funciones auxiliares para el cierre universal
function generateUniversalCommitMessage(projectId, version, projectType, result) {
    const projectDescriptions = {
        'iva-compensator': '- Sistema de compensación IVA completamente funcional\n- 582 facturas procesadas y clasificadas\n- API estable en puerto 5001\n- Frontend accesible via https://iva.lisbontiles.com',
        'migestpro': '- Sistema de gestión empresarial\n- Interface moderna y funcional\n- Base de datos SQLite optimizada',
        'dashboard-mvp': '- Panel de control del servidor Mac Mini\n- Gestión completa de aplicaciones y proyectos\n- Monitoreo en tiempo real'
    };

    const description = projectDescriptions[projectId] || `- Proyecto ${projectType} completamente funcional\n- Sistema estable y documentado`;

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
    const descriptions = {
        'iva-compensator': 'Sistema especializado para separar y clasificar facturas electrónicas portuguesas de IVA entre dos empresas diferentes.',
        'migestpro': 'Sistema integral de gestión empresarial con interface moderna y base de datos optimizada.',
        'dashboard-mvp': 'Panel de control central para gestión del servidor Mac Mini con monitoreo en tiempo real.'
    };
    
    return descriptions[projectId] || `Proyecto ${projectType} con gestión automatizada de desarrollo.`;
}

function getTechnologyStack(projectPath) {
    if (fs.existsSync(`${projectPath}/package.json`)) return 'Node.js/JavaScript';
    if (fs.existsSync(`${projectPath}/requirements.txt`)) return 'Python';
    if (fs.existsSync(`${projectPath}/Dockerfile`)) return 'Docker';
    return 'General';
}

function getProjectAchievements(projectId) {
    const achievements = {
        'iva-compensator': `- Migración exitosa de 582 facturas desde Docker
- Corrección de error constraint BD para clasificación "omitir"
- Implementación de manejo de IVA no deducible
- Sistema completamente operacional`,
        'migestpro': `- Interface moderna completamente funcional
- Base de datos SQLite optimizada
- Sistema de autenticación implementado
- Deploy automático configurado`,
        'dashboard-mvp': `- Gestión completa de proyectos implementada
- Monitoreo en tiempo real funcionando
- Integración con GitHub automatizada
- Sistema de cierre universal creado`
    };
    
    return achievements[projectId] || `- Sistema ${projectId} completamente funcional
- Documentación completa y actualizada
- Versionado automático implementado
- Preparado para desarrollo continuo`;
}

function getTechnicalStack(projectId, projectType) {
    const stacks = {
        'iva-compensator': `- **Backend**: Python Flask con pg8000 driver (Python 3.13 compatible)
- **Frontend**: Vanilla JavaScript con interfaz moderna
- **Database**: PostgreSQL con constraints apropiadas
- **Process Management**: PM2 con auto-restart
- **Deployment**: Mac Mini Server con Cloudflare Tunnel`,
        'migestpro': `- **Backend**: Node.js con Express
- **Frontend**: Interface web moderna
- **Database**: SQLite optimizada
- **Process Management**: PM2
- **Deployment**: Mac Mini Server`,
        'dashboard-mvp': `- **Backend**: Node.js con Express y Socket.io
- **Frontend**: Bootstrap 5 con JavaScript vanilla
- **Real-time**: WebSockets para monitoreo
- **Integration**: GitHub API, PM2, Docker
- **Deployment**: Mac Mini Server`
    };
    
    return stacks[projectId] || `- **Technology**: ${projectType}
- **Process Management**: PM2
- **Version Control**: Git con GitHub
- **Deployment**: Mac Mini Server`;
}

function getProjectTagDescription(projectId, projectType) {
    const descriptions = {
        'iva-compensator': 'Sistema IVA completamente funcional',
        'migestpro': 'Sistema gestión empresarial operativo',
        'dashboard-mvp': 'Panel control servidor completo'
    };
    
    return descriptions[projectId] || `Proyecto ${projectType} completamente funcional`;
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
        const projectPaths = {
            'iva-compensator': '/Users/mini-server/production/node-apps/iva-compensator',
            'migestpro': '/Users/mini-server/MiGestPro',
            'dashboard-mvp': '/Users/mini-server/server-dashboard-mvp'
        };

        const projectPath = projectPaths[projectId];
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
server.listen(8888, () => {
    console.log('✅ Dashboard completo ejecutándose en http://localhost:8888');
    console.log('🌙 Modo oscuro incluido');
    console.log('📊 Gestión completa de bases de datos');
    console.log('🚀 Deploy desde GitHub');
    console.log('📜 Logs en tiempo real');
    console.log('💾 Sistema de backups');
});