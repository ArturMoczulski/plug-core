export interface ILogger {
  log(message: any, context?: string): void;
  warn(message: any, context?: string): void;
  error(message: any, trace?: string, context?: string): void;
}

/**
 * Default logger implementation using the console.
 */
export class Logger implements ILogger {
  log(message: any, context?: string): void {
    if (context) {
      console.log(`[${context}]`, message);
    } else {
      console.log(message);
    }
  }
  warn(message: any, context?: string): void {
    if (context) {
      console.warn(`[${context}]`, message);
    } else {
      console.warn(message);
    }
  }
  error(message: any, trace?: string, context?: string): void {
    if (context) {
      console.error(`[${context}]`, message, trace);
    } else {
      console.error(message, trace);
    }
  }
  verbose(message: any, trace?: string, context?: string): void {
    if (context) {
      console.info(`[${context}]`, message, trace);
    } else {
      console.info(message, trace);
    }
  }
  debug(message: any, trace?: string, context?: string): void {
    if (context) {
      console.debug(`[${context}]`, message, trace);
    } else {
      console.debug(message, trace);
    }
  }
}
