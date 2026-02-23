/**
 * Centralized error handling utility
 * Provides consistent error/success response format across the application
 */
export class ErrorHandler {
    /**
     * Create a standard error response
     * @param {string} message - User-friendly error message
     * @param {*} details - Optional error details for debugging
     * @returns {Object} Error response object
     */
    static error(message, details = null) {
        const response = {
            error: message
        };

        if (details && import.meta.env.DEV) {
            response.details = details;
        }

        return response;
    }

    /**
     * Create a standard success response
     * @param {string} message - Success message
     * @param {*} data - Optional data to return
     * @returns {Object} Success response object
     */
    static success(message, data = null) {
        const response = {
            success: message
        };

        if (data !== null) {
            response.data = data;
        }

        return response;
    }

    /**
     * Create a warning response
     * @param {string} message - Warning message
     * @returns {Object} Warning response object
     */
    static warning(message) {
        return { warning: message };
    }

    /**
     * Create an info response
     * @param {string} message - Info message
     * @returns {Object} Info response object
     */
    static info(message) {
        return { info: message };
    }

    /**
     * Log error to console (development only)
     * @param {string} context - Context where error occurred
     * @param {Error|string} error - Error to log
     */
    static logError(context, error) {
        if (import.meta.env.DEV) {
            console.error(`[${context}]`, error);
        }
    }

    /**
     * Validate required parameters
     * @param {Object} params - Parameters to validate
     * @param {string[]} required - Required parameter names
     * @returns {Object|null} Error response if validation fails, null otherwise
     */
    static validateParams(params, required) {
        for (const key of required) {
            if (params[key] === undefined || params[key] === null) {
                return this.error(`Missing required parameter: ${key}`);
            }
        }
        return null;
    }

    /**
     * Validate numeric value
     * @param {*} value - Value to validate
     * @param {string} name - Parameter name for error message
     * @returns {Object|null} Error response if validation fails, null otherwise
     */
    static validateNumber(value, name = 'value') {
        if (isNaN(value)) {
            return this.error(`Invalid ${name}: must be a number`);
        }
        return null;
    }

    /**
     * Validate positive number
     * @param {*} value - Value to validate
     * @param {string} name - Parameter name for error message
     * @returns {Object|null} Error response if validation fails, null otherwise
     */
    static validatePositive(value, name = 'value') {
        const numError = this.validateNumber(value, name);
        if (numError) return numError;

        if (value <= 0) {
            return this.error(`Invalid ${name}: must be positive`);
        }
        return null;
    }
}
