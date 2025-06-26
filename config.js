// config.js - Configuración centralizada con validación
// Centraliza todas las configuraciones para mejor mantenimiento y seguridad

require('dotenv').config();

const config = {
    // Configuración del servidor
    server: {
        port: process.env.PORT || 8888,
        host: process.env.HOST || 'localhost',
        env: process.env.NODE_ENV || 'development'
    },
    
    // Autenticación
    auth: {
        users: {
            'admin': process.env.ADMIN_PASSWORD || 'dashboard2025',
            'mini-server': process.env.USER_PASSWORD || 'miniserver123'
        },
        realm: 'Mac Mini Server Dashboard',
        sessionTimeout: 24 * 60 * 60 * 1000 // 24 horas
    },
    
    // Cloudflare
    cloudflare: {
        apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
        email: process.env.CLOUDFLARE_EMAIL || '',
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID || ''
    },
    
    // Rutas permitidas para proyectos
    paths: {
        allowed: [
            '/Users/mini-server/apps',
            '/Users/mini-server/production',
            '/Users/mini-server/MiGestPro',
            '/Users/mini-server/docker-apps',
            '/Users/mini-server/project-management'
        ],
        serverConfig: '/Users/mini-server/server-config',
        projectManagement: '/Users/mini-server/project-management'
    },
    
    // Puertos reservados del sistema
    ports: {
        reserved: [22, 80, 443, 3306, 5432, 6379, 8080, 8888],
        minPort: 3000,
        maxPort: 9999
    },
    
    // Configuración de logs
    logging: {
        dir: './logs',
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 7, // Mantener 7 días
        level: process.env.LOG_LEVEL || 'info'
    },
    
    // Rate limiting
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutos
        maxRequests: 100,
        // Endpoints más restrictivos
        strict: {
            windowMs: 5 * 60 * 1000, // 5 minutos
            maxRequests: 10
        }
    },
    
    // Timeouts
    timeouts: {
        command: 30000, // 30 segundos para comandos
        longCommand: 120000, // 2 minutos para comandos largos
        request: 60000 // 1 minuto para requests
    },
    
    // Seguridad
    security: {
        // Headers de seguridad
        headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' cdn.jsdelivr.net; font-src 'self' cdn.jsdelivr.net; img-src 'self' data: https:;"
        },
        
        // Comandos permitidos
        allowedCommands: {
            'pm2': ['list', 'logs', 'restart', 'stop', 'start', 'delete', 'jlist'],
            'docker': ['ps', 'logs', 'restart', 'stop', 'start', 'rm', 'inspect'],
            'git': ['status', 'log', 'diff', 'add', 'commit', 'push', 'pull'],
            'npm': ['install', 'run', 'list'],
            'systemctl': ['status', 'restart']
        }
    },
    
    // GitHub
    github: {
        token: process.env.GITHUB_TOKEN || '',
        username: process.env.GITHUB_USERNAME || 'vmsebas'
    },
    
    // Base de datos
    database: {
        postgres: {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            maxConnections: 10
        },
        mysql: {
            host: process.env.MYSQL_HOST || 'localhost',
            port: process.env.MYSQL_PORT || 3306,
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            maxConnections: 10
        }
    },
    
    // Socket.io
    socketio: {
        cors: {
            origin: process.env.NODE_ENV === 'production' 
                ? ['https://server-dashboard-mvp.lisbontiles.com']
                : '*',
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    }
};

// Validar configuración crítica
function validateConfig() {
    const errors = [];
    
    // Validar autenticación
    if (!config.auth.users.admin || config.auth.users.admin === 'dashboard2025') {
        errors.push('⚠️  ADVERTENCIA: Contraseña de admin por defecto. Cambia ADMIN_PASSWORD en .env');
    }
    
    // Validar Cloudflare
    if (!config.cloudflare.apiToken || config.cloudflare.apiToken === 'tu-token-aqui') {
        errors.push('⚠️  ADVERTENCIA: Token de Cloudflare no configurado');
    }
    
    // Validar puerto
    if (config.ports.reserved.includes(config.server.port)) {
        errors.push('❌ ERROR: Puerto configurado está en la lista de reservados');
    }
    
    // Validar rutas
    config.paths.allowed.forEach(path => {
        if (!require('fs').existsSync(path)) {
            errors.push(`⚠️  ADVERTENCIA: Ruta no existe: ${path}`);
        }
    });
    
    // Mostrar errores/advertencias
    if (errors.length > 0) {
        console.log('\n=== Validación de Configuración ===');
        errors.forEach(error => console.log(error));
        console.log('===================================\n');
    }
    
    return errors.filter(e => e.startsWith('❌')).length === 0;
}

// Función helper para verificar si estamos en producción
config.isProduction = () => config.server.env === 'production';

// Función helper para obtener configuración segura (sin secretos)
config.getSafeConfig = () => {
    const safe = JSON.parse(JSON.stringify(config));
    
    // Remover información sensible
    delete safe.auth.users;
    delete safe.cloudflare.apiToken;
    delete safe.github.token;
    delete safe.database.postgres.password;
    delete safe.database.mysql.password;
    
    return safe;
};

// Validar al cargar
if (!validateConfig() && config.isProduction()) {
    console.error('❌ Configuración inválida para producción');
    process.exit(1);
}

module.exports = config;