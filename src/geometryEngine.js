import * as THREE from 'three';

export class GeometryEngine {
    /**
     * Calculate distance between two points
     * @param {THREE.Vector3} p1 
     * @param {THREE.Vector3} p2 
     * @returns {number} Distance in Angstroms
     */
    static calculateDistance(p1, p2) {
        return p1.distanceTo(p2);
    }

    /**
     * Calculate angle between three points (p1-p2-p3)
     * @param {THREE.Vector3} p1 
     * @param {THREE.Vector3} p2 Vertex
     * @param {THREE.Vector3} p3 
     * @returns {number} Angle in degrees
     */
    static calculateAngle(p1, p2, p3) {
        const v1 = p1.clone().sub(p2);
        const v2 = p3.clone().sub(p2);
        return v1.angleTo(v2) * (180 / Math.PI);
    }

    /**
     * Calculate dihedral angle (p1-p2-p3-p4)
     * @param {THREE.Vector3} p1 
     * @param {THREE.Vector3} p2 
     * @param {THREE.Vector3} p3 
     * @param {THREE.Vector3} p4 
     * @returns {number} Dihedral angle in degrees
     */
    static calculateDihedral(p1, p2, p3, p4) {
        const b1 = p2.clone().sub(p1);
        const b2 = p3.clone().sub(p2);
        const b3 = p4.clone().sub(p3);

        const n1 = b1.clone().cross(b2).normalize();
        const n2 = b2.clone().cross(b3).normalize();
        const m1 = n1.clone().cross(b2.clone().normalize());

        const x = n1.dot(n2);
        const y = m1.dot(n2);

        return Math.atan2(y, x) * (180 / Math.PI);
    }

    /**
     * Calculate new positions for bond length adjustment
     * Moves 'movingAtoms' to satisfy target distance between atom1 and atom2
     * @param {THREE.Vector3} pos1 Position of fixed atom
     * @param {THREE.Vector3} pos2 Position of moving atom (pivot)
     * @param {THREE.Vector3[]} movingAtomPositions Positions of all atoms to move (including pos2)
     * @param {number} targetDist Target distance
     * @returns {THREE.Vector3[]} New positions for moving atoms
     */
    static getNewPositionsForBondLength(pos1, pos2, movingAtomPositions, targetDist) {
        const currentDist = pos1.distanceTo(pos2);
        if (currentDist < 0.0001) return movingAtomPositions; // Avoid division by zero

        const direction = pos2.clone().sub(pos1).normalize();
        const offset = direction.multiplyScalar(targetDist - currentDist);

        return movingAtomPositions.map(pos => pos.clone().add(offset));
    }

    /**
     * Calculate new positions for bond angle adjustment
     * Rotates 'movingAtoms' around axis (pivot-normal) to satisfy target angle p1-pivot-p3
     * @param {THREE.Vector3} p1 Fixed atom position
     * @param {THREE.Vector3} pivot Pivot atom position (vertex)
     * @param {THREE.Vector3} p3 Moving atom position (defines current angle)
     * @param {THREE.Vector3[]} movingAtomPositions Atoms to rotate
     * @param {number} targetAngleDegrees Target angle in degrees
     * @returns {THREE.Vector3[]} New positions
     */
    static getNewPositionsForAngle(p1, pivot, p3, movingAtomPositions, targetAngleDegrees) {
        const v1 = p1.clone().sub(pivot).normalize();
        const v2 = p3.clone().sub(pivot).normalize();

        // Axis of rotation: perpendicular to the plane defined by v1 and v2
        let axis = v1.clone().cross(v2).normalize();
        if (axis.lengthSq() < 0.0001) {
            // Collinear: arbitrary axis perpendicular to v1
            if (Math.abs(v1.x) < 0.9) axis = new THREE.Vector3(1, 0, 0).cross(v1).normalize();
            else axis = new THREE.Vector3(0, 1, 0).cross(v1).normalize();
        }

        const currentAngle = v1.angleTo(v2);
        const targetAngle = targetAngleDegrees * (Math.PI / 180);
        const deltaAngle = targetAngle - currentAngle;

        const quaternion = new THREE.Quaternion();
        quaternion.setFromAxisAngle(axis, deltaAngle);

        return movingAtomPositions.map(pos => {
            const local = pos.clone().sub(pivot);
            local.applyQuaternion(quaternion);
            return local.add(pivot);
        });
    }

    /**
     * Calculate new positions for dihedral angle adjustment
     * Rotates 'movingAtoms' around axis p2-p3
     * @param {THREE.Vector3} p1 
     * @param {THREE.Vector3} p2 Axis start
     * @param {THREE.Vector3} p3 Axis end
     * @param {THREE.Vector3} p4 
     * @param {THREE.Vector3[]} movingAtomPositions Atoms to rotate
     * @param {number} targetDihedralDegrees Target dihedral
     * @returns {THREE.Vector3[]} New positions
     */
    static getNewPositionsForDihedral(p1, p2, p3, p4, movingAtomPositions, targetDihedralDegrees) {
        const currentDihedral = this.calculateDihedral(p1, p2, p3, p4);
        let delta = targetDihedralDegrees - currentDihedral;

        // Normalize delta to [-180, 180] for shortest path rotation
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;

        // CRITICAL: Negate delta because quaternion rotation direction is opposite to dihedral angle convention
        const deltaRad = -delta * (Math.PI / 180);

        // Axis is the bond from p2 to p3
        const axis = p3.clone().sub(p2).normalize();
        const quaternion = new THREE.Quaternion();
        quaternion.setFromAxisAngle(axis, deltaRad);

        // Use p3 as pivot - we're rotating atoms attached to p3 around the p2-p3 axis
        const pivot = p3;

        return movingAtomPositions.map(pos => {
            const local = pos.clone().sub(pivot);
            local.applyQuaternion(quaternion);
            return local.add(pivot);
        });
    }

    /**
     * Calculate center of mass of atoms
     * @param {Object[]} atoms Array of atom objects with position property
     * @returns {THREE.Vector3} Center of mass
     */
    static getCenterOfMass(atoms) {
        const center = new THREE.Vector3(0, 0, 0);
        if (atoms.length === 0) return center;

        atoms.forEach(atom => {
            center.add(atom.position);
        });
        center.divideScalar(atoms.length);
        return center;
    }

    /**
     * Get positions rotated by Euler angles (degrees) around (0,0,0)
     * @param {THREE.Vector3[]} positions 
     * @param {number} xDeg 
     * @param {number} yDeg 
     * @param {number} zDeg 
     * @returns {THREE.Vector3[]}
     */
    static getRotatedPositions(positions, xDeg, yDeg, zDeg) {
        const euler = new THREE.Euler(
            xDeg * Math.PI / 180,
            yDeg * Math.PI / 180,
            zDeg * Math.PI / 180,
            'XYZ'
        );

        return positions.map(pos => {
            return pos.clone().applyEuler(euler);
        });
    }

    /**
     * Get translated positions
     * @param {THREE.Vector3[]} positions 
     * @param {number} x 
     * @param {number} y 
     * @param {number} z 
     * @returns {THREE.Vector3[]}
     */
    static getTranslatedPositions(positions, x, y, z) {
        const offset = new THREE.Vector3(x, y, z);
        return positions.map(pos => pos.clone().add(offset));
    }

    /**
     * Calculate smart offset to avoid overlap
     * @param {Object[]} incomingAtoms Atoms to add
     * @param {Object[]} currentAtoms Existing atoms
     * @param {number} minDistance Minimum distance required
     * @returns {THREE.Vector3} Offset vector
     */
    static calculateSmartOffset(incomingAtoms, currentAtoms, minDistance) {
        if (minDistance <= 0) return new THREE.Vector3(0, 0, 0);
        if (currentAtoms.length === 0 || incomingAtoms.length === 0) return new THREE.Vector3(0, 0, 0);

        let offsetZ = 0;
        const step = 3.0; // Shift by 3 units at a time
        const maxSteps = 50; // Prevent infinite loop

        for (let i = 0; i < maxSteps; i++) {
            let collision = false;
            const currentOffset = new THREE.Vector3(0, 0, offsetZ);

            for (const incAtom of incomingAtoms) {
                const incPos = incAtom.position.clone().add(currentOffset);
                for (const curAtom of currentAtoms) {
                    if (incPos.distanceTo(curAtom.position) < minDistance) {
                        collision = true;
                        break;
                    }
                }
                if (collision) break;
            }

            if (!collision) {
                return currentOffset;
            }

            offsetZ += step;
        }

        return new THREE.Vector3(0, 0, offsetZ);
    }
    /**
     * Calculate alignment transform (Rotation only)
     * Aligns Source Vector (Anchor -> Leaving) to be Anti-Parallel to Target Vector (Anchor -> Leaving)
     * @param {THREE.Vector3} targetAnchor 
     * @param {THREE.Vector3} targetLeaving 
     * @param {THREE.Vector3} sourceAnchor 
     * @param {THREE.Vector3} sourceLeaving 
     * @returns {{rotation: THREE.Quaternion}}
     */
    static getAlignmentTransform(targetAnchor, targetLeaving, sourceAnchor, sourceLeaving) {
        const targetVec = targetLeaving.clone().sub(targetAnchor).normalize();
        const sourceVec = sourceLeaving.clone().sub(sourceAnchor).normalize();

        // We want sourceVec to point in the OPPOSITE direction of targetVec
        // So we rotate sourceVec to -targetVec
        const desiredDir = targetVec.clone().negate();

        const quaternion = new THREE.Quaternion().setFromUnitVectors(sourceVec, desiredDir);

        return { rotation: quaternion };
    }
}
