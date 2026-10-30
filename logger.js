const fs = require('fs');
const path = require('path');

class Logger {
  constructor(baseDir) {
    this.baseDir = baseDir || __dirname;
    this.logsDir = path.join(this.baseDir, 'logs');
    this.ensureDir();
  }

  ensureDir() {
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch (e) {
      console.error('[Logger] Failed to create logs directory:', e);
    }
  }

  getTodayStr() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  getTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
  }

  formatEntry(level, source, message, errorObj) {
    const time = this.getTimestamp();
    const src = source ? `[${source}]` : '[App]';
    let text = `[${time}] [${level}] ${src} ${message}`;
    
    if (errorObj) {
      if (errorObj.stack) {
        text += `\nStack: ${errorObj.stack}`;
      } else if (typeof errorObj === 'object') {
        try {
          text += `\nDetails: ${JSON.stringify(errorObj, null, 2)}`;
        } catch (_) {
          text += `\nDetails: ${String(errorObj)}`;
        }
      } else {
        text += `\nDetails: ${String(errorObj)}`;
      }
    }
    return text + '\n';
  }

  writeLog(level, source, message, errorObj) {
    this.ensureDir();
    const entry = this.formatEntry(level, source, message, errorObj);
    
    // 1. Write to daily general log
    const dailyFile = path.join(this.logsDir, `app_${this.getTodayStr()}.log`);
    fs.appendFile(dailyFile, entry, 'utf8', (err) => {
      if (err) console.error('[Logger] Failed to write daily log:', err);
    });

    // 2. If ERROR or WARN, also append to error.log for quick inspection
    if (level === 'ERROR' || level === 'FATAL') {
      const errorFile = path.join(this.logsDir, 'error.log');
      fs.appendFile(errorFile, entry, 'utf8', (err) => {
        if (err) console.error('[Logger] Failed to write error.log:', err);
      });
    }
  }

  info(source, message) {
    console.log(`[INFO] [${source}] ${message}`);
    this.writeLog('INFO', source, message);
  }

  warn(source, message, err) {
    console.warn(`[WARN] [${source}] ${message}`, err || '');
    this.writeLog('WARN', source, message, err);
  }

  error(source, message, err) {
    console.error(`[ERROR] [${source}] ${message}`, err || '');
    this.writeLog('ERROR', source, message, err);
  }

  initProcessHandlers() {
    process.on('uncaughtException', (err) => {
      this.error('MainProcess:uncaughtException', err.message, err);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.error('MainProcess:unhandledRejection', `Promise rejection: ${reason}`, reason);
    });

    this.info('Logger', 'Logging system initialized successfully. Log folder: ' + this.logsDir);
  }
}

module.exports = Logger;
