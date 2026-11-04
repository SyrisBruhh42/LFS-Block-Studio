import * as THREE from 'three';

/**
 * DropPodVoxelMesh represents a stylized 2.5D isometric voxel-box drop-pod model.
 * It features a main body, opening doors, and thruster vents.
 */
export class DropPodVoxelMesh extends THREE.Group {
  public mainBody: THREE.Mesh;
  public doors: { left: THREE.Mesh; right: THREE.Mesh };
  public thrusterVents: THREE.Mesh[];
  
  private doorMaterial: THREE.MeshBasicMaterial;
  private ventMaterial: THREE.MeshBasicMaterial;

  constructor() {
    super();

    // Materials
    const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x4a4a4a });
    this.doorMaterial = new THREE.MeshBasicMaterial({ color: 0x888888 });
    this.ventMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red for active, off by default? Let's make it orange when active.
    
    // Main Body
    const bodyGeo = new THREE.BoxGeometry(2, 3, 2);
    this.mainBody = new THREE.Mesh(bodyGeo, bodyMaterial);
    this.add(this.mainBody);

    // Doors
    const doorGeo = new THREE.BoxGeometry(1, 2.5, 0.2);
    this.doors = {
      left: new THREE.Mesh(doorGeo, this.doorMaterial),
      right: new THREE.Mesh(doorGeo, this.doorMaterial),
    };
    
    // Position doors initially closed
    this.doors.left.position.set(-0.5, 0, 1.05);
    this.doors.right.position.set(0.5, 0, 1.05);
    
    this.add(this.doors.left);
    this.add(this.doors.right);

    // Thruster Vents
    const ventGeo = new THREE.BoxGeometry(0.5, 0.2, 0.5);
    this.thrusterVents = [
      new THREE.Mesh(ventGeo, this.ventMaterial),
      new THREE.Mesh(ventGeo, this.ventMaterial),
      new THREE.Mesh(ventGeo, this.ventMaterial),
      new THREE.Mesh(ventGeo, this.ventMaterial),
    ];
    
    // Position thrusters at the bottom
    this.thrusterVents[0].position.set(-0.6, -1.6, -0.6);
    this.thrusterVents[1].position.set(0.6, -1.6, -0.6);
    this.thrusterVents[2].position.set(-0.6, -1.6, 0.6);
    this.thrusterVents[3].position.set(0.6, -1.6, 0.6);
    
    this.thrusterVents.forEach(vent => {
      // Initially inactive color
      (vent.material as THREE.MeshBasicMaterial).color.setHex(0x333333);
      this.add(vent);
    });
  }

  /**
   * Opens or closes the doors based on the progress.
   * @param progress 0.0 means fully closed, 1.0 means fully open.
   */
  public openDoors(progress: number): void {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    
    // Move doors sideways to open
    // Closed: left=-0.5, right=0.5
    // Open: left=-1.2, right=1.2
    const openOffset = 0.7;
    
    this.doors.left.position.x = -0.5 - (openOffset * clampedProgress);
    this.doors.right.position.x = 0.5 + (openOffset * clampedProgress);
  }

  /**
   * Activates or deactivates the thruster vents.
   * @param active True to animate/activate thrusters, false to deactivate.
   */
  public animateThrusters(active: boolean): void {
    const activeColor = 0xffaa00; // Orange/Yellow flame color
    const inactiveColor = 0x333333; // Dark grey
    
    const color = active ? activeColor : inactiveColor;
    
    this.thrusterVents.forEach(vent => {
      (vent.material as THREE.MeshBasicMaterial).color.setHex(color);
      
      // Optionally add some scaling to simulate thruster firing
      if (active) {
        vent.scale.set(1.2, 1.5, 1.2);
      } else {
        vent.scale.set(1, 1, 1);
      }
    });
  }
}
