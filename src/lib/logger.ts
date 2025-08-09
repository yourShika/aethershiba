import chalk from 'chalk';

type ColorFn = (s: string) => string;


// Get Time and Date for Console Logging
function timestamp() {
    const now = new Date();

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    const yyyy = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');

    return chalk.gray(`[${hh}:${mm}:${ss}] [${yyyy}:${month}:${dd}]`);
}

function log(level: 'INFO' | 'WARN' | 'ERROR', color: ColorFn, ...args: unknown[]) {
  console.log(`${timestamp()} [${color(level)}]`, ...args);
}

export const logger = {
    info: (...args: unknown[]) => log('INFO', chalk.green, ...args),
    warn: (...args: unknown[]) => log('WARN', chalk.yellow, ...args),
    error: (...args: unknown[]) => log('ERROR', chalk.red, ...args),
};
