// file: /pos-desk/lib/printStorage.js
// Utility for storing print data temporarily
const PRINT_STORAGE_KEY = 'bulk_print_data';

export const printStorage = {
    storePrintData: (data) => {
        try {
            const storageKey = `${PRINT_STORAGE_KEY}_${Date.now()}`;
            localStorage.setItem(storageKey, JSON.stringify(data));
            return storageKey;
        } catch (error) {
            console.error('Error storing print data:', error);
            return null;
        }
    },

    getPrintData: (key) => {
        try {
            const data = localStorage.getItem(key);
            if (data) {
                localStorage.removeItem(key); // Clean up after reading
                return JSON.parse(data);
            }
            return null;
        } catch (error) {
            console.error('Error retrieving print data:', error);
            return null;
        }
    },

    cleanupOldData: () => {
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(PRINT_STORAGE_KEY)) {
                    // Remove data older than 1 hour
                    const timestamp = parseInt(key.split('_')[2]);
                    if (Date.now() - timestamp > 3600000) {
                        keysToRemove.push(key);
                    }
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch (error) {
            console.error('Error cleaning up print data:', error);
        }
    }
};