// security.js - Módulo de seguridad para validación y sanitización
// Añade capas de seguridad sin cambiar la lógica existente

const path = require('path');

// Sanitización de comandos shell
function sanitizeShellArg(arg) {
    if (typeof arg !== 'string') return '';
    
    // Eliminar caracteres peligrosos para shell, incluyendo espacios
    // Permite solo: letras, números, guiones, puntos, barras y guiones bajos
    return arg.replace(/[^a-zA-Z0-9._\-\/]/g, '');
}

// Validar y sanitizar nombres de aplicaciones
function sanitizeAppName(appName) {
    if (!appName || typeof appName !== 'string') {
        throw new Error('Nombre de aplicación inválido');
    }
    
    // Solo permitir caracteres alfanuméricos, guiones y guiones bajos
    const sanitized = appName.replace(/[^a-zA-Z0-9\-_]/g, '');
    
    if (sanitized.length === 0 || sanitized.length > 100) {
        throw new Error('Nombre de aplicación inválido');
    }
    
    return sanitized;
}

// Validar y sanitizar rutas de proyectos
function sanitizeProjectPath(projectPath) {
    if (!projectPath || typeof projectPath !== 'string') {
        throw new Error('Ruta de proyecto inválida');
    }
    
    // Resolver ruta absoluta y verificar que existe
    const resolved = path.resolve(projectPath);
    
    // Verificar que la ruta está dentro del directorio permitido
    const allowedPaths = [
        '/Users/mini-server/apps',
        '/Users/mini-server/production',
        '/Users/mini-server/MiGestPro',
        '/Users/mini-server/docker-apps'
    ];
    
    const isAllowed = allowedPaths.some(allowed => resolved.startsWith(allowed));
    
    if (!isAllowed) {
        throw new Error('Ruta de proyecto no permitida');
    }
    
    return resolved;
}

// Sanitizar ID de proyecto
function sanitizeProjectId(projectId) {
    if (!projectId || typeof projectId !== 'string') {
        throw new Error('ID de proyecto inválido');
    }
    
    // Solo permitir caracteres alfanuméricos y guiones
    const sanitized = projectId.replace(/[^a-zA-Z0-9\-]/g, '');
    
    if (sanitized.length === 0 || sanitized.length > 50) {
        throw new Error('ID de proyecto inválido');
    }
    
    return sanitized;
}

// Validar puerto
function validatePort(port) {
    const portNum = parseInt(port);
    
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error('Puerto inválido');
    }
    
    // Puertos reservados que no deberían usarse
    const reservedPorts = [22, 80, 443, 3306, 5432, 6379, 8080];
    if (reservedPorts.includes(portNum)) {
        throw new Error('Puerto reservado del sistema');
    }
    
    return portNum;
}

// Sanitizar dominio/subdominio
function sanitizeDomain(domain) {
    if (!domain || typeof domain !== 'string') {
        throw new Error('Dominio inválido');
    }
    
    // Validar formato de dominio
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?$/;
    
    const parts = domain.split('.');
    const isValid = parts.every(part => domainRegex.test(part));
    
    if (!isValid || parts.length === 0) {
        throw new Error('Formato de dominio inválido');
    }
    
    return domain.toLowerCase();
}

// Sanitizar consultas SQL básicas (nombres de tablas/bases de datos)
function sanitizeSQLIdentifier(identifier) {
    if (!identifier || typeof identifier !== 'string') {
        throw new Error('Identificador SQL inválido');
    }
    
    // Solo permitir caracteres válidos para identificadores SQL
    const sanitized = identifier.replace(/[^a-zA-Z0-9_]/g, '');
    
    if (sanitized.length === 0 || sanitized.length > 64) {
        throw new Error('Identificador SQL inválido');
    }
    
    return sanitized;
}

// Middleware para validar parámetros de ruta
function validateRouteParams(validations) {
    return (req, res, next) => {
        try {
            for (const [param, validator] of Object.entries(validations)) {
                if (req.params[param]) {
                    req.params[param] = validator(req.params[param]);
                }
            }
            next();
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };
}

// Middleware para validar body
function validateBody(validations) {
    return (req, res, next) => {
        try {
            for (const [field, validator] of Object.entries(validations)) {
                if (req.body[field] !== undefined) {
                    req.body[field] = validator(req.body[field]);
                }
            }
            next();
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };
}

// Wrapper seguro para exec
async function safeExec(command, args = [], options = {}) {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    // Construir comando con argumentos sanitizados
    const sanitizedArgs = args.map(arg => `'${arg.replace(/'/g, "'\\''")}'`);
    const fullCommand = `${command} ${sanitizedArgs.join(' ')}`;
    
    // Timeout por defecto de 30 segundos
    const execOptions = {
        timeout: 30000,
        ...options
    };
    
    try {
        const result = await execPromise(fullCommand, execOptions);
        return result;
    } catch (error) {
        // No exponer detalles del sistema en errores
        if (error.code === 'ENOENT') {
            throw new Error('Comando no encontrado');
        } else if (error.signal === 'SIGTERM') {
            throw new Error('Comando excedió el tiempo límite');
        } else {
            throw new Error('Error al ejecutar comando');
        }
    }
}

// Crear comando seguro con validación
function createSafeCommand(baseCommand, args = {}) {
    const safeCommands = {
        'pm2': ['list', 'logs', 'restart', 'stop', 'start', 'delete'],
        'docker': ['ps', 'logs', 'restart', 'stop', 'start', 'rm'],
        'git': ['status', 'log', 'diff', 'add', 'commit', 'push', 'pull'],
        'npm': ['install', 'run', 'list'],
        'systemctl': ['status', 'restart']
    };
    
    if (!safeCommands[baseCommand]) {
        throw new Error('Comando no permitido');
    }
    
    const action = args.action;
    if (action && !safeCommands[baseCommand].includes(action)) {
        throw new Error('Acción no permitida para este comando');
    }
    
    return { baseCommand, ...args };
}

// Rate limiting simple
const rateLimiters = new Map();

function rateLimit(key, maxRequests = 10, windowMs = 60000) {
    const now = Date.now();
    
    if (!rateLimiters.has(key)) {
        rateLimiters.set(key, { count: 1, resetTime: now + windowMs });
        return true;
    }
    
    const limiter = rateLimiters.get(key);
    
    if (now > limiter.resetTime) {
        limiter.count = 1;
        limiter.resetTime = now + windowMs;
        return true;
    }
    
    if (limiter.count >= maxRequests) {
        return false;
    }
    
    limiter.count++;
    return true;
}

// Limpiar rate limiters antiguos cada 5 minutos
setInterval(() => {
    const now = Date.now();
    for (const [key, limiter] of rateLimiters.entries()) {
        if (now > limiter.resetTime + 300000) { // 5 minutos después del reset
            rateLimiters.delete(key);
        }
    }
}, 300000);

module.exports = {
    sanitizeShellArg,
    sanitizeAppName,
    sanitizeProjectPath,
    sanitizeProjectId,
    validatePort,
    sanitizeDomain,
    sanitizeSQLIdentifier,
    validateRouteParams,
    validateBody,
    safeExec,
    createSafeCommand,
    rateLimit
};