/**
 * Manages JSME (Java Script Molecule Editor) instance
 */
export class JSMEManager {
    constructor() {
        this.jsmeApplet = null;
        this.containerId = null;
        this.isInitialized = false;
    }

    /**
     * Initialize JSME in the specified container
     * @param {string} containerId - ID of the container element
     */
    init(containerId) {
        if (this.isInitialized && this.containerId === containerId) return Promise.resolve();

        this.containerId = containerId;

        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds timeout

            const checkAndInit = () => {
                if (typeof window.JSApplet === 'undefined') {
                    attempts++;
                    if (attempts >= maxAttempts) {
                        console.error('JSME script failed to load after timeout');
                        reject(new Error('JSME script load timeout'));
                        return;
                    }
                    console.warn(`JSME script not loaded yet, retrying... (${attempts}/${maxAttempts})`);
                    setTimeout(checkAndInit, 100);
                    return;
                }

                try {
                    this.jsmeApplet = new window.JSApplet.JSME(containerId, "100%", "100%", {
                        "options": "newlook,guicolor=#333333,atommovebutton"
                    });
                    this.isInitialized = true;
                    console.log('JSME initialized');
                    resolve();
                } catch (e) {
                    console.error('Failed to initialize JSME:', e);
                    reject(e);
                }
            };

            checkAndInit();
        });
    }

    /**
     * Set molecule in JSME
     * @param {string} molBlock - V2000 MolBlock or JME string
     */
    setMol(molBlock) {
        if (this.jsmeApplet) {
            if (!molBlock || molBlock.trim() === '') {
                this.jsmeApplet.reset();
            } else {
                this.jsmeApplet.readMolFile(molBlock);
            }
        }
    }

    /**
     * Get molecule from JSME as MolBlock
     * @returns {string} MolBlock
     */
    getMol() {
        if (this.jsmeApplet) {
            return this.jsmeApplet.molFile();
        }
        return '';
    }

    /**
     * Get molecule from JSME as JME string
     * @returns {string} JME string
     */
    getJME() {
        if (this.jsmeApplet) {
            return this.jsmeApplet.jmeFile();
        }
        return '';
    }

    /**
     * Get molecule from JSME as SMILES
     * @returns {string} SMILES string
     */
    getSMILES() {
        if (this.jsmeApplet) {
            return this.jsmeApplet.smiles();
        }
        return '';
    }
}

export const jsmeManager = new JSMEManager();
