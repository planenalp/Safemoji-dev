/**
 * cipher.js - Encryption and decoding utilities
 * Supports handling non-Latin1 characters (emoji, Unicode)
 * Compatible with both browser and Node.js environments
 */

// Cipher module that supports both browser and Node.js
const Cipher = (function() {
    // Check if Web Crypto API is available
    const hasWebCrypto = typeof window !== 'undefined' && 
                         window.crypto && 
                         window.crypto.subtle;
    
    // Flag to track if we're using native or fallback implementation
    let usingNativeCrypto = hasWebCrypto;
    
    // Fallback noble-ciphers reference (will be populated if needed)
    let nobleCiphers = null;
    
    /**
     * Load the noble-ciphers library if Web Crypto API is not available
     * @returns {Promise} Resolves when noble-ciphers is loaded
     */
    async function loadFallbackLibrary() {
        if (hasWebCrypto) return Promise.resolve();
        
        if (typeof window !== 'undefined') {
            // Browser environment - load via script tag
            return new Promise((resolve, reject) => {
                console.warn('Web Crypto API not available, loading noble-ciphers fallback');
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/@noble/ciphers@0.3.0/dist/index.min.js';
                script.onload = () => {
                    nobleCiphers = window.nobleCiphers;
                    console.info('noble-ciphers loaded successfully');
                    resolve();
                };
                script.onerror = () => {
                    reject(new Error('Failed to load noble-ciphers library'));
                };
                document.head.appendChild(script);
            });
        } else {
            // Node.js environment
            try {
                nobleCiphers = require('@noble/ciphers');
                return Promise.resolve();
            } catch (err) {
                console.error('Please install @noble/ciphers: npm install @noble/ciphers');
                return Promise.reject(new Error('noble-ciphers not installed in Node.js environment'));
            }
        }
    }
    
    /**
     * Converts a string to Uint8Array using TextEncoder (handles Unicode properly)
     * @param {string} str - The string to convert
     * @returns {Uint8Array} The encoded bytes
     */
    function stringToBytes(str) {
        return new TextEncoder().encode(str);
    }
    
    /**
     * Converts Uint8Array to string using TextDecoder (handles Unicode properly)
     * @param {Uint8Array} bytes - The bytes to convert
     * @returns {string} The decoded string
     */
    function bytesToString(bytes) {
        return new TextDecoder().decode(bytes);
    }
    
    /**
     * Derives an encryption key from a password
     * @param {string} password - The password to derive key from
     * @param {Uint8Array} salt - The salt for key derivation
     * @returns {Promise<CryptoKey>} The derived key
     */
    async function deriveKey(password, salt) {
        if (usingNativeCrypto) {
            // Use Web Crypto API
            const passwordBytes = stringToBytes(password || 'default-password');
            const baseKey = await window.crypto.subtle.importKey(
                'raw',
                passwordBytes,
                { name: 'PBKDF2' },
                false,
                ['deriveKey']
            );
            
            return window.crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                baseKey,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
        } else {
            // Use noble-ciphers
            const passwordBytes = stringToBytes(password || 'default-password');
            // Note: noble-ciphers has different API - this is just a placeholder
            // Actual implementation would depend on noble-ciphers specifics
            return nobleCiphers.pbkdf2(passwordBytes, salt, {
                c: 100000,
                dkLen: 32
            });
        }
    }
    
    /**
     * Generates a random initialization vector (IV)
     * @returns {Uint8Array} Random IV
     */
    function generateIV() {
        if (usingNativeCrypto) {
            return window.crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for AES-GCM
        } else {
            // Fallback for environments without crypto.getRandomValues
            return nobleCiphers.utils.randomBytes(12);
        }
    }
    
    /**
     * Encrypts text using AES-256-GCM
     * @param {string} text - The text to encrypt
     * @param {string} password - The password to use
     * @returns {Promise<string>} Base64-encoded encrypted data
     */
    async function encryptAES(text, password) {
        try {
            // Ensure fallback library is loaded if needed
            if (!hasWebCrypto) {
                await loadFallbackLibrary();
                usingNativeCrypto = false;
            }
            
            const iv = generateIV();
            const salt = usingNativeCrypto ? 
                window.crypto.getRandomValues(new Uint8Array(16)) : 
                nobleCiphers.utils.randomBytes(16);
            
            const data = stringToBytes(text);
            
            if (usingNativeCrypto) {
                // Web Crypto API implementation
                const key = await deriveKey(password, salt);
                
                const encryptedBuffer = await window.crypto.subtle.encrypt(
                    { name: 'AES-GCM', iv },
                    key,
                    data
                );
                
                // Combine salt + iv + ciphertext into a single array
                const encryptedArray = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength);
                encryptedArray.set(salt, 0);
                encryptedArray.set(iv, salt.length);
                encryptedArray.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);
                
                // Convert to Base64
                return btoa(String.fromCharCode.apply(null, encryptedArray));
            } else {
                // noble-ciphers implementation
                const key = await deriveKey(password, salt);
                
                // Note: This is a placeholder - actual noble-ciphers API might differ
                const cipher = nobleCiphers.aes.gcm.encrypt(data, key, iv);
                
                // Combine salt + iv + ciphertext into a single array
                const encryptedArray = new Uint8Array(salt.length + iv.length + cipher.length);
                encryptedArray.set(salt, 0);
                encryptedArray.set(iv, salt.length);
                encryptedArray.set(cipher, salt.length + iv.length);
                
                // Convert to Base64
                return btoa(String.fromCharCode.apply(null, encryptedArray));
            }
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Encryption failed: ' + error.message);
        }
    }
    
    /**
     * Decrypts AES-256-GCM encrypted text
     * @param {string} encryptedBase64 - Base64-encoded encrypted data
     * @param {string} password - The password to use
     * @returns {Promise<string>} Decrypted text
     */
    async function decryptAES(encryptedBase64, password) {
        try {
            // Ensure fallback library is loaded if needed
            if (!hasWebCrypto) {
                await loadFallbackLibrary();
                usingNativeCrypto = false;
            }
            
            // Convert from Base64 to Uint8Array
            const encryptedBytes = new Uint8Array(
                atob(encryptedBase64).split('').map(char => char.charCodeAt(0))
            );
            
            // Extract salt, IV and ciphertext
            const salt = encryptedBytes.slice(0, 16);
            const iv = encryptedBytes.slice(16, 28);
            const ciphertext = encryptedBytes.slice(28);
            
            if (usingNativeCrypto) {
                // Web Crypto API implementation
                const key = await deriveKey(password, salt);
                
                const decryptedBuffer = await window.crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv },
                    key,
                    ciphertext
                );
                
                // Convert the decrypted buffer to a string
                return bytesToString(new Uint8Array(decryptedBuffer));
            } else {
                // noble-ciphers implementation
                const key = await deriveKey(password, salt);
                
                // Note: This is a placeholder - actual noble-ciphers API might differ
                const decrypted = nobleCiphers.aes.gcm.decrypt(ciphertext, key, iv);
                
                // Convert decrypted bytes to string
                return bytesToString(decrypted);
            }
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Decryption failed: ' + error.message);
        }
    }
    
    /**
     * Encrypts text using ChaCha20-Poly1305
     * @param {string} text - The text to encrypt
     * @param {string} password - The password to use
     * @returns {Promise<string>} Base64-encoded encrypted data
     */
    async function encryptChaCha(text, password) {
        try {
            // ChaCha20-Poly1305 is not natively supported in Web Crypto API
            // Always use noble-ciphers for ChaCha20-Poly1305
            await loadFallbackLibrary();
            usingNativeCrypto = false;
            
            const data = stringToBytes(text);
            const iv = nobleCiphers.utils.randomBytes(12);
            const salt = nobleCiphers.utils.randomBytes(16);
            
            // Derive key
            const key = await deriveKey(password, salt);
            
            // Encrypt data
            // Note: This is a placeholder - actual noble-ciphers API might differ
            const cipher = nobleCiphers.chacha.poly1305.encrypt(data, key, iv);
            
            // Combine salt + iv + ciphertext into a single array
            const encryptedArray = new Uint8Array(salt.length + iv.length + cipher.length);
            encryptedArray.set(salt, 0);
            encryptedArray.set(iv, salt.length);
            encryptedArray.set(cipher, salt.length + iv.length);
            
            // Convert to Base64
            return btoa(String.fromCharCode.apply(null, encryptedArray));
        } catch (error) {
            console.error('ChaCha20-Poly1305 encryption error:', error);
            throw new Error('ChaCha20-Poly1305 encryption failed: ' + error.message);
        }
    }
    
    /**
     * Decrypts ChaCha20-Poly1305 encrypted text
     * @param {string} encryptedBase64 - Base64-encoded encrypted data
     * @param {string} password - The password to use
     * @returns {Promise<string>} Decrypted text
     */
    async function decryptChaCha(encryptedBase64, password) {
        try {
            // ChaCha20-Poly1305 is not natively supported in Web Crypto API
            // Always use noble-ciphers for ChaCha20-Poly1305
            await loadFallbackLibrary();
            usingNativeCrypto = false;
            
            // Convert from Base64 to Uint8Array
            const encryptedBytes = new Uint8Array(
                atob(encryptedBase64).split('').map(char => char.charCodeAt(0))
            );
            
            // Extract salt, IV and ciphertext
            const salt = encryptedBytes.slice(0, 16);
            const iv = encryptedBytes.slice(16, 28);
            const ciphertext = encryptedBytes.slice(28);
            
            // Derive key
            const key = await deriveKey(password, salt);
            
            // Decrypt data
            // Note: This is a placeholder - actual noble-ciphers API might differ
            const decrypted = nobleCiphers.chacha.poly1305.decrypt(ciphertext, key, iv);
            
            // Convert decrypted bytes to string
            return bytesToString(decrypted);
        } catch (error) {
            console.error('ChaCha20-Poly1305 decryption error:', error);
            throw new Error('ChaCha20-Poly1305 decryption failed: ' + error.message);
        }
    }
    
    /**
     * Encodes data as Base64
     * @param {string} text - Text to encode
     * @returns {string} Base64 encoded string
     */
    function toBase64(text) {
        try {
            // Use TextEncoder to handle Unicode characters properly
            const bytes = stringToBytes(text);
            // Convert bytes to Base64
            return btoa(String.fromCharCode.apply(null, bytes));
        } catch (error) {
            console.error('Base64 encoding error:', error);
            throw new Error('Base64 encoding failed: ' + error.message);
        }
    }
    
    /**
     * Decodes Base64 data
     * @param {string} base64 - Base64 encoded string
     * @returns {string} Decoded text
     */
    function fromBase64(base64) {
        try {
            // Convert Base64 to bytes
            const bytes = new Uint8Array(
                atob(base64).split('').map(char => char.charCodeAt(0))
            );
            // Use TextDecoder to handle Unicode characters properly
            return bytesToString(bytes);
        } catch (error) {
            console.error('Base64 decoding error:', error);
            throw new Error('Base64 decoding failed: ' + error.message);
        }
    }
    
    // Higher level functions that match the UI
    async function encrypt(text, password, algorithm, encoding) {
        // First encrypt the text
        let encrypted;
        if (algorithm === 'AES-256-GCM') {
            encrypted = await encryptAES(text, password);
        } else if (algorithm === 'ChaCha20-Poly1305') {
            encrypted = await encryptChaCha(text, password);
        } else {
            throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
        }
        
        // Then encode it if needed
        if (encoding === 'Base64') {
            return encrypted; // Already Base64 encoded
        } else {
            // For other Base* encodings, we'll need custom implementation
            // This is placeholder - would need actual implementations for Base128, etc.
            console.warn(`${encoding} encoding is not fully implemented, using Base64`);
            return encrypted;
        }
    }
    
    async function decrypt(encryptedText, password, algorithm, encoding) {
        // First decode if needed (though we're primarily using Base64)
        let decoded = encryptedText;
        // Add any custom decoding here if needed
        
        // Then decrypt
        if (algorithm === 'AES-256-GCM') {
            return await decryptAES(decoded, password);
        } else if (algorithm === 'ChaCha20-Poly1305') {
            return await decryptChaCha(decoded, password);
        } else {
            throw new Error(`Unsupported decryption algorithm: ${algorithm}`);
        }
    }
    
    // Public API
    return {
        // Initialization and status
        isWebCryptoSupported: hasWebCrypto,
        initialize: loadFallbackLibrary,
        
        // Core encryption functions
        encrypt,
        decrypt,
        
        // Specialized functions
        encryptAES,
        decryptAES,
        encryptChaCha,
        decryptChaCha,
        
        // Encoding functions
        toBase64,
        fromBase64,
        
        // Utility functions
        stringToBytes,
        bytesToString
    };
})();

// If we're in a browser, attach to window
if (typeof window !== 'undefined') {
    window.Cipher = Cipher;
}

// If we're in Node.js, export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Cipher;
} 