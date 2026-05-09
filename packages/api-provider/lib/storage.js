'use client';

const REMEMBER_KEY = '__rememberMe';

function getStore() {
    try {
        if (localStorage.getItem(REMEMBER_KEY) === '1') return localStorage;
        if (sessionStorage.getItem(REMEMBER_KEY) === '1') return sessionStorage;
        // Backward compat: if auth data exists in localStorage from before
        // the remember-me feature, keep using localStorage until next login
        if (localStorage.getItem('jwt')) return localStorage;
    } catch (_) {}
    // Default to sessionStorage when no preference is set (short-lived session)
    return sessionStorage;
}

function buildWrapper() {

    const wrapper = {

        /**
         * Switch between persistent (localStorage) and ephemeral (sessionStorage).
         * When rememberMe is true, auth data survives browser restarts.
         * When false, auth data is cleared when the browser tab/window is closed.
         */
        setRememberMe: function (remember) {
            const prev = getStore();
            const target = remember ? localStorage : sessionStorage;

            if (prev !== target) {
                // Migrate existing auth keys to the new store
                const keys = ['jwt', 'refreshToken', 'user', 'role', 'appAccess', 'adminAppAccess', 'permissions'];
                keys.forEach(key => {
                    const val = prev.getItem(key);
                    if (val !== null) {
                        target.setItem(key, val);
                    }
                    prev.removeItem(key);
                });
            }

            // Clear the flag from the store we're moving away from
            localStorage.removeItem(REMEMBER_KEY);
            sessionStorage.removeItem(REMEMBER_KEY);
            target.setItem(REMEMBER_KEY, '1');
        },

        getRememberMe: function () {
            try {
                return localStorage.getItem(REMEMBER_KEY) === '1';
            } catch (_) {
                return false;
            }
        },

        setItem: function (key, value) {

            //console.debug(`[storage] setItem called with key: ${key}, value: ${value}`);
            const s = getStore();
            if (typeof value != 'undefined') {
                s.setItem(key, value);
            } else {
                s.removeItem(key);
            }
        },

        getItem: function (key) {
           // console.debug(`[storage] getItem called with key: ${key}`);
            const item = getStore().getItem(key);
            return item ?? null;
        },

        getJSON: function (key) {
          //  console.debug(`[storage] getJSON called with key: ${key}`);
            const item = getStore().getItem(key);
            return item ? JSON.parse(item) : null;
        },
        setJSON: function (key, value) {
           // console.debug(`[storage] setJSON called with key: ${key}, value:`, value);
            const s = getStore();
            if (typeof value != 'undefined') {
                const item = JSON.stringify(value);
                s.setItem(key, item);
            } else {
                s.removeItem(key);
            }
        },
        removeItem: function (key) {
          //  console.debug(`[storage] removeItem called with key: ${key}`);
            getStore().removeItem(key);
        }
    };
    return wrapper;
}

const storage = buildWrapper();

export default storage;
export { buildWrapper, storage };
