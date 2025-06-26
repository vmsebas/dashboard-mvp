// server-patch.js - Parche de seguridad para server.js
// Este archivo contiene las modificaciones mínimas necesarias para añadir seguridad
// sin romper la funcionalidad existente

// Para aplicar estos cambios, necesitarás actualizar server.js gradualmente
// Aquí están las modificaciones esenciales por sección:

// 1. Al inicio del archivo, después de los requires existentes, añadir:
const security = require('./security');
const logger = require('./logger');
const config = require('./config');

// 2. Reemplazar la configuración de autenticación (líneas 26-36) con:
const authMiddleware = basicAuth({
    users: config.auth.users,
    challenge: true,
    realm: config.auth.realm,
    unauthorizedResponse: (req) => {
        logger.warn('Intento de acceso no autorizado:', { ip: req.ip, url: req.url });
        return 'Acceso denegado al Dashboard del Servidor';
    }
});

// 3. Añadir después del authMiddleware:
// Middleware de logging
app.use(logger.middleware());

// Middleware de seguridad headers
app.use((req, res, next) => {
    Object.entries(config.security.headers).forEach(([header, value]) => {
        res.setHeader(header, value);
    });
    next();
});

// 4. Para la ruta de logs (líneas 66-100), actualizar streamLogs:
function streamLogs(socket, source, app) {
    try {
        // Validar source
        const validSources = ['system', 'nginx', 'pm2', 'docker'];
        if (!validSources.includes(source)) {
            socket.emit('log-error', { error: 'Fuente de logs inválida' });
            return;
        }
        
        // Sanitizar app name si existe
        if (app) {
            app = security.sanitizeAppName(app);
        }
        
        let command;
        switch(source) {
            case 'system':
                command = 'tail -f /var/log/system.log';
                break;
            case 'nginx':
                command = 'tail -f /usr/local/var/log/nginx/error.log';
                break;
            case 'pm2':
                command = app ? \`pm2 logs '\${app}' --lines 100\` : 'pm2 logs --lines 100';
                break;
            case 'docker':
                command = app ? \`docker logs -f '\${app}'\` : 'docker logs -f $(docker ps -q | head -1)';
                break;
        }
        
        const logProcess = spawn('sh', ['-c', command], {
            timeout: config.timeouts.longCommand
        });
        
        logProcess.stdout.on('data', (data) => {
            socket.emit('log-data', { line: data.toString() });
        });
        
        logProcess.stderr.on('data', (data) => {
            socket.emit('log-data', { line: data.toString() });
        });
        
        logProcess.on('error', (error) => {
            logger.error('Error en proceso de logs:', error);
            socket.emit('log-error', { error: 'Error al obtener logs' });
        });
        
        socket.on('disconnect', () => {
            logProcess.kill();
        });
    } catch (error) {
        logger.error('Error en streamLogs:', error);
        socket.emit('log-error', { error: 'Error al iniciar logs' });
    }
}

// 5. Para las rutas de proyectos más peligrosas, aquí están las versiones seguras:

// Ruta de cerrar proyecto (reemplazar líneas ~850-950)
apiRouter.post('/projects/:id/close', 
    security.validateRouteParams({ id: security.sanitizeProjectId }),
    async (req, res) => {
        const projectId = req.params.id;
        
        try {
            const projectPath = await getProjectPath(projectId);
            if (!projectPath) {
                return res.status(404).json({ error: 'Proyecto no encontrado' });
            }
            
            // Validar que la ruta es segura
            const safePath = security.sanitizeProjectPath(projectPath);
            
            logger.event('project.close', { projectId, path: safePath, user: req.auth.user });
            
            // Usar el script universal de cierre con argumentos seguros
            const closeScript = '/Users/mini-server/project-management/scripts/project-close.sh';
            const result = await security.safeExec(closeScript, [safePath], {
                timeout: config.timeouts.longCommand
            });
            
            res.json({
                success: true,
                project: projectId,
                output: result.stdout
            });
            
        } catch (error) {
            logger.error('Error cerrando proyecto:', error);
            res.status(500).json({ 
                error: error.message,
                project: projectId
            });
        }
    }
);

// Ruta de eliminar proyecto (reemplazar líneas ~1850-1900)
apiRouter.delete('/projects/:id', 
    security.validateRouteParams({ id: security.sanitizeProjectId }),
    async (req, res) => {
        const projectId = req.params.id;
        
        // Rate limiting para operaciones destructivas
        if (!security.rateLimit(\`delete-project-\${req.ip}\`, 5, 3600000)) {
            return res.status(429).json({ error: 'Demasiados intentos de eliminación' });
        }
        
        try {
            const projectPath = await getProjectPath(projectId);
            if (!projectPath) {
                return res.status(404).json({ error: 'Proyecto no encontrado' });
            }
            
            const safePath = security.sanitizeProjectPath(projectPath);
            
            logger.event('project.delete', { projectId, path: safePath, user: req.auth.user });
            
            // Primero detener en PM2 si está corriendo
            try {
                await security.safeExec('pm2', ['delete', projectId]);
            } catch (e) {
                // Ignorar si no está en PM2
            }
            
            // Hacer backup antes de eliminar
            const backupPath = \`/Users/mini-server/backups/deleted-projects/\${projectId}-\${Date.now()}\`;
            await security.safeExec('mkdir', ['-p', path.dirname(backupPath)]);
            await security.safeExec('cp', ['-r', safePath, backupPath]);
            
            // Eliminar proyecto
            await security.safeExec('rm', ['-rf', safePath]);
            
            logger.info(\`Proyecto eliminado: \${projectId}, backup en: \${backupPath}\`);
            
            res.json({
                success: true,
                message: 'Proyecto eliminado correctamente',
                backup: backupPath
            });
            
        } catch (error) {
            logger.error('Error eliminando proyecto:', error);
            res.status(500).json({ 
                error: error.message,
                project: projectId
            });
        }
    }
);

// 6. Para las consultas de base de datos (líneas ~1650-1750), versión segura:
apiRouter.get('/databases/:db/:table/data',
    security.validateRouteParams({ 
        db: security.sanitizeSQLIdentifier,
        table: security.sanitizeSQLIdentifier 
    }),
    async (req, res) => {
        const { db, table } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
        const offset = parseInt(req.query.offset) || 0;
        
        try {
            // Usar placeholders seguros para PostgreSQL
            const query = \`
                SELECT * FROM "\${table}" 
                LIMIT $1 OFFSET $2
            \`;
            
            const { stdout } = await security.safeExec('psql', [
                '-h', 'localhost',
                '-U', 'postgres',
                '-d', db,
                '-c', query,
                '--csv',
                '--no-align',
                '--tuples-only'
            ], {
                env: { ...process.env, PGPASSWORD: config.database.postgres.password }
            });
            
            // Parsear CSV de forma segura
            const rows = stdout.trim().split('\\n').filter(row => row);
            const data = rows.map(row => {
                // Parsear CSV básico
                return row.split(',').map(cell => cell.trim());
            });
            
            res.json({ data, total: data.length });
            
        } catch (error) {
            logger.error('Error consultando base de datos:', error);
            res.status(500).json({ error: 'Error al consultar datos' });
        }
    }
);

// 7. Para el manejo global de errores, añadir al final antes de server.listen:
// Middleware de manejo de errores
app.use((err, req, res, next) => {
    logger.error('Error no manejado:', err);
    
    // No exponer detalles en producción
    const message = config.isProduction() 
        ? 'Error interno del servidor' 
        : err.message;
    
    res.status(err.status || 500).json({
        error: message,
        requestId: req.id || 'unknown'
    });
});

// 8. Actualizar el server.listen al final:
const PORT = config.server.port;
server.listen(PORT, () => {
    logger.info(\`Servidor iniciado en puerto \${PORT}\`);
    logger.info(\`Ambiente: \${config.server.env}\`);
    logger.info(\`Autenticación: Habilitada\`);
    
    if (!config.isProduction()) {
        logger.info(\`URL local: http://localhost:\${PORT}\`);
    }
});