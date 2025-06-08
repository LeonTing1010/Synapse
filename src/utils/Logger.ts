export class Logger {
    private static DEBUG = false; // Set to true for development, false for production

    static setDebug(enabled: boolean) {
        this.DEBUG = enabled;
    }

    static log(message: string, ...args: any[]) {
        if (this.DEBUG) {
            console.log(`[Synapse] ${message}`, ...args);
        }
    }

    static warn(message: string, ...args: any[]) {
        if (this.DEBUG) {
            console.warn(`[Synapse] ${message}`, ...args);
        }
    }

    static error(message: string, ...args: any[]) {
        // Always log errors
        console.error(`[Synapse] ${message}`, ...args);
    }

    static info(message: string, ...args: any[]) {
        if (this.DEBUG) {
            console.info(`[Synapse] ${message}`, ...args);
        }
    }

    static debug(message: string, ...args: any[]) {
        if (this.DEBUG) {
            console.log(`[Synapse DEBUG] ${message}`, ...args);
        }
    }
}
