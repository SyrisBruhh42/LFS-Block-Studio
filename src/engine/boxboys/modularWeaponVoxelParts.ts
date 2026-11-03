import * as THREE from 'three';

/**
 * Base interface for modular weapon parts.
 * All parts are expected to be represented as Three.js Groups.
 */
export interface ModularWeaponPart {
  meshGroup: THREE.Group;
}

/**
 * The receiver is the core part of the weapon.
 * It provides attachment points for the barrel, magazine, and optic.
 */
export class VoxelReceiver implements ModularWeaponPart {
  public meshGroup: THREE.Group;

  // Attachment points relative to the receiver's origin
  public barrelAttachmentPoint: THREE.Vector3;
  public magazineAttachmentPoint: THREE.Vector3;
  public opticAttachmentPoint: THREE.Vector3;

  constructor() {
    this.meshGroup = new THREE.Group();
    this.meshGroup.name = "Receiver";

    // Dummy geometry for receiver
    const geometry = new THREE.BoxGeometry(0.2, 0.1, 0.4);
    const material = new THREE.MeshBasicMaterial({ color: 0x555555 });
    const mesh = new THREE.Mesh(geometry, material);
    this.meshGroup.add(mesh);

    // Define attachment points based on standard layout
    this.barrelAttachmentPoint = new THREE.Vector3(0, 0, 0.2);
    this.magazineAttachmentPoint = new THREE.Vector3(0, -0.05, 0);
    this.opticAttachmentPoint = new THREE.Vector3(0, 0.05, 0);
  }
}

/**
 * The barrel part of the weapon, attaches to the front of the receiver.
 */
export class VoxelBarrel implements ModularWeaponPart {
  public meshGroup: THREE.Group;

  constructor() {
    this.meshGroup = new THREE.Group();
    this.meshGroup.name = "Barrel";

    // Dummy geometry for barrel
    const geometry = new THREE.CylinderGeometry(0.02, 0.02, 0.4);
    geometry.rotateX(Math.PI / 2); // align with Z axis
    const material = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const mesh = new THREE.Mesh(geometry, material);

    // Shift mesh so origin is at the back
    mesh.position.set(0, 0, 0.2);
    this.meshGroup.add(mesh);
  }
}

/**
 * The magazine part of the weapon, attaches to the bottom of the receiver.
 */
export class VoxelMagazine implements ModularWeaponPart {
  public meshGroup: THREE.Group;

  constructor() {
    this.meshGroup = new THREE.Group();
    this.meshGroup.name = "Magazine";

    // Dummy geometry for magazine
    const geometry = new THREE.BoxGeometry(0.05, 0.2, 0.1);
    const material = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const mesh = new THREE.Mesh(geometry, material);

    // Shift mesh so origin is at the top
    mesh.position.set(0, -0.1, 0);
    this.meshGroup.add(mesh);
  }
}

/**
 * The optic part of the weapon, attaches to the top of the receiver.
 */
export class VoxelOptic implements ModularWeaponPart {
  public meshGroup: THREE.Group;

  constructor() {
    this.meshGroup = new THREE.Group();
    this.meshGroup.name = "Optic";

    // Dummy geometry for optic
    const geometry = new THREE.BoxGeometry(0.05, 0.05, 0.1);
    const material = new THREE.MeshBasicMaterial({ color: 0x880000 });
    const mesh = new THREE.Mesh(geometry, material);

    // Shift mesh so origin is at the bottom
    mesh.position.set(0, 0.025, 0);
    this.meshGroup.add(mesh);
  }
}

/**
 * Factory class to assemble a complete modular weapon.
 */
export class ModularWeaponBuilder {
  public assembleWeapon(
    receiver: VoxelReceiver,
    barrel: VoxelBarrel,
    magazine: VoxelMagazine,
    optic: VoxelOptic
  ): THREE.Group {
    const weaponGroup = new THREE.Group();
    weaponGroup.name = "ModularWeapon";

    // Add receiver as base
    weaponGroup.add(receiver.meshGroup);

    // Attach barrel
    barrel.meshGroup.position.copy(receiver.barrelAttachmentPoint);
    weaponGroup.add(barrel.meshGroup);

    // Attach magazine
    magazine.meshGroup.position.copy(receiver.magazineAttachmentPoint);
    weaponGroup.add(magazine.meshGroup);

    // Attach optic
    optic.meshGroup.position.copy(receiver.opticAttachmentPoint);
    weaponGroup.add(optic.meshGroup);

    return weaponGroup;
  }
}
