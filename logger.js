// logger.js - Sistema de logging mejorado
// Compatible con console.log existente pero añade más funcionalidades

const fs = require('fs');
const path = require('path');
const util = require('util');

class Logger {
    constructor(options = {}) {
        this.logDir = options.logDir || path.join(__dirname, 'logs');
        this.logToFile = options.logToFile !== false;
        this.logToConsole = options.logToConsole !== false;
        
        // Crear directorio de logs si no existe
        if (this.logToFile) {
            try {
                if (!fs.existsSync(this.logDir)) {
                    fs.mkdirSync(this.logDir, { recursive: true });
                }
            } catch (error) {
                this.logToFile = false;
                console.error('No se pudo crear directorio de logs:', error.message);
            }
        }
        
        // Mantener referencia a console original
        this.originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info
        };
    }
    
    // Formatear timestamp
    getTimestamp() {
        return new Date().toISOString();
    }
    
    // Formatear mensaje con contexto
    formatMessage(level, message, ...args) {
        const timestamp = this.getTimestamp();
        const formattedArgs = args.map(arg => 
            typeof arg === 'object' ? util.inspect(arg, { depth: 3 }) : arg
        ).join(' ');
        
        return {
            timestamp,
            level,
            message: message + (formattedArgs ? ' ' + formattedArgs : ''),
            raw: { message, args }
        };
    }
    
    // Escribir a archivo
    writeToFile(logEntry) {
        if (!this.logToFile) return;
        
        try {
            const date = new Date().toISOString().split('T')[0];
            const logFile = path.join(this.logDir, `app-${date}.log`);
            const logLine = JSON.stringify(logEntry) + '\n';
            
            fs.appendFileSync(logFile, logLine);
            
            // Rotar logs si el archivo es muy grande (>10MB)
            const stats = fs.statSync(logFile);
            if (stats.size > 10 * 1024 * 1024) {
                this.rotateLog(logFile);
            }
        } catch (error) {
            // Silenciar errores de escritura para no interferir
        }
    }
    
    // Rotar archivo de log
    rotateLog(logFile) {
        try {
            const timestamp = Date.now();
            const rotatedFile = logFile.replace('.log', `-${timestamp}.log`);
            fs.renameSync(logFile, rotatedFile);
            
            // Limpiar logs antiguos (más de 7 días)
            this.cleanOldLogs();
        } catch (error) {
            // Silenciar errores
        }
    }
    
    // Limpiar logs antiguos
    cleanOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir);
            const now = Date.now();
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 días
            
            files.forEach(file => {
                if (file.endsWith('.log') && file.includes('-')) {
                    const filePath = path.join(this.logDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (now - stats.mtime.getTime() > maxAge) {
                        fs.unlinkSync(filePath);
                    }
                }
            });
        } catch (error) {
            // Silenciar errores
        }
    }
    
    // Métodos de logging
    log(message, ...args) {
        const logEntry = this.formatMessage('info', message, ...args);
        this.writeToFile(logEntry);
        
        if (this.logToConsole) {
            this.originalConsole.log(message, ...args);
        }
    }
    
    info(message, ...args) {
        const logEntry = this.formatMessage('info', message, ...args);
        this.writeToFile(logEntry);
        
        if (this.logToConsole) {
            this.originalConsole.info(message, ...args);
        }
    }
    
    warn(message, ...args) {
        const logEntry = this.formatMessage('warn', message, ...args);
        this.writeToFile(logEntry);
        
        if (this.logToConsole) {
            this.originalConsole.warn(message, ...args);
        }
    }
    
    error(message, ...args) {
        const logEntry = this.formatMessage('error', message, ...args);
        
        // Para errores, incluir stack trace si está disponible
        if (args[0] instanceof Error) {
            logEntry.stack = args[0].stack;
        }
        
        this.writeToFile(logEntry);
        
        if (this.logToConsole) {
            this.originalConsole.error(message, ...args);
        }
    }
    
    // Log de eventos importantes
    event(eventName, data = {}) {
        const logEntry = {
            timestamp: this.getTimestamp(),
            level: 'event',
            event: eventName,
            data: data
        };
        
        this.writeToFile(logEntry);
        
        if (this.logToConsole) {
            this.originalConsole.log(`[EVENT] ${eventName}`, data);
        }
    }
    
    // Log de métricas
    metric(metricName, value, tags = {}) {
        const logEntry = {
            timestamp: this.getTimestamp(),
            level: 'metric',
            metric: metricName,
            value: value,
            tags: tags
        };
        
        this.writeToFile(logEntry);
    }
    
    // Log de requests HTTP
    request(req, res, duration) {
        const logEntry = {
            timestamp: this.getTimestamp(),
            level: 'request',
            method: req.method,
            url: req.url,
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            statusCode: res.statusCode,
            duration: duration,
            user: req.auth?.user
        };
        
        this.writeToFile(logEntry);
        
        if (this.logToConsole) {
            const status = res.statusCode >= 400 ? '❌' : '✅';
            this.originalConsole.log(
                `${status} ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`
            );
        }
    }
    
    // Middleware para Express
    middleware() {
        return (req, res, next) => {
            const start = Date.now();
            
            // Interceptar el final de la respuesta
            const originalEnd = res.end;
            res.end = (...args) => {
                res.end = originalEnd;
                res.end(...args);
                
                const duration = Date.now() - start;
                this.request(req, res, duration);
            };
            
            next();
        };
    }
    
    // Reemplazar console global (opcional)
    replaceConsole() {
        console.log = this.log.bind(this);
        console.info = this.info.bind(this);
        console.warn = this.warn.bind(this);
        console.error = this.error.bind(this);
    }
    
    // Restaurar console original
    restoreConsole() {
        console.log = this.originalConsole.log;
        console.info = this.originalConsole.info;
        console.warn = this.originalConsole.warn;
        console.error = this.originalConsole.error;
    }
    
    // Obtener logs recientes
    async getRecentLogs(lines = 100, level = null) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const logFile = path.join(this.logDir, `app-${date}.log`);
            
            if (!fs.existsSync(logFile)) {
                return [];
            }
            
            const content = fs.readFileSync(logFile, 'utf8');
            const logLines = content.trim().split('\n');
            
            let logs = logLines
                .slice(-lines)
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(log => log !== null);
            
            if (level) {
                logs = logs.filter(log => log.level === level);
            }
            
            return logs;
        } catch (error) {
            return [];
        }
    }
}

// Crear instancia por defecto
const logger = new Logger({
    logToFile: true,
    logToConsole: true
});

// Capturar errores no manejados
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    // No cerrar el proceso para mantener compatibilidad
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
});

// Exportar logger y clase
module.exports = logger;
module.exports.Logger = Logger;