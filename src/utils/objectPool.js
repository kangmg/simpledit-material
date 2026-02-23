import * as THREE from 'three';

/**
 * Object pool for THREE.Vector3 to reduce garbage collection
 * Reuses Vector3 instances instead of creating new ones
 */
export class Vector3Pool {
    constructor(size = 100) {
        this.pool = [];
        this.index = 0;

        // Pre-allocate vectors
        for (let i = 0; i < size; i++) {
            this.pool.push(new THREE.Vector3());
        }
    }

    /**
     * Get a vector from the pool
     * @returns {THREE.Vector3} Reusable vector (reset to 0,0,0)
     */
    get() {
        const v = this.pool[this.index];
        this.index = (this.index + 1) % this.pool.length;
        return v.set(0, 0, 0);
    }

    /**
     * Get a vector and set its values
     * @param {number} x 
     * @param {number} y 
     * @param {number} z 
     * @returns {THREE.Vector3}
     */
    getSet(x, y, z) {
        const v = this.pool[this.index];
        this.index = (this.index + 1) % this.pool.length;
        return v.set(x, y, z);
    }

    /**
     * Resize pool
     * @param {number} newSize 
     */
    resize(newSize) {
        if (newSize > this.pool.length) {
            const toAdd = newSize - this.pool.length;
            for (let i = 0; i < toAdd; i++) {
                this.pool.push(new THREE.Vector3());
            }
        }
    }
}

// Singleton instance for global use
export const vectorPool = new Vector3Pool(100);
