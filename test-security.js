// test-security.js - Pruebas básicas de seguridad y funcionalidad
// Ejecutar con: node test-security.js

const security = require('./security');
const logger = require('./logger');
const config = require('./config');

console.log('🧪 Iniciando pruebas de seguridad y funcionalidad...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passed++;
    } catch (error) {
        console.log(`❌ ${name}: ${error.message}`);
        failed++;
    }
}

// Pruebas de sanitización
console.log('=== Pruebas de Sanitización ===');

test('Sanitizar nombre de aplicación válido', () => {
    const result = security.sanitizeAppName('my-app-123');
    if (result !== 'my-app-123') throw new Error(`Esperado: my-app-123, Obtenido: ${result}`);
});

test('Sanitizar nombre de aplicación con caracteres peligrosos', () => {
    const result = security.sanitizeAppName('app; rm -rf /');
    if (result !== 'apprmrf') throw new Error(`Caracteres peligrosos no eliminados: ${result}`);
});

test('Rechazar nombre de aplicación vacío', () => {
    try {
        security.sanitizeAppName('');
        throw new Error('Debería rechazar nombre vacío');
    } catch (e) {
        if (!e.message.includes('inválido')) throw e;
    }
});

test('Sanitizar ID de proyecto', () => {
    const result = security.sanitizeProjectId('project-123');
    if (result !== 'project-123') throw new Error(`Esperado: project-123, Obtenido: ${result}`);
});

test('Sanitizar ruta de proyecto válida', () => {
    const result = security.sanitizeProjectPath('/Users/mini-server/apps/test');
    if (!result.includes('/Users/mini-server/apps/test')) throw new Error('Ruta no validada correctamente');
});

test('Rechazar ruta de proyecto fuera de directorios permitidos', () => {
    try {
        security.sanitizeProjectPath('/etc/passwd');
        throw new Error('Debería rechazar ruta no permitida');
    } catch (e) {
        if (!e.message.includes('no permitida')) throw e;
    }
});

test('Validar puerto válido', () => {
    const result = security.validatePort(3000);
    if (result !== 3000) throw new Error('Puerto válido rechazado');
});

test('Rechazar puerto reservado', () => {
    try {
        security.validatePort(80);
        throw new Error('Debería rechazar puerto reservado');
    } catch (e) {
        if (!e.message.includes('reservado')) throw e;
    }
});

test('Sanitizar dominio válido', () => {
    const result = security.sanitizeDomain('sub.example.com');
    if (result !== 'sub.example.com') throw new Error('Dominio válido modificado');
});

test('Sanitizar identificador SQL', () => {
    const result = security.sanitizeSQLIdentifier('user_table');
    if (result !== 'user_table') throw new Error('Identificador SQL válido modificado');
});

test('Rechazar identificador SQL con caracteres peligrosos', () => {
    const result = security.sanitizeSQLIdentifier('table; DROP TABLE users;--');
    if (result !== 'tableDROPTABLEusers') throw new Error('SQL injection no prevenido');
});

// Pruebas de rate limiting
console.log('\n=== Pruebas de Rate Limiting ===');

test('Rate limiting permite primeras solicitudes', () => {
    const key = 'test-' + Date.now();
    for (let i = 0; i < 5; i++) {
        if (!security.rateLimit(key, 5, 1000)) {
            throw new Error(`Solicitud ${i+1} rechazada incorrectamente`);
        }
    }
});

test('Rate limiting bloquea después del límite', () => {
    const key = 'test-limit-' + Date.now();
    for (let i = 0; i < 3; i++) {
        security.rateLimit(key, 3, 1000);
    }
    if (security.rateLimit(key, 3, 1000)) {
        throw new Error('Rate limiting no funcionó');
    }
});

// Pruebas de logging
console.log('\n=== Pruebas de Logging ===');

test('Logger puede escribir diferentes niveles', () => {
    logger.info('Test info');
    logger.warn('Test warning');
    logger.error('Test error');
    logger.event('test.event', { data: 'test' });
});

test('Logger maneja objetos complejos', () => {
    logger.info('Objeto complejo:', { 
        array: [1, 2, 3], 
        nested: { key: 'value' },
        date: new Date()
    });
});

// Pruebas de configuración
console.log('\n=== Pruebas de Configuración ===');

test('Configuración carga valores por defecto', () => {
    if (config.server.port !== 8888) throw new Error('Puerto por defecto incorrecto');
    if (!config.paths.allowed.length) throw new Error('Rutas permitidas vacías');
});

test('Configuración detecta ambiente', () => {
    if (typeof config.isProduction() !== 'boolean') {
        throw new Error('isProduction no retorna booleano');
    }
});

test('Configuración segura no expone secretos', () => {
    const safe = config.getSafeConfig();
    if (safe.auth.users) throw new Error('Contraseñas expuestas en config segura');
    if (safe.cloudflare.apiToken) throw new Error('Token API expuesto en config segura');
});

// Prueba de comando seguro
console.log('\n=== Pruebas de Comandos Seguros ===');

test('Crear comando seguro válido', () => {
    const cmd = security.createSafeCommand('pm2', { action: 'list' });
    if (cmd.baseCommand !== 'pm2') throw new Error('Comando base incorrecto');
});

test('Rechazar comando no permitido', () => {
    try {
        security.createSafeCommand('rm', { action: '-rf' });
        throw new Error('Debería rechazar comando peligroso');
    } catch (e) {
        if (!e.message.includes('no permitido')) throw e;
    }
});

// Resumen
console.log('\n=== Resumen de Pruebas ===');
console.log(`✅ Pasadas: ${passed}`);
console.log(`❌ Fallidas: ${failed}`);
console.log(`📊 Total: ${passed + failed}`);

if (failed > 0) {
    console.log('\n⚠️  Algunas pruebas fallaron. Revisa los errores arriba.');
    process.exit(1);
} else {
    console.log('\n🎉 ¡Todas las pruebas pasaron!');
    
    // Limpiar logs de prueba
    setTimeout(() => {
        console.log('\n🧹 Limpiando archivos de prueba...');
        const fs = require('fs');
        try {
            if (fs.existsSync('./logs')) {
                const files = fs.readdirSync('./logs');
                files.forEach(file => {
                    if (file.includes('app-') && file.endsWith('.log')) {
                        fs.unlinkSync(`./logs/${file}`);
                    }
                });
            }
        } catch (e) {
            // Ignorar errores de limpieza
        }
        console.log('✅ Limpieza completada');
    }, 1000);
}