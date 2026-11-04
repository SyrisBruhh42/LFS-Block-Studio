import * as THREE from 'three';

export interface DropPodState {
  doorProgress: number; // 0.0 (closed) to 1.0 (open)
  thrustersActive: boolean;
}

export class DropPodVoxelMesh extends THREE.Group {
  public hull: THREE.Mesh;
  public doors: THREE.Group;
  public leftDoor: THREE.Mesh;
  public rightDoor: THREE.Mesh;
  public thrusterVents: THREE.Mesh[] = [];

  public state: DropPodState = {
    doorProgress: 0,
    thrustersActive: false,
  };

  constructor() {
    super();
    this.name = 'DropPodVoxelMesh';

    // 1. Main Hull (voxel-like box)
    const hullGeometry = new THREE.BoxGeometry(4, 6, 4);
    const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x5a5a5a });
    this.hull = new THREE.Mesh(hullGeometry, hullMaterial);
    this.add(this.hull);

    // 2. Doors (opening mechanism)
    this.doors = new THREE.Group();
    const doorGeometry = new THREE.BoxGeometry(2, 4, 1);
    const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });

    this.leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    // Closed position
    this.leftDoor.position.set(-1, 0, 2);
    this.doors.add(this.leftDoor);

    this.rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    // Closed position
    this.rightDoor.position.set(1, 0, 2);
    this.doors.add(this.rightDoor);

    this.add(this.doors);

    // 3. Thruster Vents
    const ventGeometry = new THREE.BoxGeometry(1, 0.5, 1);
    const ventPositions = [
      new THREE.Vector3(-1, -3.25, -1), // Bottom back left
      new THREE.Vector3(1, -3.25, -1),  // Bottom back right
      new THREE.Vector3(-1, -3.25, 1),  // Bottom front left
      new THREE.Vector3(1, -3.25, 1),   // Bottom front right
    ];

    for (let i = 0; i < ventPositions.length; i++) {
      const ventMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        emissive: 0x000000,
      });
      const vent = new THREE.Mesh(ventGeometry, ventMaterial);
      vent.position.copy(ventPositions[i]);
      this.thrusterVents.push(vent);
      this.add(vent);
    }
  }

  /**
   * Sets the opening progress of the doors.
   * @param progress - A value from 0.0 (fully closed) to 1.0 (fully open)
   */
  public setDoorProgress(progress: number) {
    this.state.doorProgress = Math.max(0, Math.min(1, progress));

    // Animate sliding doors apart
    const maxSlide = 2.0;
    this.leftDoor.position.x = -1 - (maxSlide * this.state.doorProgress);
    this.rightDoor.position.x = 1 + (maxSlide * this.state.doorProgress);
  }

  /**
   * Activates or deactivates the thruster vents (e.g., during orbital descent).
   * @param active - true to activate thrusters (emissive glow), false to deactivate
   */
  public setThrustersActive(active: boolean) {
    this.state.thrustersActive = active;

    // Hex color: vibrant thruster fire vs dark
    const emissiveColor = active ? 0xff4500 : 0x000000;

    for (const vent of this.thrusterVents) {
      if (vent.material instanceof THREE.MeshStandardMaterial) {
        vent.material.emissive.setHex(emissiveColor);
      }
    }
  }
}
